import type {
  ChesscomAccount,
  ChesscomActiveGame,
  ChesscomChannel,
  ChesscomGameTransport,
  ChesscomGateway,
  ChesscomTicket,
} from '../../domain/chesscom/gateway.js';
import { ChesscomHttp } from './chesscom-http.js';
import { ChesscomRSocketChannel } from './chesscom-channel.js';
import { DEFAULT_TRANSPORT, type LichessTransportOptions } from '../lichess/transport-options.js';
import { LichessRetry } from '../lichess/lichess-retry.js';
import type { Logger } from 'pino';
import { z } from 'zod';

/** Last-resort shard when a game entry carries no transport info (HAR capture). */
export const FALLBACK_CHESSCOM_REGION = 'play-us-2-5';

function gameIdOf(entry: Record<string, unknown>): string | null {
  for (const key of ['id', 'gameId', 'uuid']) {
    const value = entry[key];
    if (typeof value === 'string' && value.length >= 8) return value;
  }
  return null;
}

/**
 * Live-game entries name their shard several ways:
 * `channel: "play-eu-1-5/games/<uuid>"`,
 * `href: "/service/play-eu-1-5/chess/games/<uuid>"` or
 * `transports.rsocket.url`.
 */
export function parseGameRegion(entry: Record<string, unknown>): string | null {
  const transports = entry.transports as Record<string, unknown> | undefined;
  const rsocket = transports?.rsocket as Record<string, unknown> | undefined;
  const rsocketUrl = typeof rsocket?.url === 'string' ? rsocket.url : null;
  if (rsocketUrl) {
    const fromUrl = /\/service\/([^/]+)\/rsocket\/?$/.exec(rsocketUrl)?.[1];
    if (fromUrl) return fromUrl;
    if (!rsocketUrl.includes('/')) return rsocketUrl;
  }
  const channel = entry.channel;
  if (typeof channel === 'string') {
    const region = channel.split('/')[0];
    if (region) return region;
  }
  const href = entry.href;
  if (typeof href === 'string') {
    const region = /\/service\/([^/]+)\//.exec(href)?.[1];
    if (region) return region;
  }
  return null;
}

export function rsocketUrl(region: string | null): string {
  return `wss://www.chess.com/service/${region ?? FALLBACK_CHESSCOM_REGION}/rsocket`;
}

export function wsUrlFor(transport: ChesscomGameTransport): string {
  return transport.wsUrl ?? rsocketUrl(transport.region);
}

/**
 * Reads the live-game transport from a matcher ticket game or an
 * `/service/play/games` entry. The RSocket URL arrives as a relative path
 * (`/service/play-us-2-5/rsocket`) with explicit per-game routes.
 */
export function parseGameTransport(entry: Record<string, unknown>): ChesscomGameTransport {
  const transports = entry.transports as Record<string, unknown> | undefined;
  const rsocket = transports?.rsocket as Record<string, unknown> | undefined;
  const url = typeof rsocket?.url === 'string' ? rsocket.url : null;
  const routes = rsocket?.routes as Record<string, unknown> | undefined;
  const watch = routes && typeof routes.watch === 'string' ? routes.watch : null;
  const move = routes && typeof routes.move === 'string' ? routes.move : null;
  const acknowledgement =
    routes && typeof routes.acknowledgement === 'string' ? routes.acknowledgement : null;
  return {
    wsUrl: url
      ? url.startsWith('ws')
        ? url
        : `wss://www.chess.com${url.startsWith('/') ? '' : '/'}${url}`
      : null,
    region: parseGameRegion(entry),
    routes: watch && move && acknowledgement ? { watch, move, acknowledgement } : null,
  };
}

const ticketGameSchema = z
  .object({
    id: z.string().min(1),
    players: z.array(z.string()).default([]),
    playersDetails: z
      .array(
        z
          .object({ id: z.string(), username: z.string(), rating: z.number().nullish() })
          .passthrough(),
      )
      .default([]),
  })
  .passthrough();

const ticketSchema = z
  .object({
    id: z.string().min(1),
    state: z.string(),
    color: z.string().nullish(),
    game: ticketGameSchema.nullish(),
  })
  .passthrough();

/** Parses a `matcher/tickets/users/:me` pubsub payload (gzip-decoded JSON). */
export function parseTicket(data: unknown): ChesscomTicket | null {
  const parsed = ticketSchema.safeParse(data);
  if (!parsed.success) return null;
  const { id, state, color, game } = parsed.data;
  return {
    seekId: id,
    state,
    color: color === 'white' || color === 'black' ? color : null,
    game: game
      ? {
          id: game.id,
          players: game.players,
          raw: game as Record<string, unknown>,
          transport: parseGameTransport(game as Record<string, unknown>),
        }
      : null,
  };
}

export class WebChesscomGateway implements ChesscomGateway {
  private readonly http: ChesscomHttp;
  private userId?: string;
  constructor(
    private readonly cookie: string,
    private readonly options: LichessTransportOptions = DEFAULT_TRANSPORT,
    private readonly logger?: Logger,
    http?: ChesscomHttp,
  ) {
    const retry = new LichessRetry(options.retry);
    this.http = http ?? new ChesscomHttp(cookie, fetch, options, retry);
  }

  async authenticate(signal: AbortSignal): Promise<ChesscomAccount> {
    this.userId = await this.http.authenticatedUserId(signal);
    return { id: this.userId, username: await this.http.username(this.userId, signal) };
  }

  async activeGames(signal: AbortSignal): Promise<ChesscomActiveGame[]> {
    const games: ChesscomActiveGame[] = [];
    for (const entry of await this.http.activeGames(signal)) {
      const id = gameIdOf(entry);
      if (id)
        games.push({ id, region: parseGameRegion(entry), transport: parseGameTransport(entry), raw: entry });
    }
    return games;
  }

  async seekState(seekId: string, signal: AbortSignal): Promise<string | null> {
    for (const seek of await this.http.seekStates(signal))
      if (seek.id === seekId) return seek.state;
    return null;
  }

  createChannel(transport: ChesscomGameTransport): ChesscomChannel {
    if (!this.userId) throw new Error('Authenticate the chess.com account before opening a game.');
    if (!transport.wsUrl)
      this.logger?.warn(
        'chess.com game entry has no transport URL; falling back to the captured shard',
      );
    return new ChesscomRSocketChannel(
      this.cookie,
      { client: this.http.playClient, userId: this.userId },
      wsUrlFor(transport),
      this.options,
      undefined,
      this.logger,
      transport.routes,
    );
  }

  async seek(pool: string, signal: AbortSignal): Promise<{ id: string; state: string | null }> {
    const seek = await this.http.seek(pool as never, signal);
    this.logger?.info(
      { seekId: seek.id, state: seek.state ?? 'unknown' },
      'chess.com seek created',
    );
    return { id: seek.id, state: seek.state ?? null };
  }

  async cancelSeek(seekId: string, signal: AbortSignal): Promise<void> {
    await this.http.cancelSeek(seekId, signal);
  }
}

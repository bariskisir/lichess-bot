import { z } from 'zod';
import { AuthenticationError } from '../../domain/lichess/gateway.js';
import { DEFAULT_TRANSPORT, type LichessTransportOptions } from '../lichess/transport-options.js';
import { LichessRetry } from '../lichess/lichess-retry.js';
import { LichessHttpError, retryAfterMilliseconds } from '../lichess/lichess-errors.js';
import { seekTimeControl, type ChesscomPool } from './pools.js';

export const CHESSCOM_PLAY_VERSION = '2026.10.3';
export const CHESSCOM_ORIGIN = 'https://www.chess.com';

const userPropertiesSchema = z.object({
  userProperties: z.object({ user: z.string().min(1) }),
});

const userDataSchema = z.record(
  z.string(),
  z.object({ id: z.number(), username: z.string() }),
);

const seekSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  state: z.string().optional(),
});

const activeGamesSchema = z.object({
  games: z.array(z.record(z.string(), z.unknown())).default([]),
});

const seeksSchema = z.object({
  challenges: z
    .array(z.object({ id: z.string(), state: z.string().optional() }).passthrough())
    .default([]),
});

export interface ChesscomSeek {
  id: string;
  userId: string;
  state?: string;
}

function randomToken(length = 7): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < length; i++)
    token += alphabet[Math.floor(Math.random() * alphabet.length)];
  return token;
}

export class ChesscomHttp {
  private queue: Promise<unknown> = Promise.resolve();
  readonly playClient: string;
  constructor(
    private readonly cookie: string,
    private readonly request: typeof fetch = fetch,
    private readonly options: LichessTransportOptions = DEFAULT_TRANSPORT,
    private readonly retry = new LichessRetry(options.retry),
    playToken: string = randomToken(),
  ) {
    this.playClient = `LC6;chrome/154.0.0/browser;Windows 10;${playToken};${CHESSCOM_PLAY_VERSION}`;
  }

  authenticatedUserId(signal: AbortSignal): Promise<string> {
    return this.execute(
      '/service/user-properties/chesscom.user_properties.v1.AuthenticatedPropertiesService/GetPropertiesForAuthenticatedUser',
      signal,
      { properties: [{ core: 'CREATED_AT' }] },
      async (response) => userPropertiesSchema.parse(await response.json()).userProperties.user,
    );
  }

  async username(userId: string, signal: AbortSignal): Promise<string> {
    const data = userDataSchema.parse(
      await this.get(
        `/callback/user/id-to-data?uuids%5B%5D=${encodeURIComponent(userId)}`,
        signal,
      ),
    );
    const entry = data[userId];
    if (!entry) throw new AuthenticationError('The chess.com session is invalid.');
    return entry.username;
  }

  seek(pool: ChesscomPool, signal: AbortSignal): Promise<ChesscomSeek> {
    const timeControl = seekTimeControl(pool);
    return this.execute(
      '/service/matcher/seeks/chess',
      signal,
      {
        capabilities: ['rated'],
        rated: true,
        gameType: 'chess',
        timeControl,
        ratingRange: { upper: null, lower: null },
      },
      async (response) => seekSchema.parse(await response.json()),
    );
  }

  async cancelSeek(seekId: string, signal: AbortSignal): Promise<void> {
    try {
      await this.fetch(`/service/matcher/seeks/${encodeURIComponent(seekId)}`, signal, {
        method: 'DELETE',
      });
    } catch {
      /* Leaving a pool is best-effort; recovery reconciles. */
    }
  }

  activeGames(signal: AbortSignal): Promise<Record<string, unknown>[]> {
    return this.execute('/service/play/games', signal, undefined, async (response) =>
      activeGamesSchema.parse(await response.json()).games,
    );
  }

  seekStates(signal: AbortSignal): Promise<{ id: string; state: string | null }[]> {
    return this.execute('/service/matcher/seeks', signal, undefined, async (response) =>
      seeksSchema
        .parse(await response.json())
        .challenges.map((seek) => ({ id: seek.id, state: seek.state ?? null })),
    );
  }

  hydrate(gameIds: string[], signal: AbortSignal): Promise<unknown> {
    return this.execute(
      '/service/player-game-archive-v2/chesscom.game_gateway.v2.GameGatewayService/HydrateGamesByCriteria',
      signal,
      { criteria: { page: 1, pageSize: gameIds.length, gameIds }, fieldMask: 'game,favoriteMetadata' },
      async (response) => response.json(),
    );
  }

  private get(path: string, signal: AbortSignal): Promise<unknown> {
    return this.serialize(() =>
      this.retry.run(
        async () =>
          this.consume(
            await this.fetch(path, signal, { method: 'GET' }),
            signal,
          ),
        signal,
      ),
    );
  }

  private execute<T>(
    path: string,
    signal: AbortSignal,
    body: unknown,
    consume: (response: Response) => Promise<T>,
  ): Promise<T> {
    return this.serialize(() =>
      this.retry.run(async () => consume(await this.fetch(path, signal, body === undefined ? { method: 'GET' } : {
        method: 'POST',
        body: JSON.stringify(body),
      })), signal),
    );
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.then(operation);
    this.queue = next.catch(() => {});
    return next;
  }

  private async fetch(path: string, signal: AbortSignal, init: RequestInit): Promise<Response> {
    signal.throwIfAborted();
    const response = await this.request(new URL(path, CHESSCOM_ORIGIN), {
      ...init,
      signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
      redirect: 'manual',
      headers: {
        Cookie: this.cookie,
        Accept: 'application/json, text/plain, */*',
        'Content-Type': 'application/json',
        Origin: CHESSCOM_ORIGIN,
        Referer: `${CHESSCOM_ORIGIN}/`,
        'User-Agent': this.options.userAgent,
        'X-Chesscom-Client': `Chesscom-Web-Frontend-Play/${CHESSCOM_PLAY_VERSION}; (#ui_ux_frontend in Slack)`,
        'X-Chesscom-Play-Client': this.playClient,
        'X-Chesscom-No-Csrf': '1',
        'X-Chesscom-Request-Id-Client': randomToken(),
        ...(init.headers ?? {}),
      },
    });
    if (!response.ok) {
      await response.body?.cancel();
      if ([401, 403, 302, 303].includes(response.status)) throw new AuthenticationError();
      throw new LichessHttpError(
        response.status,
        retryAfterMilliseconds(response.headers.get('retry-after'), response.status),
      );
    }
    return response;
  }

  private async consume(response: Response, _signal: AbortSignal): Promise<unknown> {
    if (!response.headers.get('content-type')?.includes('json')) {
      await response.body?.cancel();
      throw new AuthenticationError(
        'Expected chess.com game data. Verify the session or check for protocol changes.',
      );
    }
    return response.json();
  }
}

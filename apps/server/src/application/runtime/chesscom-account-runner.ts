import type { Logger } from 'pino';
import type {
  AccountView,
  BotSettings,
  Color,
  GameView,
  PlayerView,
} from '../../../../../packages/contracts/src/index.js';
import type { ChesscomGateway, ChesscomGameTransport } from '../../domain/chesscom/gateway.js';
import { ChesscomAuthenticationError } from '../../domain/chesscom/gateway.js';
import type { WebChesscomGateway } from '../../adapters/chesscom/web-gateway.js';
import { parseTicket } from '../../adapters/chesscom/web-gateway.js';
import { MATCHER_TICKETS_CHANNEL, PubsubClient } from '../../adapters/chesscom/pubsub.js';
import type { MatchBudget } from '../scheduling/match-budget.js';
import type { PoolRotation } from '../scheduling/pool-rotation.js';
import type { MoveSelector } from '../game/move-selector.js';
import { ChesscomGameRunner } from '../game/chesscom-game-runner.js';
import type { DashboardStore } from '../dashboard/dashboard-store.js';
import { Pulse, retryDelay, sleep } from '../../shared/async.js';

export interface ChesscomAccountRuntimeContext {
  budget: MatchBudget;
  pools: PoolRotation;
  managedUsers: Set<string>;
  owners: Map<string, string>;
  canPair(): boolean;
  complete(game: GameView): Promise<void>;
  changed(): void;
}

function inferColor(
  raw: Record<string, unknown>,
  userId: string,
  username: string,
): { color: Color; guessed: boolean } {
  const players = raw.players;
  if (Array.isArray(players)) {
    const index = players.indexOf(userId);
    if (index === 0) return { color: 'white', guessed: false };
    if (index === 1) return { color: 'black', guessed: false };
  }
  const details = raw.playersDetails;
  if (Array.isArray(details)) {
    for (const entry of details) {
      if (entry && typeof entry === 'object') {
        const detail = entry as Record<string, unknown>;
        if (detail.id === userId || detail.username === username) {
          if (detail.color === 'white' || detail.color === 'black')
            return { color: detail.color, guessed: false };
        }
      }
    }
  }
  for (const color of ['white', 'black'] as const) {
    const side = raw[color];
    if (side && typeof side === 'object' && JSON.stringify(side).includes(userId))
      return { color, guessed: false };
  }
  return { color: 'white', guessed: true };
}

function playerView(uuid: string, details: Map<string, { username: string; rating: number | null }>, fallbackName: string): PlayerView {
  const detail = details.get(uuid);
  const name = detail?.username ?? fallbackName;
  return { id: uuid || name, name, rating: detail?.rating ?? null, title: null };
}

/** Builds White/Black views from `players: [white, black]` plus `playersDetails`. */
export function resolvePlayers(
  raw: Record<string, unknown>,
  userId: string,
  username: string,
): { white: PlayerView; black: PlayerView } {
  const details = new Map<string, { username: string; rating: number | null }>();
  const list = raw.playersDetails;
  if (Array.isArray(list)) {
    for (const entry of list) {
      if (entry && typeof entry === 'object') {
        const detail = entry as Record<string, unknown>;
        if (typeof detail.id === 'string' && typeof detail.username === 'string')
          details.set(detail.id, {
            username: detail.username,
            rating: typeof detail.rating === 'number' ? detail.rating : null,
          });
      }
    }
  }
  const players = raw.players;
  const order =
    Array.isArray(players) && players.length >= 2 ? [String(players[0]), String(players[1])] : null;
  if (order) {
    return {
      white: playerView(order[0]!, details, order[0] === userId ? username : 'Opponent'),
      black: playerView(order[1]!, details, order[1] === userId ? username : 'Opponent'),
    };
  }
  return {
    white: playerView(userId, details, username),
    black: playerView('', details, 'Opponent'),
  };
}

export class ChesscomAccountRunner {
  private readonly pulse = new Pulse();
  private readonly games = new Map<string, Promise<void>>();
  private readonly pending = new Set<string>();
  private readonly finished = new Set<string>();
  private readonly colors = new Map<string, Color>();
  private readonly transports = new Map<string, ChesscomGameTransport>();
  private readonly playersByGame = new Map<string, { white: PlayerView; black: PlayerView }>();
  private readonly poolsByGame = new Map<string, string>();
  private lastActive = new Set<string>();
  private pubsub?: PubsubClient;
  private identity?: { id: string; username: string };
  private pool: string | null = null;
  private seekId: string | null = null;
  private poolAt = 0;
  private checkedAt = 0;
  private failedAuthentication = false;
  private reportedState: AccountView['state'] = 'ready';
  private reportedPool: string | null = null;

  private reportState(state: AccountView['state']): void {
    const pool = state === 'searching' ? this.pool : null;
    if (this.reportedState === state && this.reportedPool === pool) return;
    this.reportedState = state;
    this.reportedPool = pool;
    this.store.updateAccount(
      this.account.id,
      state === 'searching' ? { state, pool, error: null } : { state, pool },
    );
    this.context.changed();
  }

  constructor(
    private account: AccountView,
    private readonly cookie: string,
    private readonly gateway: ChesscomGateway & Pick<WebChesscomGateway, 'seek' | 'cancelSeek' | 'seekState'>,
    private readonly selector: MoveSelector,
    private readonly settings: BotSettings,
    private readonly context: ChesscomAccountRuntimeContext,
    private readonly store: DashboardStore,
    private readonly logger: Logger,
  ) {}

  async prepare(signal: AbortSignal): Promise<void> {
    this.store.updateAccount(this.account.id, { state: 'authenticating', error: null });
    try {
      this.identity = await this.gateway.authenticate(signal);
      if (this.context.managedUsers.has(this.identity.id))
        throw new ChesscomAuthenticationError(
          'Another session already manages this chess.com account.',
        );
      this.context.managedUsers.add(this.identity.id);
      this.account = {
        ...this.account,
        username: this.identity.username,
        userId: this.identity.id,
        state: 'ready',
        error: null,
      };
      this.store.updateAccount(this.account.id, this.account);
      await this.recover(signal);
    } catch (error) {
      this.store.updateAccount(this.account.id, {
        state: 'error',
        error:
          error instanceof ChesscomAuthenticationError
            ? error.message
            : 'Unable to connect to chess.com. Check the session and your connection.',
      });
      throw error;
    }
  }

  async run(signal: AbortSignal): Promise<void> {
    let attempt = 0;
    try {
      await this.ensureTickets(signal);
      while (!signal.aborted) {
        try {
          if (!this.failedAuthentication) {
            try {
              await this.ensureTickets(signal);
            } catch (error) {
              signal.throwIfAborted();
              this.logger.warn(
                {
                  accountId: this.account.id,
                  error: error instanceof Error ? error.message : 'Unknown error',
                },
                'chess.com match feed unavailable; polling for games',
              );
            }
            this.startPending(signal);
          }
          if (
            (this.context.budget.reached || !this.context.canPair()) &&
            !this.games.size &&
            !this.pending.size
          ) {
            await this.leavePool(signal);
            await this.pulse.wait(300, signal);
            continue;
          }
          if (this.failedAuthentication) {
            await this.leavePool(signal);
            await this.pulse.wait(1000, signal);
            continue;
          }
          // chess.com allows a single live game per account: never search while busy.
          if (this.games.size > 0 || this.pending.size > 0) {
            await this.leavePool(signal);
            this.reportState('playing');
            if (Date.now() - this.checkedAt > 20_000) await this.recover(signal);
            await this.pulse.wait(1000, signal);
            continue;
          }
          if (!this.context.canPair() || (!this.pool && !this.context.budget.search(this.account.id))) {
            await this.leavePool(signal);
            this.reportState(this.games.size ? 'playing' : 'ready');
            this.context.changed();
            await this.pulse.wait(250, signal);
            continue;
          }
          if (!this.pool) await this.enterPool(signal);
          if (this.settings.chesscomGameTypes.length > 1 && Date.now() - this.poolAt > 10_000) {
            await this.recover(signal);
            if (!this.pending.size && this.context.budget.search(this.account.id))
              await this.enterPool(signal);
          }
          if (Date.now() - this.checkedAt > 20_000) await this.recover(signal);
          attempt = 0;
          await this.pulse.wait(1000, signal);
        } catch (error) {
          if (signal.aborted) break;
          await this.leavePool(signal);
          if (
            error instanceof ChesscomAuthenticationError ||
            (error instanceof Error && /session|auth/i.test(error.message))
          ) {
            this.authenticationFailure(
              error instanceof ChesscomAuthenticationError
                ? error
                : new ChesscomAuthenticationError(),
            );
            continue;
          }
          this.store.updateAccount(this.account.id, {
            state: 'recovering',
            pool: null,
            error: 'Connection interrupted. Retrying automatically.',
          });
          this.logger.warn(
            {
              accountId: this.account.id,
              error: error instanceof Error ? error.message : 'Unknown error',
            },
            'chess.com connection interrupted',
          );
          await sleep(retryDelay(attempt++), signal);
        }
      }
    } finally {
      this.pubsub?.close();
      this.pubsub = undefined;
      await this.leavePool(signal);
      await Promise.allSettled(this.games.values());
    }
  }

  private async ensureTickets(signal: AbortSignal): Promise<void> {
    if (this.pubsub?.connected || !this.identity) return;
    const pubsub = new PubsubClient(
      this.cookie,
      this.identity.id,
      {
        userAgent: this.settings.userAgent,
        retry: { attempts: this.settings.requestAttempts, delayMs: this.settings.requestDelayMs },
      },
      this.logger,
    );
    await pubsub.connect(signal);
    pubsub.subscribe(MATCHER_TICKETS_CHANNEL, (data) => this.onTicket(data));
    this.pubsub = pubsub;
  }

  private readonly onTicket = (data: unknown): void => {
    const ticket = parseTicket(data);
    if (!ticket || ticket.state !== 'accepted' || !ticket.game) return;
    const raw = { ...ticket.game.raw, players: ticket.game.players };
    const color =
      ticket.color ??
      inferColor(raw, this.identity?.id ?? '', this.identity?.username ?? '').color;
    const players = resolvePlayers(raw, this.identity?.id ?? '', this.identity?.username ?? '');
    this.logger.info(
      { accountId: this.account.id, gameId: ticket.game.id, color, state: ticket.state },
      'chess.com ticket accepted',
    );
    this.enqueue(
      ticket.game.id,
      color,
      players,
      ticket.game.transport,
      this.pool ?? this.settings.chesscomGameTypes[0]!,
      false,
    );
    this.pulse.notify();
  };

  private async recover(signal: AbortSignal): Promise<void> {
    const games = await this.gateway.activeGames(signal);
    this.lastActive = new Set(games.map((game) => game.id));
    if (this.seekId && Date.now() - this.poolAt > 5 * 60_000) {
      const state = await this.gateway.seekState(this.seekId, signal);
      if (state !== 'active') {
        this.logger.info(
          { accountId: this.account.id, seekId: this.seekId, state },
          'chess.com seek never activated; recreating it',
        );
        await this.leavePool(signal);
      }
    }
    if (games.length)
      this.logger.info(
        { accountId: this.account.id, count: games.length },
        'chess.com reported active games',
      );
    for (const game of games) {
      const { color, guessed } = inferColor(
        game.raw,
        this.identity?.id ?? '',
        this.identity?.username ?? '',
      );
      if (guessed)
        this.logger.warn(
          { accountId: this.account.id, gameId: game.id },
          'chess.com color is unknown; assuming white',
        );
      this.enqueue(
        game.id,
        color,
        resolvePlayers(game.raw, this.identity?.id ?? '', this.identity?.username ?? ''),
        game.transport,
        this.pool ?? this.settings.chesscomGameTypes[0]!,
        true,
      );
    }
    this.checkedAt = Date.now();
    this.context.changed();
  }

  private enqueue(
    gameId: string,
    color: Color,
    players: { white: PlayerView; black: PlayerView },
    transport: ChesscomGameTransport,
    pool: string,
    recovered: boolean,
  ): void {
    if (this.games.has(gameId) || this.pending.has(gameId) || this.finished.has(gameId)) return;
    // The budget key must equal GameView.id (the full UUID) so completion matches.
    if (!this.context.budget.reserve(gameId, this.account.id, recovered)) return;
    this.logger.info(
      { accountId: this.account.id, gameId, color, region: transport.region, pool },
      'chess.com match found',
    );
    void this.leavePoolFallback();
    if (!this.context.owners.has(gameId)) this.context.owners.set(gameId, this.account.id);
    this.colors.set(gameId, color);
    this.transports.set(gameId, transport);
    this.playersByGame.set(gameId, players);
    this.poolsByGame.set(gameId, pool);
    this.pending.add(gameId);
    this.context.changed();
  }

  private async leavePoolFallback(): Promise<void> {
    try {
      await this.leavePool(new AbortController().signal);
    } catch {
      /* best effort */
    }
  }

  private startPending(signal: AbortSignal): void {
    for (const gameId of [...this.pending]) {
      this.pending.delete(gameId);
      const isOwner = this.context.owners.get(gameId) === this.account.id;
      const runner = new ChesscomGameRunner(
        gameId,
        this.account,
        this.colors.get(gameId) ?? 'white',
        this.poolsByGame.get(gameId) ?? this.settings.chesscomGameTypes[0]!,
        this.playersByGame.get(gameId) ?? {
          white: { id: '', name: 'White', rating: null, title: null },
          black: { id: '', name: 'Black', rating: null, title: null },
        },
        this.gateway.createChannel(
          this.transports.get(gameId) ?? { wsUrl: null, region: null, routes: null },
        ),
        this.selector,
        this.settings,
        () => this.lastActive.has(gameId),
        isOwner ? this.store : null,
        this.logger,
      );
      const task = runner
        .run(signal)
        .then(
          async (game) => {
            this.finished.add(gameId);
            if (isOwner) await this.context.complete(game);
          },
          () => {
            if (signal.aborted) return;
            this.pending.add(gameId);
            this.store.updateGame(gameId, { activity: 'recovering' });
          },
        )
        .finally(() => {
          this.games.delete(gameId);
          this.context.changed();
          this.pulse.notify();
        });
      this.games.set(gameId, task);
      this.context.changed();
    }
  }

  private async enterPool(signal: AbortSignal): Promise<void> {
    await this.leavePool(signal);
    this.pool = this.context.pools.choose(this.account.id);
    const seek = await this.gateway.seek(this.pool, signal);
    this.seekId = seek.id;
    this.poolAt = Date.now();
    this.logger.info(
      { accountId: this.account.id, pool: this.pool, seekId: this.seekId, state: seek.state },
      'chess.com seeking',
    );
    this.reportState('searching');
  }

  private async leavePool(signal: AbortSignal): Promise<void> {
    if (this.seekId) {
      try {
        await this.gateway.cancelSeek(this.seekId, signal);
      } catch {
        /* best effort */
      }
    }
    this.seekId = null;
    this.pool = null;
    this.context.pools.release(this.account.id);
    this.context.budget.releaseSearch(this.account.id);
    this.store.updateAccount(this.account.id, { pool: null });
    this.context.changed();
  }

  private authenticationFailure(error: ChesscomAuthenticationError): void {
    this.failedAuthentication = true;
    this.store.updateAccount(this.account.id, { state: 'error', error: error.message });
    this.store.addActivity('error', error.message, this.account.id);
  }
}

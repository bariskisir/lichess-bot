import type { Logger } from 'pino';
import type {
  AccountView,
  BotSettings,
  GameView,
} from '../../../../../packages/contracts/src/index.js';
import {
  AuthenticationError,
  type LichessGateway,
  type RemoteAccount,
} from '../../domain/lichess/gateway.js';
import type { MatchBudget } from '../scheduling/match-budget.js';
import type { PoolRotation } from '../scheduling/pool-rotation.js';
import type { MoveSelector } from '../game/move-selector.js';
import { GameRunner } from '../game/game-runner.js';
import type { DashboardStore } from '../dashboard/dashboard-store.js';
import { redirectFullId } from '../../domain/lichess/redirect.js';
import { Pulse, retryDelay, sleep } from '../../shared/async.js';

export interface AccountRuntimeContext {
  budget: MatchBudget;
  pools: PoolRotation;
  managedUsers: Set<string>;
  owners: Map<string, string>;
  canPair(): boolean;
  complete(game: GameView): Promise<void>;
  changed(): void;
}

export class AccountRunner {
  private readonly channel;
  private readonly pulse = new Pulse();
  private readonly games = new Map<string, Promise<void>>();
  private readonly pending = new Set<string>();
  private readonly finished = new Set<string>();
  private identity?: RemoteAccount;
  private pool: string | null = null;
  private poolAt = 0;
  private renewedAt = 0;
  private checkedAt = 0;
  private failedAuthentication = false;

  constructor(
    private account: AccountView,
    private readonly gateway: LichessGateway,
    private readonly selector: MoveSelector,
    private readonly settings: BotSettings,
    private readonly context: AccountRuntimeContext,
    private readonly store: DashboardStore,
    private readonly logger: Logger,
  ) {
    this.channel = gateway.createChannel();
  }

  async prepare(signal: AbortSignal): Promise<void> {
    this.store.updateAccount(this.account.id, { state: 'authenticating', error: null });
    try {
      this.identity = await this.gateway.authenticate(signal);
      if (this.context.managedUsers.has(this.identity.id))
        throw new AuthenticationError('Another session already manages this Lichess account.');
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
          error instanceof AuthenticationError
            ? error.message
            : 'Unable to connect to Lichess. Check the session and your connection.',
      });
      throw error;
    }
  }

  async run(signal: AbortSignal): Promise<void> {
    const unsubscribe = this.channel.subscribe((frame) => {
      if (frame.t !== 'redirect') return;
      const fullId = redirectFullId(frame.d);
      if (fullId) {
        this.enqueue(fullId, false);
        this.leavePool();
        this.pulse.notify();
      }
    });
    const disconnect = this.channel.onDisconnect(() => {
      this.leavePool();
      this.pulse.notify();
    });
    let attempt = 0;
    try {
      while (!signal.aborted) {
        try {
          if (!this.failedAuthentication) this.startPending(signal);
          if (
            (this.context.budget.reached || !this.context.canPair()) &&
            !this.games.size &&
            !this.pending.size
          ) {
            this.leavePool();
            await this.pulse.wait(300, signal);
            continue;
          }
          if (this.failedAuthentication) {
            this.leavePool();
            await this.pulse.wait(1000, signal);
            continue;
          }
          if (
            !this.context.canPair() ||
            (!this.pool && !this.context.budget.search(this.account.id))
          ) {
            this.leavePool();
            this.channel.close();
            this.store.updateAccount(this.account.id, {
              state: this.games.size ? 'playing' : 'ready',
              pool: null,
            });
            this.context.changed();
            await this.pulse.wait(250, signal);
            continue;
          }
          if (!this.channel.connected) {
            await this.recover(signal);
            if (this.pending.size) {
              this.context.budget.releaseSearch(this.account.id);
              continue;
            }
            await this.channel.connect('/lobby/socket/v5', signal);
          }
          if (!this.pool) this.enterPool();
          if (this.settings.gameTypes.length > 1 && Date.now() - this.poolAt > 10_000) {
            this.leavePool();
            await this.recover(signal);
            if (!this.pending.size && this.context.budget.search(this.account.id)) this.enterPool();
          }
          if (this.pool && Date.now() - this.renewedAt > 10_000) {
            this.channel.send('poolIn', { id: this.pool });
            this.renewedAt = Date.now();
          }
          if (Date.now() - this.checkedAt > 20_000) await this.recover(signal);
          attempt = 0;
          await this.pulse.wait(250, signal);
        } catch (error) {
          if (signal.aborted) break;
          this.leavePool();
          this.channel.close();
          if (error instanceof AuthenticationError) {
            this.authenticationFailure(error);
            continue;
          }
          this.store.updateAccount(this.account.id, {
            state: 'recovering',
            pool: null,
            error: 'Connection interrupted. Retrying automatically.',
          });
          this.logger.warn({ accountId: this.account.id }, 'Account connection interrupted');
          await sleep(retryDelay(attempt++), signal);
        }
      }
    } finally {
      unsubscribe();
      disconnect();
      this.leavePool();
      this.channel.close();
      await Promise.allSettled(this.games.values());
    }
  }

  private async recover(signal: AbortSignal): Promise<void> {
    for (const game of await this.gateway.playing(signal)) this.enqueue(game.fullId, true);
    this.checkedAt = Date.now();
    this.context.changed();
  }
  private enqueue(fullId: string, recovered: boolean): void {
    if (this.games.has(fullId) || this.pending.has(fullId) || this.finished.has(fullId)) return;
    const id = fullId.slice(0, 8);
    if (!this.context.budget.reserve(id, this.account.id, recovered)) return;
    this.leavePool();
    if (!this.context.owners.has(id)) this.context.owners.set(id, this.account.id);
    this.pending.add(fullId);
    this.context.changed();
  }
  private startPending(signal: AbortSignal): void {
    for (const fullId of [...this.pending]) {
      this.pending.delete(fullId);
      const isOwner = this.context.owners.get(fullId.slice(0, 8)) === this.account.id;
      const runner = new GameRunner(
        fullId,
        this.account,
        this.gateway,
        this.selector,
        this.settings,
        this.context.managedUsers,
        isOwner ? this.store : null,
        this.logger,
      );
      const task = runner
        .run(signal)
        .then(
          async (game) => {
            this.finished.add(fullId);
            if (isOwner) await this.context.complete(game);
          },
          (error: unknown) => {
            if (signal.aborted) return;
            if (error instanceof AuthenticationError) this.authenticationFailure(error);
            this.pending.add(fullId);
            this.store.updateGame(fullId.slice(0, 8), { activity: 'recovering' });
          },
        )
        .finally(() => {
          this.games.delete(fullId);
          this.context.changed();
          this.pulse.notify();
        });
      this.games.set(fullId, task);
      this.context.changed();
    }
  }
  private enterPool(): void {
    this.pool = this.context.pools.choose(this.account.id);
    this.channel.send('poolIn', { id: this.pool });
    this.poolAt = this.renewedAt = Date.now();
    this.store.updateAccount(this.account.id, { state: 'searching', pool: this.pool, error: null });
    this.context.changed();
  }
  private leavePool(): void {
    if (this.pool && this.channel.connected) {
      try {
        this.channel.send('poolOut', this.pool);
      } catch {
        /* Recovery reconciles a pairing that raced with leaving. */
      }
    }
    this.pool = null;
    this.context.pools.release(this.account.id);
    this.context.budget.releaseSearch(this.account.id);
    this.store.updateAccount(this.account.id, { pool: null });
    this.context.changed();
  }
  private authenticationFailure(error: AuthenticationError): void {
    this.failedAuthentication = true;
    this.leavePool();
    this.store.updateAccount(this.account.id, { state: 'error', error: error.message });
    this.store.addActivity('error', error.message, this.account.id);
  }
}

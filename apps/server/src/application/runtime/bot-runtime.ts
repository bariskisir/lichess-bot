import type { Logger } from 'pino';
import type {
  AccountSecret,
  AccountView,
  GameView,
  RuntimeCommand,
  RuntimePhase,
} from '../../../../../packages/contracts/src/index.js';
import type { LichessGateway } from '../../domain/lichess/gateway.js';
import type { ConfigurationService } from '../config/configuration-service.js';
import type { DashboardStore } from '../dashboard/dashboard-store.js';
import { initialRuntime } from '../dashboard/dashboard-store.js';
import type { EngineRegistry } from '../engine/engine-registry.js';
import { EnginePool } from '../engine/engine-pool.js';
import { MoveSelector } from '../game/move-selector.js';
import { MatchBudget } from '../scheduling/match-budget.js';
import { PoolRotation } from '../scheduling/pool-rotation.js';
import { AccountRunner } from './account-runner.js';
import type { GameHistoryRepository } from '../game/game-history-repository.js';
import { abortError, isAbort, sleep } from '../../shared/async.js';

export class RuntimeConflict extends Error {}
export type GatewayFactory = (account: AccountSecret) => LichessGateway;

export class BotRuntime {
  private phase: RuntimePhase = 'idle';
  private lifetime?: AbortController;
  private task?: Promise<void>;
  private budget?: MatchBudget;
  private pool?: EnginePool;
  private terminalRequested = false;
  private immediateStop = false;

  constructor(
    private readonly config: ConfigurationService,
    private readonly engines: EngineRegistry,
    private readonly gateways: GatewayFactory,
    private readonly store: DashboardStore,
    private readonly archive: GameHistoryRepository,
    private readonly logger: Logger,
  ) {}
  get editable(): boolean {
    return ['idle', 'completed', 'error'].includes(this.phase) && !this.task;
  }
  assertEditable(): void {
    if (!this.editable)
      throw new RuntimeConflict('Finish the current session before changing accounts or settings.');
  }
  refreshConfiguration(): void {
    const engine = this.engines
      .list()
      .find((engine) => engine.id === this.config.settings.engineId);
    this.store.setEngine({
      id: this.config.settings.engineId,
      name: engine?.name ?? this.config.settings.engineId,
    });
    this.store.setSettings(this.config.settings);
    this.store.setAccounts(
      this.config.accounts.map((account): AccountView => ({
        id: account.id,
        label: account.label,
        username: null,
        userId: null,
        state: 'ready',
        pool: null,
        error: null,
      })),
    );
  }
  command(command: RuntimeCommand): void {
    if (command === 'start') {
      this.assertEditable();
      if (!this.config.accounts.length)
        throw new RuntimeConflict('Connect an account before starting a session.');
      this.lifetime = new AbortController();
      this.terminalRequested = false;
      this.immediateStop = false;
      this.setPhase('starting');
      this.task = this.run(this.lifetime.signal)
        .catch((error: unknown) => {
          if (!isAbort(error)) {
            this.logger.error(
              { error: error instanceof Error ? error.message : 'Unknown error' },
              'Session stopped',
            );
            this.store.addActivity(
              'error',
              'The session could not continue. Check Accounts and Activity, then start again.',
            );
            this.setPhase('error', 'Check the account sessions and connection, then start again.');
          }
        })
        .finally(() => {
          this.task = undefined;
          if (this.immediateStop) {
            this.setPhase('idle');
            for (const game of this.store.snapshot().games)
              this.store.updateGame(game.id, { activity: 'recovering' });
            this.store.addActivity(
              'warn',
              'Local play stopped. Start a session to recover unfinished games.',
            );
          }
        });
      return;
    }
    if (
      command === 'stop-now' &&
      ['starting', 'running', 'paused', 'draining'].includes(this.phase)
    ) {
      this.immediateStop = true;
      this.setPhase('draining');
      this.lifetime?.abort(abortError('Local play stopped.'));
    } else if (command === 'pause' && this.phase === 'running') this.setPhase('paused');
    else if (command === 'resume' && this.phase === 'paused') this.setPhase('running');
    else if (command === 'stop' && ['starting', 'running', 'paused'].includes(this.phase)) {
      this.terminalRequested = true;
      this.setPhase('draining');
    } else throw new RuntimeConflict('This action is unavailable in the current session state.');
  }

  private async run(signal: AbortSignal): Promise<void> {
    const settings = this.config.settings;
    this.store.setRuntime({
      ...initialRuntime(settings.totalMatches),
      phase: this.phase,
      startedAt: Date.now(),
    });
    this.refreshConfiguration();
    this.budget = new MatchBudget(settings.totalMatches, settings.maxConcurrentGames);
    const factory = this.engines.get(settings.engineId);
    this.pool = new EnginePool(factory, settings.maxEngines, (metrics) =>
      this.store.setEngine(metrics),
    );
    const selector = new MoveSelector(this.pool);
    const context = {
      budget: this.budget,
      pools: new PoolRotation(settings.gameTypes),
      managedUsers: new Set<string>(),
      owners: new Map<string, string>(),
      canPair: () => this.phase === 'running',
      complete: (game: GameView) => this.complete(game),
      changed: () => this.updateCounts(),
    };
    const accounts = this.store.snapshot().accounts;
    const runners = this.config.accounts.map(
      (secret) =>
        new AccountRunner(
          accounts.find((account) => account.id === secret.id)!,
          this.gateways(secret),
          selector,
          settings,
          context,
          this.store,
          this.logger,
        ),
    );
    const runScope = new AbortController();
    const scope = AbortSignal.any([signal, runScope.signal]);
    let tasks: Promise<void>[] = [];
    try {
      // Verify every identity and reserve all recovered games before any account enters a pool.
      for (const runner of runners) await runner.prepare(scope);
      if (!this.terminalRequested) this.setPhase('running');
      this.store.addActivity(
        'info',
        'Session started. Existing games were recovered before matchmaking.',
      );
      tasks = runners.map((runner) => runner.run(scope));
      for (const task of tasks)
        void task.catch(() => {
          runScope.abort(abortError());
        });
      while (!scope.aborted) {
        if (
          (this.budget.reached || this.terminalRequested) &&
          this.budget.active === 0 &&
          this.budget.searching === 0
        )
          break;
        await sleep(250, scope);
      }
      if (!signal.aborted) {
        this.setPhase('completed');
        this.store.addActivity('info', 'Session finished. All ongoing games have completed.');
      }
    } finally {
      runScope.abort(abortError('Session finished.'));
      await Promise.allSettled(tasks);
      await this.pool.close();
      this.pool = undefined;
      for (const account of this.store.snapshot().accounts)
        if (account.state !== 'error')
          this.store.updateAccount(account.id, { state: 'ready', pool: null });
    }
  }

  private async complete(game: GameView): Promise<void> {
    if (!this.budget?.complete(game.id)) return;
    this.store.setGame(game);
    this.store.finishGame(game.id);
    const current = this.store.snapshot().runtime;
    const counter =
      game.result === 'win'
        ? 'wins'
        : game.result === 'loss'
          ? 'losses'
          : game.result === 'draw'
            ? 'draws'
            : 'aborted';
    this.store.setRuntime({ [counter]: current[counter] + 1 });
    this.store.addActivity('info', `Game finished: ${game.result}.`, game.accountId, game.id);
    this.updateCounts();
    try {
      await this.archive.save(game, this.config.settings.historyLimit);
    } catch {
      this.store.addActivity(
        'error',
        'Game history could not be saved. Check free disk space and data directory permissions.',
      );
      this.logger.error('Failed to persist game history');
    }
  }
  private updateCounts(): void {
    if (this.budget)
      this.store.setRuntime({
        completed: this.budget.completed,
        active: this.budget.active,
        searching: this.budget.searching,
        target: this.budget.target,
      });
  }
  private setPhase(phase: RuntimePhase, error: string | null = null): void {
    this.phase = phase;
    this.store.setRuntime({ phase, error });
  }
  async close(): Promise<void> {
    this.lifetime?.abort(abortError('Application stopped.'));
    await this.task;
    await this.pool?.close();
  }
}

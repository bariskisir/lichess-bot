import { randomUUID } from 'node:crypto';
import { RESULT_HOLD_MS } from '../../../../../packages/contracts/src/index.js';
import type {
  AccountView,
  ActivityView,
  BotSettings,
  DashboardSnapshot,
  EngineView,
  GameView,
  RuntimeView,
} from '../../../../../packages/contracts/src/index.js';

export function initialRuntime(target: number): RuntimeView {
  return {
    phase: 'idle',
    startedAt: null,
    completed: 0,
    target,
    active: 0,
    searching: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    aborted: 0,
    error: null,
  };
}

export class DashboardStore {
  private readonly instanceId = randomUUID();
  private revision = 0;
  private readonly listeners = new Set<(snapshot: DashboardSnapshot) => void>();
  private timer?: ReturnType<typeof setTimeout>;
  private readonly games = new Map<string, GameView>();
  private readonly resultTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private history: GameView[] = [];
  private activity: ActivityView[] = [];
  private accounts: AccountView[] = [];
  private runtime: RuntimeView;
  private engine: EngineView;
  constructor(
    private settings: BotSettings,
    readonly demo = false,
  ) {
    this.runtime = initialRuntime(settings.totalMatches);
    this.engine = {
      id: settings.engineId,
      name: settings.engineId,
      workers: 0,
      busy: 0,
      queued: 0,
      capacity: settings.maxEngines,
    };
  }
  snapshot(): DashboardSnapshot {
    return {
      instanceId: this.instanceId,
      revision: this.revision,
      serverTime: Date.now(),
      demo: this.demo,
      runtime: { ...this.runtime },
      engine: { ...this.engine },
      settings: { ...this.settings },
      accounts: [...this.accounts],
      games: [...this.games.values()].sort((a, b) => a.startedAt - b.startedAt),
      history: [...this.history],
      activity: [...this.activity],
    };
  }
  subscribe(listener: (snapshot: DashboardSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  setSettings(settings: BotSettings): void {
    this.settings = settings;
    this.history = this.history.slice(0, settings.historyLimit);
    this.engine.capacity = settings.maxEngines;
    this.runtime.target = settings.totalMatches;
    this.publish();
  }
  setAccounts(accounts: AccountView[]): void {
    this.accounts = accounts;
    this.publish();
  }
  updateAccount(id: string, patch: Partial<AccountView>): void {
    this.accounts = this.accounts.map((account) =>
      account.id === id ? { ...account, ...patch } : account,
    );
    this.publish();
  }
  setRuntime(patch: Partial<RuntimeView>): void {
    this.runtime = { ...this.runtime, ...patch };
    this.publish();
  }
  setEngine(patch: Partial<EngineView>): void {
    this.engine = { ...this.engine, ...patch };
    this.publish();
  }
  setGame(game: GameView): void {
    this.games.set(game.id, game);
    this.publish();
  }
  updateGame(id: string, patch: Partial<GameView>): void {
    const game = this.games.get(id);
    if (game) {
      this.games.set(id, { ...game, ...patch });
      this.publish();
    }
  }
  finishGame(id: string): GameView | null {
    const game = this.games.get(id);
    if (!game || !game.result) return null;
    if (this.resultTimers.has(id)) return game;
    const remainingMs = Math.max(0, (game.finishedAt ?? Date.now()) + RESULT_HOLD_MS - Date.now());
    const timer = setTimeout(() => {
      this.resultTimers.delete(id);
      this.archiveGame(id);
    }, remainingMs);
    timer.unref();
    this.resultTimers.set(id, timer);
    return game;
  }
  private archiveGame(id: string): void {
    const game = this.games.get(id);
    if (!game?.result) return;
    this.games.delete(id);
    this.history = [game, ...this.history.filter((item) => item.id !== id)].slice(
      0,
      this.settings.historyLimit,
    );
    this.publish();
  }
  clearHistory(): void {
    this.history = [];
    for (const [id, timer] of this.resultTimers) {
      clearTimeout(timer);
      this.games.delete(id);
    }
    this.resultTimers.clear();
    this.publish();
  }
  restoreHistory(history: GameView[]): void {
    this.history = history.slice(0, this.settings.historyLimit);
    this.publish();
  }
  addActivity(
    level: ActivityView['level'],
    message: string,
    accountId: string | null = null,
    gameId: string | null = null,
  ): void {
    this.activity = [
      { id: randomUUID(), at: Date.now(), level, message, accountId, gameId },
      ...this.activity,
    ].slice(0, 100);
    this.publish();
  }
  private publish(): void {
    this.revision++;
    if (!this.listeners.size || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      const snapshot = this.snapshot();
      for (const listener of this.listeners) listener(snapshot);
    }, 150);
  }
  close(): void {
    clearTimeout(this.timer);
    for (const timer of this.resultTimers.values()) clearTimeout(timer);
    this.resultTimers.clear();
    this.listeners.clear();
  }
}

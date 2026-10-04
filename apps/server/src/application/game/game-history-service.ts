import type { GameView } from '../../../../../packages/contracts/src/index.js';
import type { DashboardStore } from '../dashboard/dashboard-store.js';
import type { GameHistoryRepository } from './game-history-repository.js';

/** Serializes completion and reset so live history always agrees with the saved archive. */
export class GameHistoryService {
  private updates: Promise<void> = Promise.resolve();

  constructor(
    private readonly repository: GameHistoryRepository,
    private readonly store: DashboardStore,
  ) {}

  record(game: GameView, limit: number): Promise<void> {
    return this.update(async () => {
      this.store.setGame(game);
      this.store.finishGame(game.id);
      await this.repository.save(game, limit);
    });
  }

  clear(): Promise<void> {
    return this.update(async () => {
      await this.repository.clear();
      this.store.clearHistory();
    });
  }

  private update(operation: () => Promise<void>): Promise<void> {
    const next = this.updates.then(operation);
    this.updates = next.catch(() => {});
    return next;
  }
}

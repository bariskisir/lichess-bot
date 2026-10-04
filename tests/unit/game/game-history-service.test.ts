import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameHistoryService } from '../../../apps/server/src/application/game/game-history-service.js';
import { DashboardStore } from '../../../apps/server/src/application/dashboard/dashboard-store.js';
import { DEFAULT_SETTINGS, type GameView } from '../../../packages/contracts/src/index.js';
import { deferred } from '../../../apps/server/src/shared/async.js';
import { archivedGame } from '../../fixtures/server.js';

const stores: DashboardStore[] = [];
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  vi.useRealTimers();
});
function fixture() {
  const store = new DashboardStore(DEFAULT_SETTINGS);
  stores.push(store);
  let saved: GameView[] = [];
  const repository = {
    load: async () => saved,
    save: vi.fn(async (game: GameView) => {
      saved = [game, ...saved];
    }),
    clear: vi.fn(async () => {
      saved = [];
    }),
    flush: async () => {},
  };
  return { store, repository, history: new GameHistoryService(repository, store) };
}
describe('history reset coordination', () => {
  it('serializes a new completion behind a reset and keeps that new result', async () => {
    const app = fixture();
    await app.history.record(archivedGame(), 200);
    const reset = deferred<void>();
    app.repository.clear.mockImplementationOnce(async () => {
      await reset.promise;
    });
    const clearing = app.history.clear();
    const game = { ...archivedGame(), id: 'newgame1' };
    const recording = app.history.record(game, 200);
    await Promise.resolve();
    expect(app.repository.save).toHaveBeenCalledTimes(1);
    reset.resolve();
    await clearing;
    await recording;
    expect(app.store.snapshot().games).toEqual([game]);
    await vi.advanceTimersByTimeAsync(3000);
    expect(app.store.snapshot().history).toEqual([game]);
  });
  it('keeps visible history if disk reset fails and allows subsequent writes', async () => {
    const app = fixture();
    const game = archivedGame();
    app.store.restoreHistory([game]);
    app.repository.clear.mockRejectedValueOnce(new Error('Disk is unavailable.'));
    await expect(app.history.clear()).rejects.toThrow('Disk is unavailable.');
    expect(app.store.snapshot().history).toEqual([game]);
    await app.history.record({ ...game, id: 'newgame1' }, 200);
    expect(app.repository.save).toHaveBeenCalledTimes(1);
  });
});

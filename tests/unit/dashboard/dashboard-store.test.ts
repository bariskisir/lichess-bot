import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardStore } from '../../../apps/server/src/application/dashboard/dashboard-store.js';
import { DEFAULT_SETTINGS, RESULT_HOLD_MS } from '../../../packages/contracts/src/index.js';
import { archivedGame } from '../../fixtures/server.js';

const stores: DashboardStore[] = [];
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-04T12:00:00Z'));
});
afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  vi.useRealTimers();
});
function store() {
  const value = new DashboardStore(DEFAULT_SETTINGS);
  stores.push(value);
  return value;
}

describe('finished game presentation', () => {
  it('keeps the result on the live board for three seconds before moving it into history', async () => {
    const dashboard = store();
    const game = archivedGame();
    dashboard.setGame(game);
    dashboard.finishGame(game.id);
    await vi.advanceTimersByTimeAsync(RESULT_HOLD_MS - 1);
    expect(dashboard.snapshot().games).toEqual([game]);
    expect(dashboard.snapshot().history).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(dashboard.snapshot().games).toEqual([]);
    expect(dashboard.snapshot().history).toEqual([game]);
  });
  it('does not restart the hold for duplicate completion events', async () => {
    const dashboard = store();
    const game = archivedGame();
    dashboard.setGame(game);
    dashboard.finishGame(game.id);
    await vi.advanceTimersByTimeAsync(1000);
    dashboard.finishGame(game.id);
    await vi.advanceTimersByTimeAsync(2000);
    expect(dashboard.snapshot().games).toEqual([]);
    expect(dashboard.snapshot().history).toHaveLength(1);
  });
  it('uses the authoritative completion time when scheduling a late result', async () => {
    const dashboard = store();
    const game = { ...archivedGame(), finishedAt: Date.now() - 2000 };
    dashboard.setGame(game);
    dashboard.finishGame(game.id);
    await vi.advanceTimersByTimeAsync(1000);
    expect(dashboard.snapshot().history).toEqual([game]);
  });
  it('clears archived and held results without affecting ongoing games or session counters', async () => {
    const dashboard = store();
    const game = archivedGame();
    const ongoing = {
      ...game,
      id: 'ongoing1',
      result: null,
      finishedAt: null,
      activity: 'waiting' as const,
    };
    dashboard.restoreHistory([{ ...game, id: 'older001' }]);
    dashboard.setRuntime({ wins: 3, completed: 5, active: 1 });
    dashboard.setGame(ongoing);
    dashboard.setGame(game);
    dashboard.finishGame(game.id);
    dashboard.clearHistory();
    await vi.advanceTimersByTimeAsync(RESULT_HOLD_MS);
    expect(dashboard.snapshot().history).toEqual([]);
    expect(dashboard.snapshot().games).toEqual([ongoing]);
    expect(dashboard.snapshot().runtime).toMatchObject({ wins: 3, completed: 5, active: 1 });
  });
  it('disposes result timers when the application closes', () => {
    const dashboard = store();
    const game = archivedGame();
    dashboard.setGame(game);
    dashboard.finishGame(game.id);
    dashboard.close();
    expect(vi.getTimerCount()).toBe(0);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GamePosition } from '../../../apps/server/src/domain/game/position.js';
import { MoveSelectionBudget } from '../../../apps/server/src/application/game/timing/move-selection-budget.js';
import { abortError, deferred } from '../../../apps/server/src/shared/async.js';
import { gameSnapshot } from '../../fixtures/server.js';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => vi.useRealTimers());

describe('move selection time budget', () => {
  it('returns the last legal root candidate and cancels work when the shared budget expires', async () => {
    const position = new GamePosition(gameSnapshot(['e4', 'e5']));
    const budget = new MoveSelectionBudget(position, () => 300 - Date.now());
    budget.rememberMove('g1f3');
    budget.rememberMove('e1e8');
    const reply = deferred<string>();
    let scope: AbortSignal | undefined;
    const task = budget.run(new AbortController().signal, (signal, getSearchDeadline) => {
      scope = signal;
      signal.addEventListener('abort', () => reply.reject(signal.reason), { once: true });
      expect(getSearchDeadline()).toBe(200);
      return reply.promise;
    });
    await vi.advanceTimersByTimeAsync(300);
    expect(await task).toBe('g1f3');
    expect(scope?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('returns a legal emergency move without queuing new engine work when time is already exhausted', async () => {
    const position = new GamePosition(gameSnapshot(['e4', 'e5']));
    const budget = new MoveSelectionBudget(position, () => 0);
    const select = vi.fn(async () => 'g1f3');
    const move = await budget.run(new AbortController().signal, select);
    expect(() => position.candidate(move)).not.toThrow();
    expect(select).not.toHaveBeenCalled();
  });

  it('rejects cancellation rather than submitting an emergency move for a stale position', async () => {
    const position = new GamePosition(gameSnapshot(['e4', 'e5']));
    const budget = new MoveSelectionBudget(position, () => 300 - Date.now());
    const controller = new AbortController();
    const task = budget.run(controller.signal, () => new Promise(() => {}));
    const rejected = expect(task).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort(abortError('The position changed.'));
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears its timer on success and propagates actual engine errors', async () => {
    const position = new GamePosition(gameSnapshot(['e4', 'e5']));
    const budget = new MoveSelectionBudget(position, () => 300);
    expect(await budget.run(new AbortController().signal, async () => 'g1f3')).toBe('g1f3');
    await expect(
      budget.run(new AbortController().signal, async () => {
        throw new Error('Engine failed.');
      }),
    ).rejects.toThrow('Engine failed.');
    expect(vi.getTimerCount()).toBe(0);
  });
});

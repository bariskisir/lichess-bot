import { describe, expect, it, vi } from 'vitest';
import { TurnTiming } from '../../../apps/server/src/application/game/timing/turn-timing.js';
import type { TurnClock } from '../../../apps/server/src/application/game/timing/dynamic-turn-budget.js';
import { DEFAULT_SETTINGS } from '../../../packages/contracts/src/index.js';

function fixture(dynamicDelay = true, incrementMs = 2000) {
  let now = 0;
  let remainingAtUpdateMs = 180_000;
  let updatedAt = 0;
  const clock: TurnClock = {
    remainingMs: remainingAtUpdateMs,
    initialMs: 180_000,
    incrementMs,
    completedMoves: 0,
    materialPhase: 1,
    quietHalfMoves: 0,
    lagMs: 0,
    running: true,
  };
  const getClock = () => ({
    ...clock,
    remainingMs: Math.max(0, remainingAtUpdateMs - (now - updatedAt)),
  });
  const random = vi.fn(() => 0.75);
  const wait = vi.fn(async (ms: number) => {
    now += ms;
  });
  const timing = new TurnTiming(
    { ...DEFAULT_SETTINGS, dynamicDelay, randomDelayMaxMs: 4000 },
    getClock,
    random,
    () => now,
    wait,
  );
  return {
    timing,
    clock,
    random,
    wait,
    elapsed: (ms: number) => {
      now += ms;
    },
    updateClock: (remainingMs: number) => {
      remainingAtUpdateMs = remainingMs;
      updatedAt = now;
    },
    now: () => now,
  };
}

describe('turn timing', () => {
  it('ignores Maximum delay and includes queue and analysis in the deterministic dynamic target', async () => {
    const turn = fixture();
    expect(turn.timing.remainingAnalysisMs()).toBe(6315);
    turn.elapsed(2000);
    expect(turn.timing.remainingAnalysisMs()).toBe(4315);
    const waiting = vi.fn();
    await turn.timing.wait(new AbortController().signal, waiting);
    expect(turn.now()).toBe(6315);
    expect(turn.wait.mock.calls.reduce((sum, [ms]) => sum + ms, 0)).toBe(4315);
    expect(waiting).toHaveBeenNthCalledWith(1, 4315);
    expect(waiting).toHaveBeenLastCalledWith(15);
    expect(turn.random).not.toHaveBeenCalled();
  });

  it('sends without extra waiting if work has already used the target', async () => {
    const turn = fixture();
    turn.elapsed(7000);
    await turn.timing.wait(new AbortController().signal, vi.fn());
    expect(turn.wait).not.toHaveBeenCalled();
    expect(turn.timing.remainingAnalysisMs()).toBe(0);
  });

  it('rechecks clock corrections during artificial waiting and removes delay in time trouble', async () => {
    const turn = fixture();
    turn.wait.mockImplementationOnce(async (ms) => {
      turn.elapsed(ms);
      turn.updateClock(2000);
    });
    await turn.timing.wait(new AbortController().signal, vi.fn());
    expect(turn.wait).toHaveBeenCalledTimes(1);
    expect(turn.now()).toBe(100);
    expect(turn.timing.remainingAnalysisMs()).toBeLessThanOrEqual(250);
  });

  it('retains manual random timing with elapsed work deducted when the toggle is off', async () => {
    const turn = fixture(false);
    turn.elapsed(2000);
    await turn.timing.wait(new AbortController().signal, vi.fn());
    expect(turn.now()).toBe(3000);
    expect(turn.random).toHaveBeenCalledTimes(1);
    expect(turn.wait.mock.calls.reduce((sum, [ms]) => sum + ms, 0)).toBe(1000);
  });

  it('skips delay for untimed dynamic games and never invents a clock analysis limit', async () => {
    const timing = new TurnTiming(DEFAULT_SETTINGS, () => null);
    const waiting = vi.fn();
    await timing.wait(new AbortController().signal, waiting);
    expect(waiting).not.toHaveBeenCalled();
    expect(timing.remainingAnalysisMs()).toBeNull();
  });
});

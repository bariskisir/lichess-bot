import { describe, expect, it } from 'vitest';
import {
  calculateDynamicTurnBudget,
  type TurnClock,
} from '../../../apps/server/src/application/game/timing/dynamic-turn-budget.js';

const clock: TurnClock = {
  remainingMs: 180_000,
  initialMs: 180_000,
  incrementMs: 0,
  completedMoves: 0,
  materialPhase: 1,
  quietHalfMoves: 0,
  lagMs: 0,
  running: true,
};

describe('dynamic turn allocation', () => {
  it.each([
    { initialMs: 60_000, incrementMs: 0 },
    { initialMs: 120_000, incrementMs: 1000 },
    { initialMs: 180_000, incrementMs: 0 },
    { initialMs: 180_000, incrementMs: 2000 },
    { initialMs: 300_000, incrementMs: 3000 },
    { initialMs: 600_000, incrementMs: 5000 },
    { initialMs: 1800_000, incrementMs: 20_000 },
  ])(
    'starts $initialMs + $incrementMs with 40 own moves and includes future increments',
    ({ initialMs, incrementMs }) => {
      const budget = calculateDynamicTurnBudget({
        ...clock,
        initialMs,
        remainingMs: initialMs,
        incrementMs,
      });
      expect(budget.remainingMoves).toBe(40);
      expect(budget.totalMs).toBe(
        Math.floor((initialMs - budget.reserveMs + incrementMs * 39) / 40),
      );
    },
  );

  it('redistributes the remaining time equally during the initial 40-move forecast', () => {
    let remainingMs = clock.initialMs;
    const durations: number[] = [];
    for (let completedMoves = 0; completedMoves < 15; completedMoves++) {
      const budget = calculateDynamicTurnBudget({
        ...clock,
        remainingMs,
        incrementMs: 2000,
        completedMoves,
      });
      durations.push(budget.totalMs);
      remainingMs += 2000 - budget.totalMs;
    }
    expect(Math.max(...durations) - Math.min(...durations)).toBeLessThanOrEqual(1);
  });

  it('extends the forecast before move 40 when substantial material and quiet play remain', () => {
    const late = { ...clock, remainingMs: 60_000, completedMoves: 35 };
    const endgame = calculateDynamicTurnBudget({ ...late, materialPhase: 0 });
    const middlegame = calculateDynamicTurnBudget(late);
    const quiet = calculateDynamicTurnBudget({ ...late, quietHalfMoves: 64 });
    expect(endgame.remainingMoves).toBe(8);
    expect(middlegame.remainingMoves).toBe(24);
    expect(quiet.remainingMoves).toBe(32);
    expect(quiet.totalMs).toBeLessThan(middlegame.totalMs);
    expect(middlegame.totalMs).toBeLessThan(endgame.totalMs);
  });

  it.each([40, 60, 100, 150])(
    'continues allocating conservatively after %i own moves',
    (completedMoves) => {
      const budget = calculateDynamicTurnBudget({ ...clock, completedMoves });
      expect(budget.remainingMoves).toBeGreaterThanOrEqual(8);
      expect(budget.totalMs).toBeGreaterThan(0);
      expect(budget.totalMs).toBeLessThan(clock.remainingMs / 4);
    },
  );

  it('does not spend a future increment before it has been earned', () => {
    const budget = calculateDynamicTurnBudget({
      ...clock,
      initialMs: 60_000,
      remainingMs: 5000,
      incrementMs: 60_000,
    });
    expect(budget.totalMs).toBeLessThanOrEqual((5000 - 250) / 4);
    expect(budget.analysisMs).toBeLessThan(5000);
  });

  it('removes artificial waiting in time trouble and respects measured network lag', () => {
    const low = calculateDynamicTurnBudget({ ...clock, remainingMs: 2000 });
    const lagged = calculateDynamicTurnBudget({ ...clock, remainingMs: 2000, lagMs: 1000 });
    expect(low.totalMs).toBe(0);
    expect(low.analysisMs).toBeLessThanOrEqual(250);
    expect(lagged.analysisMs).toBe(0);
    expect(calculateDynamicTurnBudget({ ...clock, remainingMs: 0 }).analysisMs).toBe(0);
  });

  it.each([0, 1000, 2000, 3000, 20_000])(
    'keeps a positive clock through 80 simulated turns with %i ms increment',
    (incrementMs) => {
      let remainingMs = 180_000;
      for (let completedMoves = 0; completedMoves < 80; completedMoves++) {
        const budget = calculateDynamicTurnBudget({
          ...clock,
          remainingMs,
          completedMoves,
          incrementMs,
          quietHalfMoves: 60,
        });
        // Include per-move transmission overhead that the equal allocation cannot predict exactly.
        remainingMs -= Math.max(budget.totalMs, 100) + 150;
        expect(remainingMs).toBeGreaterThan(0);
        remainingMs += incrementMs;
      }
    },
  );
});

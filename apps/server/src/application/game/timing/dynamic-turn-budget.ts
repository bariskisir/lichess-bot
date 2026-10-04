export interface TurnClock {
  remainingMs: number;
  initialMs: number;
  incrementMs: number;
  completedMoves: number;
  materialPhase: number;
  quietHalfMoves: number;
  lagMs: number;
  running: boolean;
}

export interface DynamicTurnBudget {
  totalMs: number;
  analysisMs: number;
  remainingMoves: number;
  reserveMs: number;
}

const EXPECTED_GAME_MOVES = 40;

export function transmissionReserveMs(lagMs: number): number {
  return Math.max(250, Math.ceil(Math.max(0, lagMs) * 2 + 100));
}

/** A rolling horizon keeps allocating time after move 40 instead of spending the clock to zero. */
export function calculateDynamicTurnBudget(clock: TurnClock): DynamicTurnBudget {
  const phase = Math.max(0, Math.min(1, clock.materialPhase));
  const quietExtension = Math.min(8, Math.floor(Math.max(0, clock.quietHalfMoves) / 8));
  const rollingHorizon = 8 + Math.ceil(16 * phase) + quietExtension;
  const remainingMoves = Math.max(EXPECTED_GAME_MOVES - clock.completedMoves, rollingHorizon);
  const transmissionMs = transmissionReserveMs(clock.lagMs);
  const reserveMs = Math.max(1000, Math.min(10_000, clock.initialMs * 0.03), transmissionMs);
  const spendableMs = Math.max(0, clock.remainingMs - reserveMs);
  // The current move earns its increment only after submission. Count future increments only.
  const futureIncrementMs = Math.max(0, clock.incrementMs) * (remainingMoves - 1);
  const equalShareMs = (spendableMs + futureIncrementMs) / remainingMoves;
  // Even a very large increment cannot fund this move with time that is not on the clock yet.
  const safeTurnMs = Math.max(0, (clock.remainingMs - transmissionMs) / 4);
  const emergency = clock.remainingMs <= reserveMs * 2;
  return {
    totalMs: emergency ? 0 : Math.floor(Math.min(equalShareMs, safeTurnMs)),
    analysisMs: Math.floor(
      emergency ? Math.min(250, safeTurnMs) : Math.min(equalShareMs, safeTurnMs),
    ),
    remainingMoves,
    reserveMs,
  };
}

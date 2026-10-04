import type { BotSettings } from '../../../../../../packages/contracts/src/index.js';
import { sleep } from '../../../shared/async.js';
import { TurnDelay } from '../turn-delay.js';
import {
  calculateDynamicTurnBudget,
  transmissionReserveMs,
  type TurnClock,
} from './dynamic-turn-budget.js';

/** Owns one target per position; clock corrections adjust it without restarting elapsed time. */
export class TurnTiming {
  private readonly delay: TurnDelay;

  constructor(
    private readonly settings: Pick<BotSettings, 'dynamicDelay' | 'randomDelayMaxMs'>,
    private readonly getClock: () => TurnClock | null,
    random: () => number = Math.random,
    now: () => number = () => performance.now(),
    waitFor: typeof sleep = sleep,
  ) {
    const randomTargetMs = settings.dynamicDelay
      ? 0
      : Math.floor(random() * (settings.randomDelayMaxMs + 1));
    this.delay = new TurnDelay(
      (elapsedMs) => {
        const clock = this.getClock();
        if (!clock) return settings.dynamicDelay ? 0 : randomTargetMs;
        const safeRemainingMs = Math.max(0, clock.remainingMs - transmissionReserveMs(clock.lagMs));
        const budget = calculateDynamicTurnBudget({
          ...clock,
          remainingMs: clock.remainingMs + (clock.running ? elapsedMs : 0),
        });
        if (clock.remainingMs <= budget.reserveMs * 2) return 0;
        const targetMs = settings.dynamicDelay ? budget.totalMs : randomTargetMs;
        return Math.min(targetMs, elapsedMs + safeRemainingMs);
      },
      now,
      waitFor,
    );
  }

  readonly remainingAnalysisMs = (): number | null => {
    const clock = this.getClock();
    if (!clock) return null;
    const safeRemainingMs = Math.max(0, clock.remainingMs - transmissionReserveMs(clock.lagMs));
    if (!this.settings.dynamicDelay) return clock.running ? safeRemainingMs : null;
    const elapsedMs = this.delay.elapsedMs;
    const budget = calculateDynamicTurnBudget({
      ...clock,
      remainingMs: clock.remainingMs + (clock.running ? elapsedMs : 0),
    });
    return Math.max(0, Math.min(budget.analysisMs - elapsedMs, safeRemainingMs));
  };

  wait(signal: AbortSignal, onWaiting: (remainingMs: number) => void): Promise<void> {
    return this.delay.wait(signal, onWaiting);
  }
}

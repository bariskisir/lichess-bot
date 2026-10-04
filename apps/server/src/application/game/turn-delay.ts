import { sleep } from '../../shared/async.js';

/** A turn's total target includes all elapsed queue, connection, and analysis time. */
export class TurnDelay {
  private readonly startedAt: number;

  constructor(
    private readonly targetMs: number | ((elapsedMs: number) => number),
    private readonly now: () => number = () => performance.now(),
    private readonly waitFor: typeof sleep = sleep,
  ) {
    this.startedAt = this.now();
  }

  get elapsedMs(): number {
    return Math.max(0, this.now() - this.startedAt);
  }

  get remainingMs(): number {
    const elapsed = this.elapsedMs;
    const target = typeof this.targetMs === 'number' ? this.targetMs : this.targetMs(elapsed);
    return Math.max(0, target - elapsed);
  }

  async wait(signal: AbortSignal, onWaiting: (remainingMs: number) => void): Promise<void> {
    while (true) {
      signal.throwIfAborted();
      const remaining = this.remainingMs;
      if (!remaining) return;
      onWaiting(remaining);
      await this.waitFor(
        typeof this.targetMs === 'number' ? remaining : Math.min(100, remaining),
        signal,
      );
    }
  }
}

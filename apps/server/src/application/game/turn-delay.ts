import { sleep } from '../../shared/async.js';

/** A turn's random target includes all elapsed queue, connection, and analysis time. */
export class TurnDelay {
  private readonly deadline: number;

  constructor(
    maximumMs: number,
    random: () => number = Math.random,
    private readonly now: () => number = () => performance.now(),
    private readonly waitFor: typeof sleep = sleep,
  ) {
    this.deadline = this.now() + Math.floor(random() * (maximumMs + 1));
  }

  async wait(signal: AbortSignal, onWaiting: () => void): Promise<void> {
    signal.throwIfAborted();
    const remaining = Math.max(0, this.deadline - this.now());
    if (!remaining) return;
    onWaiting();
    await this.waitFor(remaining, signal);
  }
}

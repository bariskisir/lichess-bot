import { AuthenticationError } from '../../domain/lichess/gateway.js';
import { sleep } from '../../shared/async.js';
import { DEFAULT_SETTINGS } from '../../../../../packages/contracts/src/index.js';
import { LichessHttpError } from './lichess-errors.js';

export interface LichessRetryOptions {
  attempts: number;
  delayMs: number;
}

/** One bounded policy for all Lichess HTTP operations and socket handshakes. */
export class LichessRetry {
  private readonly options: LichessRetryOptions;
  private cooldownUntil = 0;
  constructor(
    options?: LichessRetryOptions,
    private readonly wait: (ms: number, signal: AbortSignal) => Promise<void> = sleep,
  ) {
    this.options = options ?? {
      attempts: DEFAULT_SETTINGS.requestAttempts,
      delayMs: DEFAULT_SETTINGS.requestDelayMs,
    };
    if (
      !Number.isInteger(this.options.attempts) ||
      this.options.attempts < 1 ||
      !Number.isFinite(this.options.delayMs) ||
      this.options.delayMs < 0
    )
      throw new Error('Invalid Lichess retry policy.');
  }
  async run<T>(operation: () => Promise<T>, signal: AbortSignal): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      signal.throwIfAborted();
      if (this.cooldownUntil > Date.now()) await this.wait(this.cooldownUntil - Date.now(), signal);
      try {
        return await operation();
      } catch (error) {
        signal.throwIfAborted();
        if (error instanceof LichessHttpError && error.retryAfterMs > 0)
          this.cooldownUntil = Math.max(this.cooldownUntil, Date.now() + error.retryAfterMs);
        if (attempt >= this.options.attempts || !this.retryable(error)) throw error;
        const serverDelay = error instanceof LichessHttpError ? error.retryAfterMs : 0;
        await this.wait(Math.max(this.options.delayMs, serverDelay), signal);
      }
    }
  }
  private retryable(error: unknown): boolean {
    if (error instanceof AuthenticationError) return false;
    if (error instanceof LichessHttpError)
      return error.status >= 500 || [408, 425, 429].includes(error.status);
    return error instanceof Error && error.name !== 'AbortError';
  }
}

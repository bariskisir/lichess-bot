import { setTimeout as delay } from 'node:timers/promises';

export function abortError(message = 'Operation cancelled.'): Error {
  return new DOMException(message, 'AbortError');
}

export function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return delay(Math.max(0, ms), undefined, { signal });
}

export function retryDelay(attempt: number): number {
  return Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5)) + Math.floor(Math.random() * 250);
}

export function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, resolve, reject };
}

export class Pulse {
  private readonly listeners = new Set<() => void>();
  notify(): void {
    for (const listener of [...this.listeners]) listener();
  }
  async wait(ms: number, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        this.listeners.delete(finish);
        signal.removeEventListener('abort', abort);
      };
      const finish = () => {
        cleanup();
        resolve();
      };
      const abort = () => {
        cleanup();
        reject(signal.reason);
      };
      const timer = setTimeout(finish, Math.max(1, ms));
      this.listeners.add(finish);
      signal.addEventListener('abort', abort, { once: true });
    });
  }
}

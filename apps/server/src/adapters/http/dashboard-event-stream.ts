import type { ServerResponse } from 'node:http';
import type { DashboardSnapshot } from '../../../../../packages/contracts/src/index.js';

type Subscriber = (send: (snapshot: DashboardSnapshot) => void) => () => void;
const HEARTBEAT_MS = 15_000;
const MAX_BUFFERED_BYTES = 1024 * 1024;

/** Owns one SSE response so closing it stops all publishers before calling end(). */
export class DashboardEventStream {
  private closed = false;
  private heartbeat?: ReturnType<typeof setInterval>;
  private unsubscribe?: () => void;

  constructor(
    private readonly response: ServerResponse,
    private readonly authorized: () => boolean,
    private readonly onClose: () => void,
  ) {
    response.once('finish', this.dispose);
    response.once('close', this.dispose);
    // Keep this listener for late errors already queued by Node when end() was called.
    response.on('error', this.onError);
  }

  start(initial: DashboardSnapshot, subscribe: Subscriber): void {
    try {
      if (!this.ensureOpen()) return;
      this.response.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      this.send(initial);
      if (this.closed) return;
      const unsubscribe = subscribe(this.send);
      if (this.closed) {
        unsubscribe();
        return;
      }
      this.unsubscribe = unsubscribe;
      this.heartbeat = setInterval(this.sendHeartbeat, HEARTBEAT_MS);
      this.heartbeat.unref();
    } catch {
      this.onError();
    }
  }

  readonly send = (snapshot: DashboardSnapshot): void => {
    this.write(() => `id: ${snapshot.revision}\ndata: ${JSON.stringify(snapshot)}\n\n`);
  };

  private readonly sendHeartbeat = (): void => {
    this.write(() => ': heartbeat\n\n');
  };

  private ensureOpen(): boolean {
    if (this.closed) return false;
    if (
      this.response.destroyed ||
      this.response.writableEnded ||
      this.response.writableFinished ||
      !this.authorized() ||
      this.response.writableLength > MAX_BUFFERED_BYTES
    ) {
      this.close();
      return false;
    }
    return true;
  }

  private write(frame: () => string): void {
    try {
      if (this.ensureOpen()) this.response.write(frame());
    } catch {
      this.onError();
    }
  }

  /** Runs synchronously and once, even when finish, close, and error arrive together. */
  private readonly dispose = (): void => {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.heartbeat);
    this.heartbeat = undefined;
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.response.off('finish', this.dispose);
    this.response.off('close', this.dispose);
    this.onClose();
  };

  private readonly onError = (): void => {
    this.dispose();
    if (!this.response.destroyed) this.response.destroy();
  };

  readonly close = (): void => {
    this.dispose();
    if (this.response.destroyed || this.response.writableEnded) return;
    try {
      this.response.end();
    } catch {
      this.onError();
    }
  };
}

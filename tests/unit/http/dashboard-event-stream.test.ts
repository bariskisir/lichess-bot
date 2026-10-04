import { EventEmitter } from 'node:events';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardEventStream } from '../../../apps/server/src/adapters/http/dashboard-event-stream.js';
import { DashboardStore } from '../../../apps/server/src/application/dashboard/dashboard-store.js';
import { DEFAULT_SETTINGS, type DashboardSnapshot } from '../../../packages/contracts/src/index.js';

// Finish/close are deliberately deferred to exercise callbacks already queued by Node.
class DeferredResponse extends EventEmitter {
  destroyed = false;
  writableEnded = false;
  writableFinished = false;
  writableLength = 0;
  readonly writeHead = vi.fn();
  readonly write = vi.fn((_frame: string) => true);
  readonly end = vi.fn(() => {
    this.writableEnded = true;
    return this;
  });
  readonly destroy = vi.fn(() => {
    this.destroyed = true;
    return this;
  });
}

const snapshot = new DashboardStore(DEFAULT_SETTINGS).snapshot();
const streams: DashboardEventStream[] = [];

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  for (const stream of streams.splice(0)) stream.close();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function connection() {
  const response = new DeferredResponse();
  const authorized = vi.fn(() => true);
  const closed = vi.fn();
  const unsubscribe = vi.fn();
  const subscribe = vi.fn((_send: (snapshot: DashboardSnapshot) => void) => unsubscribe);
  const stream = new DashboardEventStream(
    response as unknown as ServerResponse,
    authorized,
    closed,
  );
  streams.push(stream);
  return { stream, response, authorized, closed, unsubscribe, subscribe };
}

function queuedHeartbeat(app: ReturnType<typeof connection>) {
  const interval = vi.spyOn(globalThis, 'setInterval');
  app.stream.start(snapshot, app.subscribe);
  const callback = interval.mock.calls.at(-1)![0];
  if (typeof callback !== 'function') throw new Error('Expected a heartbeat callback.');
  return () => callback();
}

describe('dashboard event stream lifecycle', () => {
  it('handles the actual Node write-after-end error without an unhandled error event', async () => {
    const response = new ServerResponse(new IncomingMessage(new Socket()));
    const unsubscribe = vi.fn();
    const closed = vi.fn();
    const stream = new DashboardEventStream(response, () => true, closed);
    streams.push(stream);
    stream.start(snapshot, () => unsubscribe);
    stream.close();
    // Deliberately reproduce a stale writer to verify the final error boundary too.
    const error = new Promise<NodeJS.ErrnoException>((resolve) => response.once('error', resolve));
    response.write(': stale heartbeat\n\n');
    expect((await error).code).toBe('ERR_STREAM_WRITE_AFTER_END');
    expect(response.destroyed).toBe(true);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(closed).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('preserves SSE framing and delivers updates and heartbeats while connected', () => {
    const app = connection();
    app.stream.start(snapshot, app.subscribe);
    expect(app.response.write.mock.calls[0]![0]).toBe(
      `id: ${snapshot.revision}\ndata: ${JSON.stringify(snapshot)}\n\n`,
    );
    app.subscribe.mock.calls[0]![0]({ ...snapshot, revision: 42 });
    expect(app.response.write.mock.calls.at(-1)![0]).toContain('id: 42\ndata:');
    vi.advanceTimersByTime(15_000);
    expect(app.response.write).toHaveBeenLastCalledWith(': heartbeat\n\n');
    expect(app.closed).not.toHaveBeenCalled();
  });

  it('stops publishers before end and ignores queued callbacks and late errors', () => {
    const app = connection();
    const heartbeat = queuedHeartbeat(app);
    app.response.end.mockImplementationOnce(() => {
      expect(app.unsubscribe).toHaveBeenCalledExactlyOnceWith();
      expect(app.closed).toHaveBeenCalledExactlyOnceWith();
      expect(vi.getTimerCount()).toBe(0);
      app.response.writableEnded = true;
      return app.response;
    });
    app.stream.close();
    heartbeat();
    app.subscribe.mock.calls[0]![0](snapshot);
    app.stream.close();
    app.response.emit('finish');
    app.response.emit('close');
    expect(() =>
      app.response.emit(
        'error',
        Object.assign(new Error('write after end'), {
          code: 'ERR_STREAM_WRITE_AFTER_END',
        }),
      ),
    ).not.toThrow();
    expect(app.response.write).toHaveBeenCalledTimes(1);
    expect(app.response.end).toHaveBeenCalledTimes(1);
    expect(app.unsubscribe).toHaveBeenCalledTimes(1);
    expect(app.closed).toHaveBeenCalledTimes(1);
  });

  it.each(['writableEnded', 'destroyed'] as const)(
    'blocks queued writes when %s is set before lifecycle events arrive',
    (state) => {
      const app = connection();
      const heartbeat = queuedHeartbeat(app);
      app.response[state] = true;
      heartbeat();
      app.subscribe.mock.calls[0]![0](snapshot);
      expect(app.response.write).toHaveBeenCalledTimes(1);
      expect(app.response.end).not.toHaveBeenCalled();
      expect(app.unsubscribe).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each(['finish', 'close'])(
    'releases the subscription and heartbeat immediately on %s',
    (event) => {
      const app = connection();
      const heartbeat = queuedHeartbeat(app);
      app.response.emit(event);
      heartbeat();
      app.subscribe.mock.calls[0]![0](snapshot);
      expect(app.response.write).toHaveBeenCalledTimes(1);
      expect(app.unsubscribe).toHaveBeenCalledTimes(1);
      expect(app.closed).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('contains asynchronous response errors while other connections keep receiving data', async () => {
    const failed = connection();
    const healthy = connection();
    const heartbeat = queuedHeartbeat(failed);
    healthy.stream.start(snapshot, healthy.subscribe);
    await Promise.resolve().then(() =>
      failed.response.emit(
        'error',
        Object.assign(new Error('write after end'), {
          code: 'ERR_STREAM_WRITE_AFTER_END',
        }),
      ),
    );
    heartbeat();
    failed.subscribe.mock.calls[0]![0](snapshot);
    healthy.subscribe.mock.calls[0]![0]({ ...snapshot, revision: 43 });
    vi.advanceTimersByTime(15_000);
    expect(failed.response.destroy).toHaveBeenCalledTimes(1);
    expect(failed.response.write).toHaveBeenCalledTimes(1);
    expect(failed.unsubscribe).toHaveBeenCalledTimes(1);
    expect(healthy.response.write).toHaveBeenCalledTimes(3);
    expect(healthy.closed).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);
  });

  it('contains synchronous write failures and releases the connection', () => {
    const app = connection();
    const heartbeat = queuedHeartbeat(app);
    app.response.write.mockImplementationOnce(() => {
      throw new Error('Socket failed.');
    });
    expect(() => heartbeat()).not.toThrow();
    app.stream.send(snapshot);
    expect(app.response.destroy).toHaveBeenCalledTimes(1);
    expect(app.response.write).toHaveBeenCalledTimes(2);
    expect(app.unsubscribe).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('closes revoked sessions permanently even if authorization later changes', () => {
    const app = connection();
    const heartbeat = queuedHeartbeat(app);
    app.authorized.mockReturnValue(false);
    heartbeat();
    app.authorized.mockReturnValue(true);
    heartbeat();
    app.subscribe.mock.calls[0]![0](snapshot);
    expect(app.response.write).toHaveBeenCalledTimes(1);
    expect(app.response.end).toHaveBeenCalledTimes(1);
    expect(app.unsubscribe).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('applies the slow-client buffer limit to heartbeat writes too', () => {
    const app = connection();
    const heartbeat = queuedHeartbeat(app);
    app.response.writableLength = 1024 * 1024 + 1;
    heartbeat();
    app.stream.send(snapshot);
    expect(app.response.write).toHaveBeenCalledTimes(1);
    expect(app.response.end).toHaveBeenCalledTimes(1);
    expect(app.unsubscribe).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not attach publishers when the connection is already unauthorized', () => {
    const app = connection();
    app.authorized.mockReturnValue(false);
    app.stream.start(snapshot, app.subscribe);
    expect(app.response.writeHead).not.toHaveBeenCalled();
    expect(app.response.write).not.toHaveBeenCalled();
    expect(app.subscribe).not.toHaveBeenCalled();
    expect(app.closed).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('disposes a subscription that closes synchronously while being attached', () => {
    const app = connection();
    app.subscribe.mockImplementationOnce((send) => {
      app.authorized.mockReturnValue(false);
      send(snapshot);
      return app.unsubscribe;
    });
    app.stream.start(snapshot, app.subscribe);
    expect(app.unsubscribe).toHaveBeenCalledTimes(1);
    expect(app.closed).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});

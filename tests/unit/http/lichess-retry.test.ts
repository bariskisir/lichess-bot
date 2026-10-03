import { afterEach, describe, expect, it, vi } from 'vitest';
import { LichessRetry } from '../../../apps/server/src/adapters/lichess/lichess-retry.js';
import { LichessHttp } from '../../../apps/server/src/adapters/lichess/lichess-http.js';
import { LichessHttpError } from '../../../apps/server/src/adapters/lichess/lichess-errors.js';
import { AuthenticationError } from '../../../apps/server/src/domain/lichess/gateway.js';
import { DEFAULT_USER_AGENT } from '../../../packages/contracts/src/index.js';

afterEach(() => vi.useRealTimers());
const wait = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    const finish = () => {
      signal.removeEventListener('abort', abort);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      reject(signal.reason);
    };
    signal.addEventListener('abort', abort, { once: true });
  });

describe('central Lichess retry policy', () => {
  it('makes three total attempts separated by exactly one second by default', async () => {
    vi.useFakeTimers();
    const times: number[] = [];
    const request = vi.fn(async () => {
      times.push(Date.now());
      if (times.length < 3) throw new TypeError('Network unavailable');
      return 'connected';
    });
    const result = new LichessRetry(undefined, wait).run(request, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(1999);
    expect(request).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toBe('connected');
    expect(times[1]! - times[0]!).toBe(1000);
    expect(times[2]! - times[1]!).toBe(1000);
  });
  it('stops at the attempt limit without retrying permanent or authentication errors', async () => {
    vi.useFakeTimers();
    const permanent = vi.fn(async () => {
      throw new LichessHttpError(404);
    });
    await expect(
      new LichessRetry(undefined, wait).run(permanent, new AbortController().signal),
    ).rejects.toMatchObject({ status: 404 });
    expect(permanent).toHaveBeenCalledTimes(1);
    const expired = vi.fn(async () => {
      throw new AuthenticationError();
    });
    await expect(
      new LichessRetry(undefined, wait).run(expired, new AbortController().signal),
    ).rejects.toBeInstanceOf(AuthenticationError);
    expect(expired).toHaveBeenCalledTimes(1);
    const unavailable = vi.fn(async () => {
      throw new LichessHttpError(503);
    });
    const failure = expect(
      new LichessRetry(undefined, wait).run(unavailable, new AbortController().signal),
    ).rejects.toMatchObject({ status: 503 });
    await vi.advanceTimersByTimeAsync(2000);
    await failure;
    expect(unavailable).toHaveBeenCalledTimes(3);
  });
  it('honors server cooldown and cancels retry delays promptly', async () => {
    vi.useFakeTimers();
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new LichessHttpError(429, 90_000))
      .mockResolvedValue('ready');
    const result = new LichessRetry(undefined, wait).run(operation, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(89_999);
    expect(operation).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toBe('ready');
    const controller = new AbortController();
    const failed = vi.fn(async () => {
      throw new TypeError('Offline');
    });
    const cancelled = expect(
      new LichessRetry(undefined, wait).run(failed, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(100);
    controller.abort();
    await cancelled;
    expect(failed).toHaveBeenCalledTimes(1);
  });
  it('applies the same policy to identity, profile, playing-game and snapshot requests', async () => {
    vi.useFakeTimers();
    for (const path of [
      '/auth/check',
      '/api/user/testbot',
      '/account/now-playing?nb=100',
      '/abcdefghwxyz',
    ]) {
      const request = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(new Response(null, { status: 503 }))
        .mockResolvedValueOnce(new Response(null, { status: 502 }))
        .mockImplementation(
          async () =>
            new Response('{}', {
              headers: { 'content-type': 'application/json', 'x-user': 'testbot' },
            }),
        );
      const http = new LichessHttp(
        'lila2=fake-session',
        request,
        { userAgent: DEFAULT_USER_AGENT },
        new LichessRetry(undefined, wait),
      );
      const result =
        path === '/auth/check'
          ? http.identity(new AbortController().signal)
          : http.json(path, new AbortController().signal);
      await vi.advanceTimersByTimeAsync(2000);
      await result;
      expect(request).toHaveBeenCalledTimes(3);
      expect(new URL(String(request.mock.calls[0]![0])).pathname).toBe(path.split('?')[0]);
    }
  });
});

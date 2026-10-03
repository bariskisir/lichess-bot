import { AuthenticationError } from '../../domain/lichess/gateway.js';
import { DEFAULT_TRANSPORT, type LichessTransportOptions } from './transport-options.js';
import { LichessHttpError, retryAfterMilliseconds } from './lichess-errors.js';
import { LichessRetry } from './lichess-retry.js';

export class LichessHttp {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    private readonly cookie: string,
    private readonly request: typeof fetch = fetch,
    private readonly options: LichessTransportOptions = DEFAULT_TRANSPORT,
    private readonly retry = new LichessRetry(options.retry),
  ) {}

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.then(operation);
    this.queue = next.catch(() => {});
    return next;
  }
  identity(signal: AbortSignal): Promise<string> {
    return this.execute('/auth/check', signal, async (response) => {
      const id = response.headers.get('x-user');
      await response.body?.cancel();
      if (!id) throw new AuthenticationError();
      return id;
    });
  }
  json(path: string, signal: AbortSignal): Promise<unknown> {
    return this.execute(path, signal, async (response) => {
      if (!response.headers.get('content-type')?.includes('json')) {
        await response.body?.cancel();
        throw new AuthenticationError(
          'Expected Lichess game data. Verify the session or check for protocol changes.',
        );
      }
      return response.json();
    });
  }
  private execute<T>(
    path: string,
    signal: AbortSignal,
    consume: (response: Response) => Promise<T>,
  ): Promise<T> {
    return this.serialize(() =>
      this.retry.run(async () => consume(await this.fetch(path, signal)), signal),
    );
  }
  private async fetch(path: string, signal: AbortSignal): Promise<Response> {
    signal.throwIfAborted();
    const response = await this.request(new URL(path, 'https://lichess.org'), {
      signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
      redirect: 'manual',
      headers: {
        Cookie: this.cookie,
        Accept: 'application/web.lichess+json',
        'X-Requested-With': 'XMLHttpRequest',
        'User-Agent': this.options.userAgent,
      },
    });
    if (!response.ok) {
      await response.body?.cancel();
      if ([401, 403, 302, 303].includes(response.status)) throw new AuthenticationError();
      throw new LichessHttpError(
        response.status,
        retryAfterMilliseconds(response.headers.get('retry-after'), response.status),
      );
    }
    return response;
  }
}

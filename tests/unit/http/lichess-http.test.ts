import { describe, expect, it, vi } from 'vitest';
import { LichessHttp } from '../../../apps/server/src/adapters/lichess/lichess-http.js';
import { DEFAULT_USER_AGENT } from '../../../apps/server/src/adapters/lichess/transport-options.js';

describe('Lichess HTTP transport', () => {
  it('uses a browser User-Agent by default and permits an explicit replacement', async () => {
    const request = vi.fn<typeof fetch>(
      async () => new Response(null, { status: 200, headers: { 'x-user': 'testbot' } }),
    );
    await new LichessHttp('lila2=fake-session', request).identity(new AbortController().signal);
    expect(request.mock.calls[0]?.[1]?.headers).toMatchObject({ 'User-Agent': DEFAULT_USER_AGENT });
    expect(DEFAULT_USER_AGENT).not.toContain('lichess-bot');
    await new LichessHttp('lila2=fake-session', request, {
      userAgent: 'Custom browser identity',
    }).identity(new AbortController().signal);
    expect(request.mock.calls[1]?.[1]?.headers).toMatchObject({
      'User-Agent': 'Custom browser identity',
    });
  });
  it('rejects an unauthenticated response without leaking session values', async () => {
    const request = vi.fn<typeof fetch>(async () => new Response(null, { status: 403 }));
    await expect(
      new LichessHttp('lila2=secret-value', request).identity(new AbortController().signal),
    ).rejects.toMatchObject({ name: 'AuthenticationError' });
  });
  it('allows cancelling a queued request during a shared rate-limit cooldown', async () => {
    const request = vi.fn<typeof fetch>(
      async () => new Response(null, { status: 429, headers: { 'retry-after': '90' } }),
    );
    const http = new LichessHttp('lila2=fake-session', request, {
      userAgent: DEFAULT_USER_AGENT,
      retry: { attempts: 1, delayMs: 1000 },
    });
    await expect(http.identity(new AbortController().signal)).rejects.toMatchObject({
      status: 429,
    });
    const controller = new AbortController();
    const pending = http.identity(controller.signal);
    const rejection = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await rejection;
    expect(request).toHaveBeenCalledTimes(1);
  });
});

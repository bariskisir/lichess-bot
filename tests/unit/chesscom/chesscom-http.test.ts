import { describe, expect, it, vi } from 'vitest';
import { ChesscomHttp } from '../../../apps/server/src/adapters/chesscom/chesscom-http.js';

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('chess.com HTTP', () => {
  it('authenticates from the user-properties endpoint and resolves the username', async () => {
    const request = vi.fn(async (url: URL) => {
      if (String(url).includes('GetPropertiesForAuthenticatedUser'))
        return jsonResponse({ userProperties: { user: 'user-uuid' } });
      if (String(url).includes('id-to-data'))
        return jsonResponse({ 'user-uuid': { id: 1, username: 'ChessPlayer' } });
      throw new Error(`unexpected ${url}`);
    });
    const http = new ChesscomHttp('session=abc', request as never);
    const signal = AbortSignal.timeout(1000);
    await expect(http.authenticatedUserId(signal)).resolves.toBe('user-uuid');
    await expect(http.username('user-uuid', signal)).resolves.toBe('ChessPlayer');
  });

  it('creates a rated seek with ISO time controls and lists active games', async () => {
    let seekBody: unknown;
    const request = vi.fn(async (url: URL, init?: RequestInit) => {
      if (String(url).includes('/service/matcher/seeks/chess')) {
        seekBody = JSON.parse(String(init?.body));
        return jsonResponse({ id: 'seek-id', userId: 'user-uuid' });
      }
      return jsonResponse({ games: [{ id: 'game-uuid' }] });
    });
    const http = new ChesscomHttp('session=abc', request as never);
    const signal = AbortSignal.timeout(1000);
    await expect(http.seek('3+2', signal)).resolves.toMatchObject({ id: 'seek-id' });
    expect(seekBody).toMatchObject({
      rated: true,
      timeControl: { base: 'PT180S', increment: 'PT2S' },
    });
    expect(await http.activeGames(signal)).toEqual([{ id: 'game-uuid' }]);
  });

  it('rejects unauthenticated sessions', async () => {
    const request = vi.fn(async () => new Response('no', { status: 401 }));
    const http = new ChesscomHttp('bad', request as never);
    await expect(http.authenticatedUserId(AbortSignal.timeout(1000))).rejects.toThrow();
  });
});

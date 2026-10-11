import { describe, expect, it, vi } from 'vitest';
import { WebChesscomGateway } from '../../../apps/server/src/adapters/chesscom/web-gateway.js';
import type { ChesscomHttp } from '../../../apps/server/src/adapters/chesscom/chesscom-http.js';

describe('chess.com seek lifecycle', () => {
  it('accepts a newborn inactive seek and lets it activate on its own', async () => {
    const http = {
      seek: vi.fn(async () => ({ id: 'new-seek', userId: 'user', state: 'inactive' })),
      cancelSeek: vi.fn(async () => {}),
    };
    const gateway = new WebChesscomGateway('PHPSESSID=x', undefined, undefined, http as unknown as ChesscomHttp);
    const signal = AbortSignal.timeout(1000);
    await expect(gateway.seek('1+0', signal)).resolves.toEqual({ id: 'new-seek', state: 'inactive' });
    expect(http.cancelSeek).not.toHaveBeenCalled();
    expect(http.seek).toHaveBeenCalledTimes(1);
  });

  it('reports seek liveness from the matcher list', async () => {
    const http = {
      seekStates: vi.fn(async () => [{ id: 'seek-a', state: 'active' }]),
    };
    const gateway = new WebChesscomGateway('PHPSESSID=x', undefined, undefined, http as unknown as ChesscomHttp);
    const signal = AbortSignal.timeout(1000);
    await expect(gateway.seekState('seek-a', signal)).resolves.toBe('active');
    await expect(gateway.seekState('missing', signal)).resolves.toBeNull();
  });
});

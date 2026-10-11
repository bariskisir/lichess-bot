import { describe, expect, it } from 'vitest';
import {
  parseGameRegion,
  rsocketUrl,
  FALLBACK_CHESSCOM_REGION,
} from '../../../apps/server/src/adapters/chesscom/web-gateway.js';

describe('chess.com game region', () => {
  it('reads the shard from live-game entry channels', () => {
    expect(
      parseGameRegion({ channel: 'play-eu-1-5/games/f305a451-c51e-11f1-a987-563c1101000f' }),
    ).toBe('play-eu-1-5');
    expect(
      parseGameRegion({ href: '/service/play-eu-1-5/chess/games/f305a451' }),
    ).toBe('play-eu-1-5');
    expect(
      parseGameRegion({
        transports: { rsocket: { url: 'wss://www.chess.com/service/play-us-2-5/rsocket' } },
      }),
    ).toBe('play-us-2-5');
    expect(parseGameRegion({})).toBeNull();
  });

  it('builds per-shard RSocket URLs with a captured fallback', () => {
    expect(rsocketUrl('play-eu-1-5')).toBe('wss://www.chess.com/service/play-eu-1-5/rsocket');
    expect(rsocketUrl(null)).toBe(`wss://www.chess.com/service/${FALLBACK_CHESSCOM_REGION}/rsocket`);
  });
});

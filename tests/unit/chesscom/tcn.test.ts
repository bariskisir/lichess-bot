import { describe, expect, it } from 'vitest';
import { decodeTCN, encodeTCN, tcnToUci } from '../../../apps/server/src/adapters/chesscom/tcn.js';

const ARCHIVED_MOVES =
  'muYIgvZRpx!Tfm2Ueg92kA8!bs5QlBIBuBWOfe0KiqKBvBQBdB6SBDTNDv2sjs7TcVTvmvN2abSAedRJqy47bP7ZvEZYgp97db2SPS1SES!?bPYQVDQPDK';

describe('chess.com TCN codec', () => {
  it('decodes the archived HAR game prefix', () => {
    const moves = decodeTCN(ARCHIVED_MOVES);
    expect(moves).toHaveLength(59);
    expect(moves.slice(0, 4)).toEqual([
      { from: 'e2', to: 'e3' },
      { from: 'c7', to: 'c5' },
      { from: 'g1', to: 'f3' },
      { from: 'd7', to: 'd6' },
    ]);
  });

  it('round-trips the live HAR opening through the shared alphabet', () => {
    expect(decodeTCN('ow')).toEqual([{ from: 'g2', to: 'g3' }]);
    expect(decodeTCN('0K')).toEqual([{ from: 'e7', to: 'e5' }]);
    expect(encodeTCN({ from: 'g2', to: 'g3' })).toBe('ow');
    expect(encodeTCN({ from: 'e7', to: 'e5' })).toBe('0K');
  });

  it('round-trips every promotion piece', () => {
    for (const promotion of ['q', 'n', 'r', 'b']) {
      const move = { from: 'e7', to: 'e8', promotion };
      expect(tcnToUci(decodeTCN(encodeTCN(move))[0]!)).toBe(`e7e8${promotion}`);
    }
  });

  it('rejects truncated or foreign encodings', () => {
    expect(() => decodeTCN('o')).toThrow();
    expect(() => decodeTCN('o ')).toThrow();
    expect(() => encodeTCN({ from: 'z9', to: 'e5' })).toThrow();
  });
});

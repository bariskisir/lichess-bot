import { describe, expect, it } from 'vitest';
import {
  chesscomTimeControl,
  displayPool,
  seekTimeControl,
} from '../../../apps/server/src/adapters/chesscom/pools.js';

describe('chess.com pools', () => {
  it('maps dashboard pools to matcher ISO durations', () => {
    expect(seekTimeControl('1+0')).toEqual({ base: 'PT60S', increment: 'PT0S' });
    expect(seekTimeControl('3+2')).toEqual({ base: 'PT180S', increment: 'PT2S' });
    expect(chesscomTimeControl('5+3')).toMatchObject({ baseMs: 300_000, incrementMs: 3000 });
  });

  it('displays millisecond clocks with dashboard labels', () => {
    expect(displayPool(60_000, 0)).toBe('1+0');
    expect(displayPool(180_000, 2000)).toBe('3+2');
  });
});

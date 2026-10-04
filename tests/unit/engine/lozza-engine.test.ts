import { describe, expect, it } from 'vitest';
import pino from 'pino';
import { LozzaEngine } from '../../../apps/server/src/adapters/engines/lozza/lozza-engine.js';
import { LOZZA_DISTRIBUTIONS } from '../../../apps/server/src/adapters/engines/lozza/lozza-distributions.js';
import { applyUci, enginePositionBoard } from '../../../apps/server/src/domain/game/position.js';

describe.each(LOZZA_DISTRIBUTIONS)('$name process', (distribution) => {
  it('searches complete history for both colors and returns distinct legal coordinate PVs', async () => {
    const engine = new LozzaEngine(pino({ level: 'silent' }), distribution);
    try {
      for (const moves of [['e2e4', 'e7e5'], ['d2d4']]) {
        const position = { moves };
        const result = await engine.analyze({
          gameId: 'history',
          position,
          depth: 4,
          variations: 3,
          signal: AbortSignal.timeout(20_000),
        });
        expect(result.variations).toHaveLength(3);
        expect(result.bestMove).toBe(result.variations[0]?.moves[0]);
        expect(new Set(result.variations.map((pv) => pv.moves[0])).size).toBe(3);
        for (const variation of result.variations) {
          expect(variation.depth).toBeGreaterThanOrEqual(4);
          const board = enginePositionBoard(position);
          for (const move of variation.moves) {
            expect(move).toMatch(/^[a-h][1-8][a-h][1-8][qrbn]?$/);
            expect(() => applyUci(board, move)).not.toThrow();
          }
        }
      }
    } finally {
      await engine.close();
    }
  }, 20_000);

  it('recognizes mate, emits promotion coordinates and handles a sole legal move', async () => {
    const engine = new LozzaEngine(pino({ level: 'silent' }), distribution);
    try {
      const matePosition = { initialFen: '7k/5Q2/6K1/8/8/8/8/8 w - - 0 1', moves: [] };
      const mate = await engine.analyze({
        gameId: 'mate',
        position: matePosition,
        depth: 5,
        variations: 1,
        signal: AbortSignal.timeout(20_000),
      });
      const mateBoard = enginePositionBoard(matePosition);
      applyUci(mateBoard, mate.bestMove);
      expect(mateBoard.isCheckmate()).toBe(true);
      expect(mate.variations[0]?.mate).toBe(1);

      const promotionPosition = { initialFen: '7k/P7/6K1/8/8/8/8/8 w - - 0 1', moves: [] };
      const promotion = await engine.analyze({
        gameId: 'promotion',
        position: promotionPosition,
        depth: 4,
        variations: 1,
        signal: AbortSignal.timeout(20_000),
      });
      expect(promotion.bestMove).toMatch(/^a7a8[qrbn]$/);
      expect(() =>
        applyUci(enginePositionBoard(promotionPosition), promotion.bestMove),
      ).not.toThrow();

      const forcedPosition = { initialFen: '7k/8/5K2/8/8/8/8/7R b - - 0 1', moves: [] };
      expect(enginePositionBoard(forcedPosition).moves()).toHaveLength(1);
      const forced = await engine.analyze({
        gameId: 'forced',
        position: forcedPosition,
        depth: 5,
        variations: 3,
        signal: AbortSignal.timeout(20_000),
      });
      expect(forced.variations).toHaveLength(1);
      expect(() => applyUci(enginePositionBoard(forcedPosition), forced.bestMove)).not.toThrow();
    } finally {
      await engine.close();
    }
  }, 20_000);

  it('returns a legal timed result and supports another search', async () => {
    const engine = new LozzaEngine(pino({ level: 'silent' }), distribution);
    const request = {
      gameId: 'timed',
      position: { moves: ['e2e4', 'e7e5'] },
      variations: 3,
      signal: AbortSignal.timeout(20_000),
    };
    try {
      await engine.analyze({ ...request, depth: 3 });
      const deadline = Date.now() + 250;
      const result = await engine.analyze({
        ...request,
        depth: 40,
        getSearchDeadline: () => deadline,
      });
      expect(() => applyUci(enginePositionBoard(request.position), result.bestMove)).not.toThrow();
      expect(result.variations[0]?.depth ?? 0).toBeLessThan(40);
      expect(
        (await engine.analyze({ ...request, depth: 3 })).variations[0]?.depth,
      ).toBeGreaterThanOrEqual(3);
    } finally {
      await engine.close();
    }
  }, 20_000);

  it('honors a shortened live deadline while its synchronous search is running', async () => {
    const engine = new LozzaEngine(pino({ level: 'silent' }), distribution);
    let deadline = Date.now() + 20_000;
    try {
      const result = await engine.analyze({
        gameId: 'live-deadline',
        position: { moves: ['e2e4'] },
        depth: 40,
        variations: 3,
        signal: AbortSignal.timeout(20_000),
        getSearchDeadline: () => deadline,
        onInfo: (variation) => {
          if (variation.depth >= 2) deadline = Date.now();
        },
      });
      expect(() =>
        applyUci(enginePositionBoard({ moves: ['e2e4'] }), result.bestMove),
      ).not.toThrow();
      const recovered = await engine.analyze({
        gameId: 'recovered',
        position: { moves: [] },
        depth: 3,
        variations: 1,
        signal: AbortSignal.timeout(20_000),
      });
      expect(() => applyUci(enginePositionBoard({ moves: [] }), recovered.bestMove)).not.toThrow();
    } finally {
      await engine.close();
    }
  }, 20_000);

  it('cancels an active search and starts a healthy replacement process', async () => {
    const engine = new LozzaEngine(pino({ level: 'silent' }), distribution);
    const cancellation = new AbortController();
    try {
      await expect(
        engine.analyze({
          gameId: 'cancelled',
          position: { moves: [] },
          depth: 40,
          variations: 1,
          signal: cancellation.signal,
          onInfo: () => cancellation.abort(),
        }),
      ).rejects.toMatchObject({ name: 'AbortError' });
      const recovered = await engine.analyze({
        gameId: 'recovered',
        position: { moves: [] },
        depth: 3,
        variations: 1,
        signal: AbortSignal.timeout(20_000),
      });
      expect(() => applyUci(enginePositionBoard({ moves: [] }), recovered.bestMove)).not.toThrow();
    } finally {
      await engine.close();
    }
  }, 20_000);
});

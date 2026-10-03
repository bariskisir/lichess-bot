import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import pino from 'pino';
import { StockfishEngine } from '../../../apps/server/src/adapters/engines/stockfish/stockfish-engine.js';
import { STOCKFISH_DISTRIBUTIONS } from '../../../apps/server/src/adapters/engines/stockfish/stockfish-distributions.js';
import {
  parseInfo,
  positionCommand,
} from '../../../apps/server/src/adapters/engines/stockfish/uci.js';
import { applyUci } from '../../../apps/server/src/domain/game/position.js';

describe('local Stockfish 19 Lite', () => {
  it('parses exact UCI scores and complete position history', () => {
    expect(parseInfo('info depth 12 multipv 2 score cp -34 nodes 2000 pv g1f3 b8c6')).toMatchObject(
      { depth: 12, index: 2, score: -0.34, mate: null },
    );
    expect(parseInfo('info depth 12 score cp 40 lowerbound pv e2e4')).toBeNull();
    expect(parseInfo('info depth 8 score mate 3 pv h5f7')).toMatchObject({ mate: 3 });
    expect(positionCommand({ moves: ['e2e4', 'e7e5'] })).toBe('position startpos moves e2e4 e7e5');
  });
  it.each(STOCKFISH_DISTRIBUTIONS)(
    'runs $name and returns a legal move at the requested depth',
    async (distribution) => {
      const engine = new StockfishEngine(16, pino({ level: 'silent' }), distribution);
      try {
        const response = await engine.analyze({
          gameId: 'integration',
          position: { moves: ['e2e4', 'e7e5'] },
          depth: 5,
          variations: 2,
          signal: AbortSignal.timeout(20_000),
        });
        const board = new Chess();
        board.move('e4');
        board.move('e5');
        expect(() => applyUci(board, response.bestMove)).not.toThrow();
        expect(response.variations[0]!.depth).toBeGreaterThanOrEqual(5);
        expect(response.variations).toHaveLength(2);
      } finally {
        await engine.close();
      }
    },
  );
});

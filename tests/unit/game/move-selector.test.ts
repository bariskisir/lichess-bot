import { describe, expect, it, vi } from 'vitest';
import { MoveSelector } from '../../../apps/server/src/application/game/move-selector.js';
import { GamePosition } from '../../../apps/server/src/domain/game/position.js';
import type { Analysis, AnalysisRequest } from '../../../apps/server/src/domain/engine/engine.js';
import { DEFAULT_SETTINGS } from '../../../packages/contracts/src/index.js';
import { gameSnapshot } from '../../fixtures/server.js';

describe('evaluation depth', () => {
  it('evaluates the root at the configured depth and verifies alternatives without changing the board', async () => {
    const position = new GamePosition(gameSnapshot(['e4', 'e5']));
    const fen = position.chess.fen();
    const analyze = vi.fn(async (request: AnalysisRequest): Promise<Analysis> => ({
      bestMove: request.position.moves.length === 2 ? 'g1f3' : 'b8c6',
      variations: [
        {
          index: 1,
          depth: request.depth,
          score: request.position.moves.length === 2 ? 0.5 : -0.3,
          mate: null,
          nodes: 100,
          moves: [request.position.moves.length === 2 ? 'g1f3' : 'b8c6'],
        },
      ],
    }));
    const onInfo = vi.fn();
    const selector = new MoveSelector({ analyze });
    const getDeadline = () => 1000;
    expect(
      await selector.select(
        'test-game',
        position,
        { ...DEFAULT_SETTINGS, evaluationDepth: 17, mistakeProbability: 0 },
        new AbortController().signal,
        onInfo,
        () => {},
        getDeadline,
      ),
    ).toBe('g1f3');
    expect(analyze.mock.calls.map(([request]) => [request.depth, request.variations])).toEqual([
      [7, 10],
      [17, 1],
      [17, 1],
    ]);
    expect(onInfo).toHaveBeenCalledWith(expect.objectContaining({ depth: 17 }));
    expect(analyze.mock.calls.every(([request]) => request.getDeadline === getDeadline)).toBe(true);
    expect(position.chess.fen()).toBe(fen);
  });
});

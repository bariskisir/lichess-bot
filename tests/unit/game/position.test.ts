import { describe, expect, it } from 'vitest';
import { GamePosition } from '../../../apps/server/src/domain/game/position.js';
import { gameSnapshot } from '../../fixtures/server.js';

describe('authoritative chess position', () => {
  it('preserves repetition history rather than sending only the latest FEN', () => {
    const position = new GamePosition(
      gameSnapshot(['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8']),
    );
    expect(position.chess.isThreefoldRepetition()).toBe(true);
    expect(position.enginePosition().moves).toHaveLength(8);
  });
  it('rejects incomplete history and a server board that differs from legal moves', () => {
    const snapshot = gameSnapshot(['e4']);
    snapshot.steps[1]!.ply = 2;
    expect(() => new GamePosition(snapshot)).toThrow('incomplete');
    const wrongBoard = gameSnapshot(['e4']);
    wrongBoard.steps[1]!.fen = gameSnapshot().initialFen;
    expect(() => new GamePosition(wrongBoard)).toThrow('differs');
  });
  it('checks candidates without mutating the current game', () => {
    const position = new GamePosition(gameSnapshot(['e4', 'e5']));
    const key = position.key;
    expect(position.candidate('g1f3').turn()).toBe('b');
    expect(position.key).toBe(key);
    expect(() => position.candidate('a1a8')).toThrow();
  });
});

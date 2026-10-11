import { describe, expect, it } from 'vitest';
import { resolvePlayers } from '../../../apps/server/src/application/runtime/chesscom-account-runner.js';

const DETAILS = [
  { id: 'white-uuid', username: 'WhitePlayer', rating: 1500 },
  { id: 'black-uuid', username: 'BlackPlayer', rating: 1500 },
];

describe('chess.com player resolution', () => {
  it('maps players[0] to White with names and ratings', () => {
    expect(
      resolvePlayers({ players: ['white-uuid', 'black-uuid'], playersDetails: DETAILS }, 'black-uuid', 'BlackPlayer'),
    ).toEqual({
      white: { id: 'white-uuid', name: 'WhitePlayer', rating: 1500, title: null },
      black: { id: 'black-uuid', name: 'BlackPlayer', rating: 1500, title: null },
    });
  });

  it('falls back to the account name and Opponent without details', () => {
    expect(resolvePlayers({}, 'user-uuid', 'Me')).toEqual({
      white: { id: 'user-uuid', name: 'Me', rating: null, title: null },
      black: { id: 'Opponent', name: 'Opponent', rating: null, title: null },
    });
  });
});

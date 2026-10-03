import type { Color, GameView } from '../../../../../packages/contracts/src/index.js';

export function resultColor(game: GameView): Color | 'draw' | null {
  if (!game.result || game.result === 'aborted') return null;
  if (game.result === 'draw') return 'draw';
  return game.result === 'win' ? game.color : game.color === 'white' ? 'black' : 'white';
}

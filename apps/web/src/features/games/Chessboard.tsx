import { memo } from 'react';
import { Chess, type Square } from 'chess.js';
import type { Color } from '../../../../../packages/contracts/src/index.js';
import './chessboard.scss';

interface Props {
  fen: string;
  orientation: Color;
  lastMove: string | null;
  check: boolean;
  coordinates?: boolean;
}
export const Chessboard = memo(function Chessboard({
  fen,
  orientation,
  lastMove,
  check,
  coordinates = true,
}: Props) {
  const board = new Chess(fen);
  const files = orientation === 'white' ? 'abcdefgh' : 'hgfedcba';
  const ranks = orientation === 'white' ? '87654321' : '12345678';
  const checkedColor = board.turn();
  return (
    <figure
      className="chessboard"
      aria-label={`Chess position, ${orientation} at the bottom. ${board.turn() === 'w' ? 'White' : 'Black'} to move${check ? ', in check' : ''}.`}
    >
      {[...ranks].flatMap((rank, row) =>
        [...files].map((file, column) => {
          const square = `${file}${rank}` as Square;
          const piece = board.get(square);
          const highlight = lastMove?.slice(0, 2) === square || lastMove?.slice(2, 4) === square;
          const inCheck = check && piece?.type === 'k' && piece.color === checkedColor;
          return (
            <div
              key={square}
              className={`chessboard__square ${(row + column) % 2 ? 'chessboard__square--dark' : 'chessboard__square--light'} ${highlight ? 'chessboard__square--last' : ''} ${inCheck ? 'chessboard__square--check' : ''}`}
            >
              {piece && (
                <img src={`/pieces/${piece.color}${piece.type}.png`} alt="" draggable={false} />
              )}
              {coordinates && column === 0 && <span className="chessboard__rank">{rank}</span>}
              {coordinates && row === 7 && <span className="chessboard__file">{file}</span>}
            </div>
          );
        }),
      )}
    </figure>
  );
});

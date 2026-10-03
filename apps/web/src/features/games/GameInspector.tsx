import { useEffect, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, Download, X } from 'lucide-react';
import type { GameView } from '../../../../../packages/contracts/src/index.js';
import { Chessboard } from './Chessboard.js';
import { Evaluation } from './Evaluation.js';
import { resultColor } from './game-result.js';
import { Button } from '../../shared/ui/Button.js';
import { titleCase } from '../../shared/format.js';
import './game-inspector.scss';

export function GameInspector({ game, onClose }: { game: GameView; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [reviewPly, setReviewPly] = useState<number | null>(null);
  const ply = Math.min(reviewPly ?? game.moves.length, game.moves.length);
  const board = new Chess(game.initialFen);
  for (const san of game.moves.slice(0, ply)) board.move(san);
  const last = board.history({ verbose: true }).at(-1);
  const orientation = game.color;
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  function exportPgn(): void {
    const chess = new Chess(game.initialFen);
    chess.header(
      'Event',
      'lichess-bot',
      'Site',
      game.id.startsWith('demo') || game.id.startsWith('history')
        ? 'Dashboard preview'
        : `https://lichess.org/${game.id}`,
      'White',
      game.white.name,
      'Black',
      game.black.name,
      'Date',
      new Date(game.startedAt).toISOString().slice(0, 10).replaceAll('-', '.'),
    );
    for (const move of game.moves) chess.move(move);
    const result =
      !game.result || game.result === 'aborted'
        ? '*'
        : game.result === 'draw'
          ? '1/2-1/2'
          : (game.result === 'win') === (game.color === 'white')
            ? '1-0'
            : '0-1';
    chess.header('Result', result);
    const url = URL.createObjectURL(new Blob([chess.pgn()], { type: 'application/x-chess-pgn' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${game.id}.pgn`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <dialog
      className="game-inspector"
      ref={dialog}
      onClose={onClose}
      aria-labelledby="inspector-title"
    >
      <div className="game-inspector__content">
        <header>
          <div>
            <h2 id="inspector-title">
              {game.white.name} <span className="muted">vs</span> {game.black.name}
            </h2>
            <p>
              {game.timeControl} · {game.rated ? 'Rated' : 'Casual'} ·{' '}
              {titleCase(game.result ?? game.activity)}
            </p>
          </div>
          <Button
            variant="ghost"
            className="icon-button"
            onClick={onClose}
            aria-label="Close game details"
          >
            <X />
          </Button>
        </header>
        <div className="game-inspector__layout">
          <div>
            <div className="game-inspector__position">
              <Evaluation
                evaluation={ply === game.moves.length ? game.evaluation : null}
                fen={board.fen()}
                orientation={orientation}
                result={ply === game.moves.length ? resultColor(game) : null}
              />
              <Chessboard
                fen={board.fen()}
                orientation={orientation}
                lastMove={last ? `${last.from}${last.to}` : null}
                check={board.isCheck()}
              />
            </div>
            <div className="game-inspector__navigation">
              <Button
                variant="ghost"
                className="icon-button"
                disabled={ply === 0}
                onClick={() => setReviewPly(0)}
                aria-label="Starting position"
              >
                <ChevronFirst />
              </Button>
              <Button
                variant="ghost"
                className="icon-button"
                disabled={ply === 0}
                onClick={() => setReviewPly(ply - 1)}
                aria-label="Previous move"
              >
                <ChevronLeft />
              </Button>
              <span>
                {ply} / {game.moves.length}
              </span>
              <Button
                variant="ghost"
                className="icon-button"
                disabled={ply === game.moves.length}
                onClick={() => setReviewPly(ply + 1)}
                aria-label="Next move"
              >
                <ChevronRight />
              </Button>
              <Button
                variant="ghost"
                className="icon-button"
                onClick={() => setReviewPly(null)}
                aria-label="Latest position"
              >
                <ChevronLast />
              </Button>
            </div>
          </div>
          <aside>
            <h3>Move history</h3>
            <div className="game-inspector__moves">
              {Array.from({ length: Math.ceil(game.moves.length / 2) }, (_, index) => (
                <div className="move-pair" key={index}>
                  <span>{index + 1}.</span>
                  {game.moves.slice(index * 2, index * 2 + 2).map((san, side) => (
                    <button
                      key={side}
                      className={ply === index * 2 + side + 1 ? 'is-selected' : ''}
                      onClick={() => setReviewPly(index * 2 + side + 1)}
                    >
                      {san}
                    </button>
                  ))}
                </div>
              ))}
              {!game.moves.length && <p className="muted">The first move has not been played.</p>}
            </div>
            <Button onClick={exportPgn}>
              <Download />
              Export PGN
            </Button>
          </aside>
        </div>
      </div>
    </dialog>
  );
}

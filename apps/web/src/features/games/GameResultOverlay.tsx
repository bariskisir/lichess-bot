import { useEffect, useRef } from 'react';
import { Flag, Handshake, CircleSlash, Trophy } from 'lucide-react';
import {
  RESULT_HOLD_MS,
  type GameResult,
  type GameView,
} from '../../../../../packages/contracts/src/index.js';
import { dashboardClient } from '../../shared/live/dashboard-client.js';
import { titleCase } from '../../shared/format.js';
import { resultColor } from './game-result.js';
import './game-result-overlay.scss';

const outcomes = {
  win: { label: 'Victory', Icon: Trophy },
  loss: { label: 'Defeat', Icon: Flag },
  draw: { label: 'Draw', Icon: Handshake },
  aborted: { label: 'Aborted', Icon: CircleSlash },
} satisfies Record<GameResult, { label: string; Icon: typeof Trophy }>;

const reasons: Record<string, string> = {
  mate: 'Checkmate',
  resign: 'Resignation',
  stalemate: 'Stalemate',
  draw: 'Draw agreed',
  outoftime: 'Time expired',
  timeout: 'Time expired',
  aborted: 'Game aborted',
  cheat: 'Fair play decision',
};

export function GameResultOverlay({ game }: { game: GameView & { result: GameResult } }) {
  const progress = useRef<HTMLSpanElement>(null);
  const { label, Icon } = outcomes[game.result];
  const winner = resultColor(game);
  const score =
    winner === 'white' ? '1–0' : winner === 'black' ? '0–1' : winner === 'draw' ? '½–½' : '—';

  useEffect(() => {
    if (!progress.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const remainingMs = Math.max(
      0,
      (game.finishedAt ?? dashboardClient.now()) + RESULT_HOLD_MS - dashboardClient.now(),
    );
    const animation = progress.current.animate(
      [
        { transform: `scaleX(${Math.min(1, remainingMs / RESULT_HOLD_MS)})` },
        { transform: 'scaleX(0)' },
      ],
      { duration: remainingMs, easing: 'linear', fill: 'forwards' },
    );
    return () => animation.cancel();
  }, [game.finishedAt]);

  return (
    <div
      className={`game-result-overlay game-result-overlay--${game.result}`}
      role="status"
      aria-label={`Game ${game.id}: ${label}`}
    >
      <div className="game-result-overlay__panel">
        <Icon aria-hidden="true" />
        <strong>{label}</strong>
        <span className="game-result-overlay__score">{score}</span>
        <span className="game-result-overlay__reason">
          {reasons[game.status] ?? titleCase(game.status)}
        </span>
        <span ref={progress} className="game-result-overlay__progress" aria-hidden="true" />
      </div>
    </div>
  );
}

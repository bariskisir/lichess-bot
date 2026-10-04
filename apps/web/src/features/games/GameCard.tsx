import { memo } from 'react';
import type { GameView, PlayerView } from '../../../../../packages/contracts/src/index.js';
import { Chessboard } from './Chessboard.js';
import { Clock } from './Clock.js';
import { Evaluation } from './Evaluation.js';
import { resultColor } from './game-result.js';
import { timeAgo } from '../../shared/format.js';
import { GameState } from './GameState.js';
import { GameResultOverlay } from './GameResultOverlay.js';
import './game-card.scss';

function Player({
  player,
  own,
  linkProfile,
}: {
  player: PlayerView;
  own: boolean;
  linkProfile: boolean;
}) {
  const profileUrl =
    linkProfile && /^[\w-]+$/.test(player.id)
      ? `https://lichess.org/@/${encodeURIComponent(player.id)}`
      : null;
  return (
    <span className="game-player">
      <span
        className={`game-player__color ${own ? 'game-player__color--own' : ''}`}
        aria-hidden="true"
      />
      {player.title && <span className="game-player__title">{player.title}</span>}
      {profileUrl ? (
        <a
          className="game-player__name"
          href={profileUrl}
          target="_blank"
          rel="noreferrer"
          title={`Open ${player.name}'s Lichess profile`}
        >
          {player.name}
        </a>
      ) : (
        <span className="game-player__name" title={player.name}>
          {player.name}
        </span>
      )}
      <span className="game-player__rating">{player.rating ?? '—'}</span>
    </span>
  );
}
export const GameCard = memo(function GameCard({
  game,
  onInspect,
  compact = false,
}: {
  game: GameView;
  onInspect: (game: GameView) => void;
  compact?: boolean;
}) {
  const orientation = game.color;
  const top = orientation === 'white' ? 'black' : 'white';
  const bottom = orientation;
  const sample = game.id.startsWith('demo') || game.id.startsWith('history');
  return (
    <article
      className={`game-card ${compact ? 'game-card--compact' : ''}`}
      aria-label={`Game ${game.id}: ${game.white.name} against ${game.black.name}`}
    >
      <div className="game-card__header">
        <div className="game-card__metadata">
          <span>
            {game.timeControl} <span className="muted">· {game.rated ? 'Rated' : 'Casual'}</span>
          </span>
          <span className="muted" aria-hidden="true">
            ·
          </span>
          {sample ? (
            <span className="game-card__id">{game.id}</span>
          ) : (
            <a
              className="game-card__id"
              href={`https://lichess.org/${game.id}`}
              target="_blank"
              rel="noreferrer"
              aria-label={`Open game ${game.id} on Lichess`}
            >
              {game.id}
            </a>
          )}
        </div>
        <GameState game={game} />
      </div>
      <div className="game-card__player">
        <Player player={game[top]} own={top === game.color} linkProfile={!sample} />
        {!compact && (
          <Clock clock={game.clock} color={top} turn={game.turn} finished={!!game.result} />
        )}
      </div>
      <div className="game-card__position">
        <Evaluation
          evaluation={game.evaluation}
          fen={game.fen}
          orientation={orientation}
          result={resultColor(game)}
        />
        <div className="game-card__board">
          <Chessboard
            fen={game.fen}
            orientation={orientation}
            lastMove={game.lastMove}
            check={game.check}
            coordinates={!compact}
          />
          {!game.result && (
            <button
              className="game-card__inspect"
              onClick={() => onInspect(game)}
              aria-label={`Inspect game ${game.id}`}
            />
          )}
          {!compact && game.result && <GameResultOverlay game={{ ...game, result: game.result }} />}
        </div>
      </div>
      <div className="game-card__player game-card__player--bottom">
        <div className="game-card__player-details">
          <Player player={game[bottom]} own={bottom === game.color} linkProfile={!sample} />
          {compact && (
            <span className="game-card__finished-at">
              {timeAgo(game.finishedAt ?? game.startedAt)}
            </span>
          )}
        </div>
        {!compact && (
          <Clock clock={game.clock} color={bottom} turn={game.turn} finished={!!game.result} />
        )}
      </div>
    </article>
  );
});

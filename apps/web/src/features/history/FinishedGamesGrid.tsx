import type { GameView } from '../../../../../packages/contracts/src/index.js';
import { GameCard } from '../games/GameCard.js';
import './finished-games-grid.scss';

export function FinishedGamesGrid({
  games,
  onInspect,
}: {
  games: GameView[];
  onInspect: (game: GameView) => void;
}) {
  return (
    <div className="finished-games-grid">
      {games.map((game) => (
        <GameCard key={game.id} game={game} onInspect={onInspect} compact />
      ))}
    </div>
  );
}

import type { GameView } from '../../../../../packages/contracts/src/index.js';
import { titleCase } from '../../shared/format.js';
import { useServerTime } from '../../shared/live/use-server-time.js';

function DelayCountdown({ until }: { until: number }) {
  const now = useServerTime();
  return (
    <span className="game-state__countdown">{(Math.max(0, until - now) / 1000).toFixed(1)}s</span>
  );
}

export function GameState({ game }: { game: GameView }) {
  return (
    <span className={`game-state game-state--${game.result ?? game.activity}`}>
      {titleCase(game.result ?? game.activity)}
      {game.activity === 'delaying' && !game.result && game.delayUntil != null && (
        <DelayCountdown until={game.delayUntil} />
      )}
    </span>
  );
}

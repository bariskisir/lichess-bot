import { memo } from 'react';
import type { Color, GameView } from '../../../../../packages/contracts/src/index.js';
import { useServerTime } from '../../shared/live/use-server-time.js';
import { formatClock } from '../../shared/format.js';

export const Clock = memo(function Clock({
  clock,
  color,
  turn,
  finished,
}: {
  clock: GameView['clock'];
  color: Color;
  turn: Color;
  finished: boolean;
}) {
  const active = !finished && !!clock?.running && color === turn;
  const tick = useServerTime(active);
  const remaining = clock
    ? Math.max(0, clock[color] - (active ? Math.max(0, tick - clock.updatedAt) / 1000 : 0))
    : null;
  return (
    <span
      className={`game-clock ${active ? 'game-clock--active' : ''} ${remaining !== null && remaining < 20 && !finished ? 'game-clock--low' : ''}`}
      aria-label={`${color} clock${active ? ', running' : ''}`}
    >
      {remaining === null ? '—' : formatClock(remaining)}
    </span>
  );
});

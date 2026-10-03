import { memo, useSyncExternalStore } from 'react';
import type { Color, GameView } from '../../../../../packages/contracts/src/index.js';
import { dashboardClient } from '../../shared/live/dashboard-client.js';
import { formatClock } from '../../shared/format.js';

const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;
let now = Date.now();
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!timer)
    timer = setInterval(() => {
      now = dashboardClient.now();
      for (const callback of listeners) callback();
    }, 250);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}
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
  const tick = useSyncExternalStore(subscribe, () => now);
  const active = !finished && !!clock?.running && color === turn;
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

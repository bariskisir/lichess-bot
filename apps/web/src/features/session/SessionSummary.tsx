import { Cpu, Radio } from 'lucide-react';
import type { DashboardSnapshot } from '../../../../../packages/contracts/src/index.js';
import { titleCase } from '../../shared/format.js';
import './session.scss';

export function SessionSummary({ snapshot }: { snapshot: DashboardSnapshot }) {
  const { runtime, engine } = snapshot;
  return (
    <section className="session-summary" aria-label="Session summary">
      <div className="session-summary__status">
        <span className={`status-dot status-dot--${runtime.phase}`} />
        <div>
          <strong>{titleCase(runtime.phase === 'idle' ? 'Ready to play' : runtime.phase)}</strong>
          <span>
            {runtime.phase === 'paused'
              ? 'Ongoing games continue'
              : runtime.phase === 'draining'
                ? 'Waiting for ongoing games'
                : runtime.searching
                  ? `${runtime.searching} ${runtime.searching === 1 ? 'account' : 'accounts'} searching`
                  : 'Ready for your next session'}
          </span>
        </div>
      </div>
      <div className="session-summary__progress">
        <span>Session games</span>
        <strong>
          {runtime.completed}
          <span> / {runtime.target.toLocaleString()}</span>
        </strong>
        <progress value={runtime.completed} max={runtime.target} aria-label="Session progress" />
      </div>
      <div className="session-summary__results">
        <span>
          <b className="positive">{runtime.wins}</b>Wins
        </span>
        <span>
          <b>{runtime.draws}</b>Draws
        </span>
        <span>
          <b className="negative">{runtime.losses}</b>Losses
        </span>
      </div>
      <div className="session-summary__engine">
        <Cpu aria-hidden="true" />
        <div>
          <strong>{engine.name}</strong>
          <span>
            {engine.busy} / {engine.capacity} workers busy
            {engine.queued ? ` · ${engine.queued} queued` : ''}
          </span>
        </div>
      </div>
      <Radio className="session-summary__signal" aria-hidden="true" />
    </section>
  );
}

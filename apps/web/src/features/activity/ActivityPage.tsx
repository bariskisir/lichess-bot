import { useState } from 'react';
import { CircleCheck, CircleAlert, TriangleAlert } from 'lucide-react';
import type { ActivityView } from '../../../../../packages/contracts/src/index.js';
import { EmptyState } from '../../shared/ui/EmptyState.js';
import './activity.scss';

export function ActivityPage({ events }: { events: ActivityView[] }) {
  const [level, setLevel] = useState('all');
  const filtered = events.filter((event) => level === 'all' || event.level === level);
  return (
    <section className="page-section">
      <div className="section-heading">
        <div>
          <h2>Activity</h2>
          <p>Recent session events. Detailed diagnostics are saved in the logs folder.</p>
        </div>
      </div>
      <div className="filter-bar">
        <label className="select-label">
          <span className="sr-only">Activity level</span>
          <select value={level} onChange={(event) => setLevel(event.target.value)}>
            <option value="all">All events</option>
            <option value="info">Information</option>
            <option value="warn">Warnings</option>
            <option value="error">Errors</option>
          </select>
        </label>
        <span className="filter-bar__count">{filtered.length} events</span>
      </div>
      {filtered.length ? (
        <ol className="activity-list">
          {filtered.map((event) => {
            const Icon =
              event.level === 'error'
                ? CircleAlert
                : event.level === 'warn'
                  ? TriangleAlert
                  : CircleCheck;
            return (
              <li className={`activity-row activity-row--${event.level}`} key={event.id}>
                <Icon aria-hidden="true" />
                <div>
                  <p>{event.message}</p>
                  {event.gameId && <span>Game {event.gameId}</span>}
                </div>
                <time dateTime={new Date(event.at).toISOString()}>
                  {new Date(event.at).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </time>
              </li>
            );
          })}
        </ol>
      ) : (
        <EmptyState
          title={events.length ? 'No events at this level' : 'Your session activity appears here'}
          description={
            events.length
              ? 'Select all events to see the full activity feed.'
              : 'Account connections, completed games, and recovery events are recorded as your bot runs.'
          }
        />
      )}
    </section>
  );
}

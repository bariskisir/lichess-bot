import { useState } from 'react';
import { Search } from 'lucide-react';
import type { GameView } from '../../../../../packages/contracts/src/index.js';
import { FinishedGamesGrid } from './FinishedGamesGrid.js';
import { EmptyState } from '../../shared/ui/EmptyState.js';

export function HistoryPage({
  games,
  onInspect,
}: {
  games: GameView[];
  onInspect: (game: GameView) => void;
}) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState('all');
  const filtered = games.filter(
    (game) =>
      (result === 'all' || game.result === result) &&
      `${game.white.name} ${game.black.name} ${game.id}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <section className="page-section">
      <div className="section-heading">
        <div>
          <h2>Game history</h2>
          <p>Completed games, saved on this machine.</p>
        </div>
        <span className="muted">{games.length} games</span>
      </div>
      <div className="filter-bar">
        <label className="search-input">
          <Search aria-hidden="true" />
          <span className="sr-only">Search game history</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search players or game ID"
          />
        </label>
        <label className="select-label">
          <span className="sr-only">Game result</span>
          <select value={result} onChange={(event) => setResult(event.target.value)}>
            <option value="all">All results</option>
            <option value="win">Wins</option>
            <option value="loss">Losses</option>
            <option value="draw">Draws</option>
            <option value="aborted">Aborted</option>
          </select>
        </label>
      </div>
      {filtered.length ? (
        <FinishedGamesGrid games={filtered} onInspect={onInspect} />
      ) : (
        <EmptyState
          title={games.length ? 'No games match this filter' : 'Completed games appear here'}
          description={
            games.length
              ? 'Try another player name or select all results.'
              : 'After a game ends, you can review every move and export its PGN.'
          }
        />
      )}
    </section>
  );
}

import { ArrowRight, Maximize2, Minimize2 } from 'lucide-react';
import type { DashboardSnapshot, GameView } from '../../../../../packages/contracts/src/index.js';
import { Button } from '../../shared/ui/Button.js';
import { EmptyState } from '../../shared/ui/EmptyState.js';
import { GameCard } from './GameCard.js';
import { FinishedGamesGrid } from '../history/FinishedGamesGrid.js';
import './games-workspace.scss';

export function GamesWorkspace({
  snapshot,
  expanded,
  onExpand,
  onInspect,
  onAccounts,
  onPreview,
  onHistory,
}: {
  snapshot: DashboardSnapshot;
  expanded: boolean;
  onExpand: () => void;
  onInspect: (game: GameView) => void;
  onAccounts: () => void;
  onPreview: () => void;
  onHistory: () => void;
}) {
  const games = snapshot.games;
  return (
    <div className={`games-workspace ${expanded ? 'games-workspace--expanded' : ''}`}>
      <section aria-labelledby="live-games-title">
        <div className={expanded ? 'games-workspace__exit' : 'section-heading'}>
          <h2 className="sr-only" id="live-games-title">
            Live games
          </h2>
          <div className="section-heading__actions">
            <Button
              variant="ghost"
              className={expanded ? 'icon-button' : ''}
              onClick={onExpand}
              aria-pressed={expanded}
              aria-label={expanded ? 'Collapse' : 'Expand'}
              title={expanded ? 'Collapse (Esc)' : 'Expand'}
            >
              {expanded ? <Minimize2 /> : <Maximize2 />}
              {!expanded && 'Expand'}
            </Button>
          </div>
        </div>
        {games.length > 0 ? (
          <div className="games-grid">
            {games.map((game) => (
              <GameCard key={game.id} game={game} onInspect={onInspect} />
            ))}
          </div>
        ) : (
          <EmptyState
            title={
              snapshot.accounts.length
                ? snapshot.runtime.phase === 'running'
                  ? 'Finding your next opponent'
                  : 'Ready when you are'
                : 'Connect an account to start playing'
            }
            description={
              snapshot.accounts.length
                ? snapshot.runtime.phase === 'running'
                  ? 'Your accounts are searching the selected time controls. New games appear here automatically.'
                  : 'Choose your time controls in Settings, then start a session from the sidebar.'
                : 'Add a Lichess session, choose your time controls, and start your bot. Your live games appear here.'
            }
          >
            {!snapshot.accounts.length && !expanded && (
              <>
                <Button variant="primary" onClick={onAccounts}>
                  Connect account
                  <ArrowRight />
                </Button>
                <Button variant="ghost" onClick={onPreview}>
                  Preview dashboard
                </Button>
              </>
            )}
          </EmptyState>
        )}
      </section>
      {!expanded && snapshot.history.length > 0 && (
        <section className="games-workspace__history" aria-labelledby="recent-games-title">
          <div className="section-heading">
            <h2 id="recent-games-title">Recently finished</h2>
            <Button variant="ghost" onClick={onHistory}>
              View history
              <ArrowRight />
            </Button>
          </div>
          <FinishedGamesGrid games={snapshot.history.slice(0, 6)} onInspect={onInspect} />
        </section>
      )}
    </div>
  );
}

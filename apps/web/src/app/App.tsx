import { useCallback, useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import type { DashboardSnapshot, GameView } from '../../../../packages/contracts/src/index.js';
import { useDashboard } from '../shared/live/use-dashboard.js';
import { api } from '../shared/api/client.js';
import { Button } from '../shared/ui/Button.js';
import { Sidebar, type View } from './Sidebar.js';
import { GamesWorkspace } from '../features/games/GamesWorkspace.js';
import { GameInspector } from '../features/games/GameInspector.js';
import { HistoryPage } from '../features/history/HistoryPage.js';
import { AccountsPage } from '../features/accounts/AccountsPage.js';
import { SettingsPage } from '../features/settings/SettingsPage.js';
import { ActivityPage } from '../features/activity/ActivityPage.js';
import { SessionSummary } from '../features/session/SessionSummary.js';
import './app.scss';

function readView(): View {
  const value = location.hash.slice(1);
  return ['games', 'history', 'accounts', 'settings', 'activity'].includes(value)
    ? (value as View)
    : 'games';
}
const titles: Record<View, string> = {
  games: 'Workspace',
  history: 'History',
  accounts: 'Accounts',
  settings: 'Settings',
  activity: 'Activity',
};

export function App() {
  const live = useDashboard();
  const [view, setView] = useState<View>(readView);
  const [expanded, setExpanded] = useState(false);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [preview, setPreview] = useState<DashboardSnapshot | null>(null);
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const snapshot = preview ?? live.snapshot;
  const navigate = useCallback((next: View) => {
    setView(next);
    location.hash = next;
    setExpanded(false);
  }, []);
  const inspect = useCallback((game: GameView) => setInspectedId(game.id), []);
  const closeInspector = useCallback(() => setInspectedId(null), []);
  useEffect(() => {
    const change = () => {
      setView(readView());
      setExpanded(false);
    };
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector('dialog[open]')) {
        setExpanded(false);
        setNavigationOpen(false);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  async function explorePreview(): Promise<void> {
    try {
      setPreview(await api<DashboardSnapshot>('/api/demo'));
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Preview could not load.');
    }
  }
  const selectedGame = snapshot
    ? [...snapshot.games, ...snapshot.history].find((game) => game.id === inspectedId)
    : undefined;
  const editable = !!snapshot && ['idle', 'completed', 'error'].includes(snapshot.runtime.phase);
  return (
    <div className={`app-shell ${expanded ? 'app-shell--expanded' : ''}`}>
      {!expanded && (
        <Sidebar
          view={view}
          navigate={navigate}
          accountCount={snapshot?.accounts.length ?? 0}
          activeCount={snapshot?.games.length ?? 0}
          engine={snapshot?.engine ?? null}
          connection={live.connection}
          runtime={snapshot?.runtime ?? null}
          demo={snapshot?.demo ?? false}
          onError={setError}
          open={navigationOpen}
          onClose={() => setNavigationOpen(false)}
        />
      )}
      <main className="workspace" id="main-content">
        <h1 className="sr-only">{titles[view]}</h1>
        {!expanded && (
          <Button
            variant="ghost"
            className="navigation-toggle icon-button"
            onClick={() => setNavigationOpen(true)}
            aria-label="Open navigation"
          >
            <Menu />
          </Button>
        )}
        {snapshot?.demo && !expanded && (
          <div className="preview-banner" role="status">
            <span>
              <strong>Dashboard preview</strong>Sample games · No Lichess connection
            </span>
            {preview && (
              <Button
                variant="ghost"
                onClick={() => {
                  setPreview(null);
                  setInspectedId(null);
                  setExpanded(false);
                }}
              >
                Return to workspace
              </Button>
            )}
          </div>
        )}
        {snapshot?.demo && expanded && (
          <span className="preview-indicator" role="status">
            Dashboard preview
          </span>
        )}
        {(error || live.error || snapshot?.runtime.error) && (
          <div className="notice notice--error app-notice" role="alert">
            <span>{error ?? live.error ?? snapshot?.runtime.error}</span>
            {error && (
              <Button
                variant="ghost"
                className="icon-button"
                onClick={() => setError(null)}
                aria-label="Dismiss message"
              >
                <X />
              </Button>
            )}
          </div>
        )}
        {snapshot ? (
          <div className={expanded ? 'workspace__focus' : 'workspace__body'}>
            {view === 'games' && (
              <>
                {!expanded && <SessionSummary snapshot={snapshot} />}
                <GamesWorkspace
                  snapshot={snapshot}
                  expanded={expanded}
                  onExpand={() => setExpanded((value) => !value)}
                  onInspect={inspect}
                  onAccounts={() => navigate('accounts')}
                  onPreview={() => {
                    void explorePreview();
                  }}
                  onHistory={() => navigate('history')}
                />
              </>
            )}
            {view === 'history' && <HistoryPage games={snapshot.history} onInspect={inspect} />}
            {view === 'accounts' && (
              <AccountsPage accounts={snapshot.accounts} editable={editable} demo={snapshot.demo} />
            )}
            {view === 'settings' && (
              <SettingsPage
                key={snapshot.demo ? 'preview' : 'workspace'}
                settings={snapshot.settings}
                editable={editable}
                demo={snapshot.demo}
              />
            )}
            {view === 'activity' && <ActivityPage events={snapshot.activity} />}
          </div>
        ) : (
          <div className="dashboard-skeleton" aria-label="Loading dashboard" aria-busy="true">
            <div />
            <div />
            <div />
            <p>Connecting to lichess-bot…</p>
          </div>
        )}
      </main>
      {selectedGame && (
        <GameInspector key={selectedGame.id} game={selectedGame} onClose={closeInspector} />
      )}
    </div>
  );
}

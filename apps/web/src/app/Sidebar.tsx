import { useState } from 'react';
import {
  Activity,
  ChessKnight,
  History,
  LayoutGrid,
  Settings2,
  Users,
  X,
  LogOut,
  Moon,
  Sun,
} from 'lucide-react';
import type { EngineView, RuntimeView } from '../../../../packages/contracts/src/index.js';
import { Button } from '../shared/ui/Button.js';
import { authenticationClient, useAuthentication } from '../features/auth/authentication-client.js';
import { useTheme } from '../features/theme/use-theme.js';
import { SessionControls } from '../features/session/SessionControls.js';
import './sidebar.scss';

export type View = 'games' | 'history' | 'accounts' | 'settings' | 'activity';
const navigation = [
  { id: 'games', label: 'Live games', Icon: LayoutGrid },
  { id: 'history', label: 'History', Icon: History },
  { id: 'accounts', label: 'Accounts', Icon: Users },
  { id: 'settings', label: 'Settings', Icon: Settings2 },
  { id: 'activity', label: 'Activity', Icon: Activity },
] as const;

export function Sidebar({
  view,
  navigate,
  accountCount,
  activeCount,
  engine,
  connection,
  runtime,
  demo,
  onError,
  open,
  onClose,
}: {
  view: View;
  navigate: (view: View) => void;
  accountCount: number;
  activeCount: number;
  engine: EngineView | null;
  connection: string;
  runtime: RuntimeView | null;
  demo: boolean;
  onError: (message: string | null) => void;
  open: boolean;
  onClose: () => void;
}) {
  const { status } = useAuthentication();
  const { theme, toggleTheme } = useTheme();
  const [signOutError, setSignOutError] = useState<string | null>(null);
  return (
    <>
      <button
        className={`sidebar-backdrop ${open ? 'is-open' : ''}`}
        aria-label="Close navigation"
        onClick={onClose}
        tabIndex={open ? 0 : -1}
      />
      <aside className={`sidebar ${open ? 'is-open' : ''}`} aria-label="Main navigation">
        <div className="sidebar__brand">
          <ChessKnight aria-hidden="true" />
          <a href="#games" onClick={() => navigate('games')}>
            lichess<span>-bot</span>
          </a>
          <Button
            variant="ghost"
            className="sidebar__theme icon-button"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          >
            {theme === 'dark' ? <Sun /> : <Moon />}
          </Button>
          <Button
            variant="ghost"
            className="sidebar__close icon-button"
            onClick={onClose}
            aria-label="Close navigation"
          >
            <X />
          </Button>
        </div>
        <p className="sidebar__description">Chess automation</p>
        <nav>
          {navigation.map(({ id, label, Icon }) => (
            <a
              key={id}
              href={`#${id}`}
              className={view === id ? 'is-active' : ''}
              onClick={() => {
                navigate(id);
                onClose();
              }}
              aria-current={view === id ? 'page' : undefined}
            >
              <Icon aria-hidden="true" />
              <span>{label}</span>
              {id === 'games' && activeCount > 0 && <small>{activeCount}</small>}
              {id === 'accounts' && accountCount > 0 && <small>{accountCount}</small>}
            </a>
          ))}
        </nav>
        <div className="sidebar__footer">
          {runtime && !demo && (
            <SessionControls
              runtime={runtime}
              hasAccounts={accountCount > 0}
              disabled={connection !== 'connected'}
              onError={onError}
            />
          )}
          {status?.passwordEnabled && (
            <>
              <Button
                variant="ghost"
                onClick={() => {
                  void authenticationClient
                    .logout()
                    .catch(() => setSignOutError('Could not sign out. Try again.'));
                }}
              >
                <LogOut />
                Sign out
              </Button>
              {signOutError && <p role="alert">{signOutError}</p>}
            </>
          )}
          <div className="sidebar__engine">
            <span className="status-dot status-dot--connected" />
            <span>{engine?.name ?? 'Lozza 2'}</span>
          </div>
          <p>
            {engine ? `${engine.workers} workers · ${engine.queued} queued` : 'Engine installed'}
          </p>
        </div>
      </aside>
    </>
  );
}

import { useState, type FormEvent } from 'react';
import { ChessKnight, LockKeyhole, Moon, Sun } from 'lucide-react';
import { Button } from '../../shared/ui/Button.js';
import { useTheme } from '../theme/use-theme.js';
import { authenticationClient } from './authentication-client.js';
import './authentication.scss';

export function LoginPage() {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { theme, toggleTheme } = useTheme();
  async function signIn(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await authenticationClient.login(password);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Sign in failed. Try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="authentication-page" id="main-content">
      <Button
        className="authentication-page__theme icon-button"
        variant="ghost"
        onClick={toggleTheme}
        aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
      >
        {theme === 'dark' ? <Sun /> : <Moon />}
      </Button>
      <div className="authentication-panel">
        <div className="authentication-panel__brand">
          <ChessKnight aria-hidden="true" />
          <span>lichess-bot</span>
        </div>
        <h1>Open your workspace</h1>
        <p>Enter your dashboard password to continue.</p>
        <form onSubmit={signIn}>
          <div className="form-field">
            <label htmlFor="dashboard-login-password">Password</label>
            <input
              id="dashboard-login-password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={128}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={busy}
              aria-invalid={!!error}
              aria-describedby={error ? 'login-error' : undefined}
            />
          </div>
          {error && (
            <p id="login-error" className="notice notice--error" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" variant="primary" loading={busy}>
            <LockKeyhole />
            Sign in
          </Button>
        </form>
      </div>
    </main>
  );
}

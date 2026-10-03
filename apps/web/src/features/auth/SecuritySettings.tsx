import { useState, type FormEvent } from 'react';
import { LockKeyhole } from 'lucide-react';
import { Button } from '../../shared/ui/Button.js';
import { authenticationClient, useAuthentication } from './authentication-client.js';
import './authentication.scss';

export function SecuritySettings({ demo }: { demo: boolean }) {
  const { status } = useAuthentication();
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const enabled = status?.passwordEnabled ?? false;
  async function change(remove: boolean): Promise<void> {
    setError(null);
    setMessage(null);
    if (!remove && password !== confirmPassword) {
      setError('The new passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await authenticationClient.change(
        remove ? null : password,
        enabled ? currentPassword : undefined,
      );
      setPassword('');
      setConfirmPassword('');
      setCurrentPassword('');
      setMessage(
        remove
          ? 'Password removed. This dashboard opens without signing in.'
          : 'Password saved. Other sessions must sign in again.',
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Password could not be saved.');
    } finally {
      setBusy(false);
    }
  }
  function save(event: FormEvent): void {
    event.preventDefault();
    void change(false);
  }
  return (
    <section className="settings-section security-settings" aria-labelledby="security-heading">
      <div className="settings-section__description">
        <h3 id="security-heading">Dashboard access</h3>
        <p>
          {enabled
            ? 'A password is required to open this dashboard.'
            : 'No password is set. This dashboard opens directly on your machine.'}
        </p>
        <p>You can change access while a session is running.</p>
      </div>
      <form className="settings-section__fields security-settings__form" onSubmit={save}>
        {enabled && (
          <div className="form-field">
            <label htmlFor="current-dashboard-password">Current password</label>
            <input
              id="current-dashboard-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
              maxLength={128}
              disabled={demo || busy}
            />
          </div>
        )}
        <div className="form-field">
          <label htmlFor="new-dashboard-password">
            {enabled ? 'New password' : 'Dashboard password'}
          </label>
          <input
            id="new-dashboard-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={8}
            maxLength={128}
            disabled={demo || busy}
            aria-describedby="password-requirements"
          />
          <small id="password-requirements">Use at least 8 characters.</small>
        </div>
        <div className="form-field">
          <label htmlFor="confirm-dashboard-password">Confirm new password</label>
          <input
            id="confirm-dashboard-password"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
            minLength={8}
            maxLength={128}
            disabled={demo || busy}
          />
        </div>
        {error && (
          <div className="notice notice--error" role="alert">
            {error}
          </div>
        )}
        {message && (
          <p className="save-feedback" role="status">
            {message}
          </p>
        )}
        <div className="security-settings__actions">
          <Button type="submit" variant="primary" loading={busy} disabled={demo}>
            <LockKeyhole />
            {enabled ? 'Change password' : 'Set password'}
          </Button>
          {enabled && (
            <Button
              variant="ghost"
              disabled={demo || busy || !currentPassword}
              onClick={() => void change(true)}
            >
              Remove password
            </Button>
          )}
        </div>
      </form>
    </section>
  );
}

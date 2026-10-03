import { useState, type FormEvent } from 'react';
import { ArrowRight, Check, KeyRound, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { AccountView } from '../../../../../packages/contracts/src/index.js';
import { api, RequestError } from '../../shared/api/client.js';
import { Button } from '../../shared/ui/Button.js';
import { EmptyState } from '../../shared/ui/EmptyState.js';
import { titleCase } from '../../shared/format.js';
import './accounts.scss';

export function AccountsPage({
  accounts,
  editable,
  demo,
}: {
  accounts: AccountView[];
  editable: boolean;
  demo: boolean;
}) {
  const [adding, setAdding] = useState(accounts.length === 0);
  const [editing, setEditing] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [cookie, setCookie] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const allowed = editable && !demo;
  function openEditor(account?: AccountView): void {
    setEditing(account?.id ?? null);
    setLabel(account?.label ?? '');
    setCookie('');
    setError(null);
    setAdding(true);
  }
  async function save(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(editing ? `/api/accounts/${editing}` : '/api/accounts', editing ? 'PUT' : 'POST', {
        label,
        cookie,
      });
      setAdding(false);
      setEditing(null);
      setCookie('');
      setLabel('');
    } catch (error) {
      setError(
        error instanceof RequestError
          ? (Object.values(error.details).flat()[0] ?? error.message)
          : 'The account could not be saved. Try again.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/accounts/${id}`, 'DELETE');
      setRemoving(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'The account could not be removed.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="page-section">
      <div className="section-heading">
        <div>
          <h2>Accounts</h2>
          <p>One session per account. All accounts share the game and engine limits.</p>
        </div>
        {!adding && (
          <Button variant="primary" onClick={() => openEditor()} disabled={!allowed}>
            <Plus />
            Add account
          </Button>
        )}
      </div>
      {!editable && !demo && (
        <div className="notice">
          Account changes are available after the current session finishes.
        </div>
      )}
      {error && (
        <div className="notice notice--error" role="alert">
          {error}
        </div>
      )}
      {adding && (
        <form
          className="account-form"
          onSubmit={(event) => {
            void save(event);
          }}
        >
          <div className="account-form__heading">
            <KeyRound aria-hidden="true" />
            <h3>{editing ? 'Replace account session' : 'Connect a Lichess account'}</h3>
            <Button
              variant="ghost"
              className="icon-button"
              onClick={() => {
                setAdding(false);
                setCookie('');
              }}
              aria-label="Close account form"
            >
              <X />
            </Button>
          </div>
          <div className="form-field">
            <label htmlFor="account-label">Account label</label>
            <input
              id="account-label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Main account"
              maxLength={60}
              required
              disabled={!allowed || busy}
              autoComplete="off"
            />
          </div>
          <div className="form-field">
            <label htmlFor="account-cookie">Lichess session</label>
            <input
              id="account-cookie"
              type="password"
              value={cookie}
              onChange={(event) => setCookie(event.target.value)}
              placeholder="lila2 session value"
              required
              disabled={!allowed || busy}
              autoComplete="new-password"
              spellCheck={false}
            />
            <p>
              Copy the lila2 cookie value from your browser’s storage for lichess.org. It is saved
              locally and never returned to the dashboard.
            </p>
          </div>
          <div className="account-form__actions">
            <span className="muted">Identity is verified when the session starts.</span>
            <Button type="submit" variant="primary" loading={busy} disabled={!allowed}>
              {editing ? 'Save session' : 'Connect account'}
              <ArrowRight />
            </Button>
          </div>
        </form>
      )}
      <div className="account-list">
        {accounts.map((account) => (
          <article className="account-row" key={account.id}>
            <div className="account-avatar" aria-hidden="true">
              {(account.username ?? account.label).slice(0, 2).toUpperCase()}
            </div>
            <div className="account-row__identity">
              <h3>{account.username ?? account.label}</h3>
              <p>
                {account.username ? account.label : 'Session saved, awaiting verification'}
                {account.pool ? ` · Searching ${account.pool}` : ''}
              </p>
              {account.error && <p className="account-row__error">{account.error}</p>}
            </div>
            <span className={`account-state account-state--${account.state}`}>
              {account.state === 'ready' && <Check aria-hidden="true" />}
              {titleCase(account.state)}
            </span>
            <div className="account-row__actions">
              {removing === account.id ? (
                <>
                  <Button
                    variant="danger"
                    loading={busy}
                    onClick={() => {
                      void remove(account.id);
                    }}
                  >
                    Remove
                  </Button>
                  <Button variant="ghost" onClick={() => setRemoving(null)}>
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    className="icon-button"
                    disabled={!allowed}
                    onClick={() => openEditor(account)}
                    aria-label={`Edit ${account.label}`}
                    title="Replace session"
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    className="icon-button"
                    disabled={!allowed}
                    onClick={() => setRemoving(account.id)}
                    aria-label={`Remove ${account.label}`}
                    title="Remove account"
                  >
                    <Trash2 />
                  </Button>
                </>
              )}
            </div>
          </article>
        ))}
      </div>
      {!accounts.length && !adding && (
        <EmptyState
          title="No accounts connected"
          description="Connect a Lichess session to make this workspace yours."
        >
          <Button variant="primary" disabled={!allowed} onClick={() => openEditor()}>
            <Plus />
            Add account
          </Button>
        </EmptyState>
      )}
    </section>
  );
}

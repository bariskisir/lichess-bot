import type { ReactNode } from 'react';
import { Button } from '../../shared/ui/Button.js';
import { authenticationClient, useAuthentication } from './authentication-client.js';
import { LoginPage } from './LoginPage.js';

export function AuthenticationGate({ children }: { children: ReactNode }) {
  const { status, error } = useAuthentication();
  if (error && !status)
    return (
      <main className="authentication-page" id="main-content">
        <div className="authentication-panel">
          <h1>Dashboard unavailable</h1>
          <p role="alert">{error}</p>
          <Button onClick={() => void authenticationClient.refresh()}>Try again</Button>
        </div>
      </main>
    );
  if (!status)
    return (
      <main className="authentication-page" id="main-content">
        <p role="status">Opening workspace…</p>
      </main>
    );
  if (!status.authenticated) return <LoginPage />;
  return children;
}

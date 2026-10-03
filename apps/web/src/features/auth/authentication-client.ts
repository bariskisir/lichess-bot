import { useSyncExternalStore } from 'react';
import type { AuthenticationStatus } from '../../../../../packages/contracts/src/index.js';
import { api } from '../../shared/api/client.js';

interface AuthenticationState {
  status: AuthenticationStatus | null;
  error: string | null;
}

class AuthenticationClient {
  private state: AuthenticationState = { status: null, error: null };
  private readonly listeners = new Set<() => void>();
  private pending?: Promise<void>;
  private version = 0;
  readonly getSnapshot = (): AuthenticationState => this.state;
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    if (!this.state.status) void this.refresh();
    return () => {
      this.listeners.delete(listener);
    };
  };
  private install(status: AuthenticationStatus): void {
    this.version += 1;
    this.state = { status, error: null };
    for (const listener of this.listeners) listener();
  }
  refresh(): Promise<void> {
    if (this.pending) return this.pending;
    const version = this.version;
    this.pending = api<AuthenticationStatus>('/api/auth/status')
      .then((status) => {
        if (this.version === version) this.install(status);
      })
      .catch((error: unknown) => {
        this.state = {
          ...this.state,
          error: error instanceof Error ? error.message : 'Cannot load dashboard access.',
        };
        for (const listener of this.listeners) listener();
      })
      .finally(() => {
        this.pending = undefined;
      });
    return this.pending;
  }
  async login(password: string): Promise<void> {
    this.install(await api<AuthenticationStatus>('/api/auth/login', 'POST', { password }));
  }
  async logout(): Promise<void> {
    this.install(await api<AuthenticationStatus>('/api/auth/logout', 'POST'));
  }
  async change(password: string | null, currentPassword?: string): Promise<void> {
    this.install(
      await api<AuthenticationStatus>('/api/auth/password', 'PUT', { password, currentPassword }),
    );
  }
}

export const authenticationClient = new AuthenticationClient();
export function useAuthentication(): AuthenticationState {
  return useSyncExternalStore(authenticationClient.subscribe, authenticationClient.getSnapshot);
}

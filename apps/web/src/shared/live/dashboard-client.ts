import type { DashboardSnapshot, GameView } from '../../../../../packages/contracts/src/index.js';
import { api } from '../api/client.js';
import { authenticationClient } from '../../features/auth/authentication-client.js';

export interface LiveState {
  snapshot: DashboardSnapshot | null;
  connection: 'connecting' | 'connected' | 'reconnecting';
  error: string | null;
}

class DashboardClient {
  private state: LiveState = { snapshot: null, connection: 'connecting', error: null };
  private source?: EventSource;
  private readonly listeners = new Set<() => void>();
  private readonly gameCache = new Map<string, { json: string; game: GameView }>();
  private serverOffset = 0;
  readonly now = (): number => Date.now() + this.serverOffset;
  readonly getSnapshot = (): LiveState => this.state;
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    if (!this.source) this.connect();
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size) {
        this.source?.close();
        this.source = undefined;
        this.state = { snapshot: null, connection: 'connecting', error: null };
        this.gameCache.clear();
      }
    };
  };
  private emit(state: LiveState): void {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
  private install(snapshot: DashboardSnapshot): void {
    if (
      this.state.snapshot?.instanceId === snapshot.instanceId &&
      snapshot.revision < this.state.snapshot.revision
    )
      return;
    this.serverOffset = snapshot.serverTime - Date.now();
    const present = new Set<string>();
    const reuse = (game: GameView) => {
      present.add(game.id);
      const json = JSON.stringify(game);
      const cached = this.gameCache.get(game.id);
      if (cached?.json === json) return cached.game;
      this.gameCache.set(game.id, { json, game });
      return game;
    };
    const merged = {
      ...snapshot,
      games: snapshot.games.map(reuse),
      history: snapshot.history.map(reuse),
    };
    for (const id of this.gameCache.keys()) if (!present.has(id)) this.gameCache.delete(id);
    this.emit({ snapshot: merged, connection: 'connected', error: null });
  }
  private connect(): void {
    const source = new EventSource('/api/events');
    this.source = source;
    source.onmessage = (event) => {
      if (this.source === source) {
        try {
          this.install(JSON.parse(event.data) as DashboardSnapshot);
        } catch {
          this.emit({
            ...this.state,
            connection: 'reconnecting',
            error: 'The dashboard received invalid data. Reconnecting…',
          });
        }
      }
    };
    source.onopen = () => {
      if (this.source === source)
        this.emit({ ...this.state, connection: 'connected', error: null });
    };
    source.onerror = () => {
      void authenticationClient.refresh();
      if (this.source === source)
        this.emit({
          ...this.state,
          connection: 'reconnecting',
          error: 'Connection lost. The dashboard will reconnect automatically.',
        });
    };
    void api<DashboardSnapshot>('/api/snapshot')
      .then((snapshot) => {
        if (this.source === source) this.install(snapshot);
      })
      .catch(() => {
        if (this.source === source && !this.state.snapshot)
          this.emit({
            ...this.state,
            error: 'Waiting for lichess-bot. Check that the application is running.',
          });
      });
  }
}
export const dashboardClient = new DashboardClient();

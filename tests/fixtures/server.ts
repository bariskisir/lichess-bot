import { Chess, DEFAULT_POSITION } from 'chess.js';
import { randomUUID } from 'node:crypto';
import { vi } from 'vitest';
import type { AccountSecret, Configuration, GameView } from '../../packages/contracts/src/index.js';
import { DEFAULT_SETTINGS } from '../../packages/contracts/src/index.js';
import type { ConfigurationRepository } from '../../apps/server/src/application/config/configuration-repository.js';
import type {
  GameChannel,
  GameSnapshot,
  LichessGateway,
  RemoteFrame,
} from '../../apps/server/src/domain/lichess/gateway.js';

export function secret(label = 'Test account'): AccountSecret {
  return { id: randomUUID(), label, cookie: 'lila2=fake-session-value-for-local-tests' };
}
export function memoryConfig(
  accounts: AccountSecret[] = [],
  settings = DEFAULT_SETTINGS,
): ConfigurationRepository {
  let current: Configuration = { version: 1, accounts, settings };
  return {
    load: async () => structuredClone(current),
    save: async (configuration) => {
      current = structuredClone(configuration);
    },
  };
}

export function gameSnapshot(
  moves: string[] = [],
  patch: Partial<GameSnapshot> = {},
): GameSnapshot {
  const board = new Chess();
  const steps: GameSnapshot['steps'] = [{ ply: 0, fen: board.fen(), san: null, uci: null }];
  for (const san of moves) {
    const move = board.move(san);
    steps.push({
      ply: steps.length,
      fen: board.fen(),
      san: move.san,
      uci: `${move.from}${move.to}${move.promotion ?? ''}`,
    });
  }
  return {
    id: 'abcdefgh',
    playerId: 'wxyz',
    userId: 'testbot',
    version: moves.length,
    variant: 'standard',
    color: 'white',
    initialFen: DEFAULT_POSITION,
    steps,
    ply: moves.length,
    white: { id: 'testbot', name: 'TestBot', rating: 1800, title: null },
    black: { id: 'opponent', name: 'Opponent', rating: 1800, title: null },
    status: 20,
    statusName: 'started',
    winner: null,
    clock: { white: 180, black: 180, initial: 180, increment: 2, running: moves.length >= 2 },
    rated: true,
    createdAt: Date.now(),
    opponentGone: false,
    ownDrawOffer: false,
    opponentDrawOffer: false,
    noClaimWin: false,
    ...patch,
  };
}

export class FakeChannel implements GameChannel {
  connected = false;
  version: number | undefined;
  lagMs = 0;
  readonly listeners = new Set<(frame: RemoteFrame) => void>();
  readonly disconnects = new Set<() => void>();
  readonly sent: RemoteFrame[] = [];
  connect = vi.fn(async (_path: string, signal: AbortSignal, version?: number) => {
    signal.throwIfAborted();
    this.connected = true;
    this.version = version;
  });
  setVersion(version: number): void {
    this.version = version;
  }
  send(t: string, d?: unknown): void {
    this.sent.push({ t, d });
    this.onSend?.({ t, d });
  }
  onSend?: (frame: RemoteFrame) => void;
  subscribe(listener: (frame: RemoteFrame) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  onDisconnect(listener: () => void): () => void {
    this.disconnects.add(listener);
    return () => this.disconnects.delete(listener);
  }
  receive(frame: RemoteFrame): void {
    for (const listener of this.listeners) listener(frame);
  }
  close(): void {
    this.connected = false;
  }
}

export class FakeGateway implements LichessGateway {
  readonly channels: FakeChannel[] = [];
  state = gameSnapshot();
  authenticate = vi.fn(async () => ({ id: 'testbot', username: 'TestBot' }));
  playing = vi.fn(async () => [] as { fullId: string; speed: string }[]);
  snapshot = vi.fn(async () => structuredClone(this.state));
  createChannel(): FakeChannel {
    const channel = new FakeChannel();
    this.channels.push(channel);
    return channel;
  }
}

export function archivedGame(): GameView {
  const snapshot = gameSnapshot(['e4', 'e5']);
  return {
    id: snapshot.id,
    accountId: randomUUID(),
    accountName: 'TestBot',
    color: 'white',
    white: snapshot.white,
    black: snapshot.black,
    fen: snapshot.steps.at(-1)!.fen,
    initialFen: DEFAULT_POSITION,
    moves: ['e4', 'e5'],
    lastMove: 'e7e5',
    ply: 2,
    turn: 'white',
    check: false,
    clock: null,
    timeControl: '3+2',
    rated: true,
    activity: 'finished',
    delayUntil: null,
    status: 'mate',
    evaluation: null,
    startedAt: Date.now() - 60_000,
    finishedAt: Date.now(),
    result: 'win',
  };
}

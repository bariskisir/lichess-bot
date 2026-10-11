import { describe, expect, it, vi } from 'vitest';
import pino from 'pino';
import { DEFAULT_SETTINGS, type AccountView } from '../../../packages/contracts/src/index.js';
import { ChesscomGameRunner } from '../../../apps/server/src/application/game/chesscom-game-runner.js';
import { MoveSelector } from '../../../apps/server/src/application/game/move-selector.js';
import { DashboardStore } from '../../../apps/server/src/application/dashboard/dashboard-store.js';
import type { ChesscomChannel, ChesscomGameEvent } from '../../../apps/server/src/domain/chesscom/gateway.js';
import { abortError } from '../../../apps/server/src/shared/async.js';

const account: AccountView = {
  id: 'test-account',
  label: 'Test',
  provider: 'chesscom',
  username: 'ChessPlayer',
  userId: 'user-uuid',
  state: 'ready',
  pool: null,
  error: null,
};

class FakeChesscomChannel implements ChesscomChannel {
  connected = false;
  readonly acknowledged: string[] = [];
  readonly moves: { move: string; index: number }[] = [];
  private listeners = new Set<(event: ChesscomGameEvent) => void>();
  connect = vi.fn(async () => {
    this.connected = true;
  });
  watchGame = vi.fn((_gameId: string, listener: (event: ChesscomGameEvent) => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  });
  acknowledge = vi.fn((gameId: string, eventUpdatedAt: string) => {
    this.acknowledged.push(`${gameId}:${eventUpdatedAt}`);
  });
  sendMove = vi.fn(async (payload: { move: string; index: number }) => {
    this.moves.push({ move: payload.move, index: payload.index });
    return new Date().toISOString();
  });
  close = vi.fn(() => {
    this.connected = false;
  });
  emit(event: ChesscomGameEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

const players = {
  white: { id: 'white-id', name: 'WhitePlayer', rating: 1500, title: null },
  black: { id: 'black-id', name: 'BlackPlayer', rating: 1500, title: null },
};

function liveEvent(
  tcnMoves: string[],
  clocks: [number, number] = [60_000, 60_000],
  extra: Partial<ChesscomGameEvent> = {},
): ChesscomGameEvent {
  return {
    id: 'game-uuid',
    clocks,
    moves: tcnMoves.map((tcn, index) => [tcn, clocks[index % 2]!] as [string, number]),
    updatedAt: `2026-10-11T02:25:${String(10 + tcnMoves.length).padStart(2, '0')}.000Z`,
    ...extra,
  };
}

describe('chess.com game lifecycle', () => {
  it('acknowledges events, encodes the engine move as TCN and waits for confirmation', async () => {
    const channel = new FakeChesscomChannel();
    const store = new DashboardStore(DEFAULT_SETTINGS);
    const selector = new MoveSelector({
      analyze: vi.fn(async () => ({
        bestMove: 'g1f3',
        variations: [{ index: 1, depth: 4, score: 0.2, mate: null, nodes: 10, moves: ['g1f3'] }],
      })),
    });
    const runner = new ChesscomGameRunner(
      'game-uuid',
      account,
      'white',
      '1+0',
      players,
      channel,
      selector,
      { ...DEFAULT_SETTINGS, movePolicy: 'best', mistakeProbability: 0, randomDelayMaxMs: 0, dynamicDelay: false },
      () => true,
      store,
      pino({ level: 'silent' }),
    );
    const controller = new AbortController();
    const task = runner.run(controller.signal);
    const rejection = expect(task).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(channel.watchGame).toHaveBeenCalled());
    channel.emit(liveEvent([]));
    await vi.waitFor(() => expect(channel.moves).toHaveLength(1));
    expect(channel.moves[0]).toMatchObject({ index: 0 });
    expect(channel.acknowledged.length).toBeGreaterThan(0);
    expect(store.snapshot().games[0]).toMatchObject({ provider: 'chesscom', color: 'white' });
    controller.abort(abortError());
    await rejection;
    store.close();
  });

  it('applies opponent TCN before selecting and finishes checkmate', async () => {
    const channel = new FakeChesscomChannel();
    const seen: string[][] = [];
    const selector = new MoveSelector({
      analyze: vi.fn(async (request) => {
        seen.push([...request.position.moves]);
        return {
          bestMove: 'd7d5',
          variations: [{ index: 1, depth: 4, score: 0.2, mate: null, nodes: 10, moves: ['d7d5'] }],
        };
      }),
    });
    const runner = new ChesscomGameRunner(
      'game-uuid',
      account,
      'black',
      '1+0',
      players,
      channel,
      selector,
      { ...DEFAULT_SETTINGS, movePolicy: 'best', mistakeProbability: 0, randomDelayMaxMs: 0, dynamicDelay: false },
      () => true,
      null,
      pino({ level: 'silent' }),
    );
    const controller = new AbortController();
    const task = runner.run(controller.signal);
    await vi.waitFor(() => expect(channel.watchGame).toHaveBeenCalled());
    // Fool's mate prefix in TCN: f2f3 e7e5 g2g4
    const { encodeTCN } = await import('../../../apps/server/src/adapters/chesscom/tcn.js');
    const prefix = [encodeTCN({ from: 'f2', to: 'f3' }), encodeTCN({ from: 'e7', to: 'e5' }), encodeTCN({ from: 'g2', to: 'g4' })];
    channel.emit(liveEvent(prefix));
    await vi.waitFor(() => expect(seen.length).toBeGreaterThan(0));
    expect(seen[0]).toEqual(['f2f3', 'e7e5', 'g2g4']);
    controller.abort(abortError());
    await expect(task).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('publishes names and ratings and scores an opponent resignation as a win', async () => {
    const channel = new FakeChesscomChannel();
    const store = new DashboardStore(DEFAULT_SETTINGS);
    const selector = new MoveSelector({
      analyze: vi.fn(async () => ({
        bestMove: 'g1f3',
        variations: [{ index: 1, depth: 4, score: 0.2, mate: null, nodes: 10, moves: ['g1f3'] }],
      })),
    });
    const runner = new ChesscomGameRunner(
      'game-uuid',
      account,
      'white',
      '1+0',
      players,
      channel,
      selector,
      { ...DEFAULT_SETTINGS, movePolicy: 'best', mistakeProbability: 0, randomDelayMaxMs: 0, dynamicDelay: false },
      () => true,
      store,
      pino({ level: 'silent' }),
    );
    const controller = new AbortController();
    const task = runner.run(controller.signal);
    await vi.waitFor(() => expect(channel.watchGame).toHaveBeenCalled());
    const { encodeTCN } = await import('../../../apps/server/src/adapters/chesscom/tcn.js');
    channel.emit(
      liveEvent([encodeTCN({ from: 'e2', to: 'e4' })], [59_000, 60_000], {
        updatedAt: '2026-10-11T02:25:20.000Z',
      }),
    );
    await vi.waitFor(() => expect(store.snapshot().games[0]?.ply).toBe(1));
    expect(store.snapshot().games[0]).toMatchObject({
      white: { name: 'WhitePlayer', rating: 1500 },
      black: { name: 'BlackPlayer', rating: 1500 },
    });
    channel.emit(
      liveEvent([encodeTCN({ from: 'e2', to: 'e4' })], [59_000, 60_000], {
        updatedAt: '2026-10-11T02:25:21.000Z',
        results: ['win', 'resigned'],
      }),
    );
    await expect(task).resolves.toMatchObject({ result: 'win', status: 'resigned' });
    controller.abort(abortError());
    store.close();
  });
});

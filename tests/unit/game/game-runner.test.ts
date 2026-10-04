import { describe, expect, it, vi } from 'vitest';
import pino from 'pino';
import {
  DEFAULT_SETTINGS as defaults,
  type AccountView,
} from '../../../packages/contracts/src/index.js';
import { GameRunner } from '../../../apps/server/src/application/game/game-runner.js';
import { MoveSelector } from '../../../apps/server/src/application/game/move-selector.js';
import { DashboardStore } from '../../../apps/server/src/application/dashboard/dashboard-store.js';
import { FakeGateway, gameSnapshot } from '../../fixtures/server.js';
import { abortError, deferred } from '../../../apps/server/src/shared/async.js';
import type { Analysis, AnalysisRequest } from '../../../apps/server/src/domain/engine/engine.js';
import { TurnTiming } from '../../../apps/server/src/application/game/timing/turn-timing.js';

const account: AccountView = {
  id: 'test-account',
  label: 'Test',
  username: 'TestBot',
  userId: 'testbot',
  state: 'ready',
  pool: null,
  error: null,
};
const DEFAULT_SETTINGS = {
  ...defaults,
  movePolicy: 'best' as const,
  mistakeProbability: 0,
  randomDelayMaxMs: 0,
  dynamicDelay: false,
};
const analysis: Analysis = {
  bestMove: 'g1f3',
  variations: [{ index: 1, depth: 12, score: 0.25, mate: null, nodes: 100, moves: ['g1f3'] }],
};

describe('game lifecycle', () => {
  it('builds the next dynamic target from the clock received with the opponent move', async () => {
    const gateway = new FakeGateway();
    gateway.state = gameSnapshot(['e4']);
    let elapsed = 0;
    const settings = { ...DEFAULT_SETTINGS, dynamicDelay: true };
    const clocks: { remainingMs: number; incrementMs: number; completedMoves: number }[] = [];
    const runner = new GameRunner(
      'abcdefghwxyz',
      account,
      gateway,
      new MoveSelector({ analyze: vi.fn(async () => analysis) }),
      settings,
      new Set(),
      null,
      pino({ level: 'silent' }),
      (getClock) => {
        clocks.push(getClock()!);
        return new TurnTiming(
          settings,
          getClock,
          Math.random,
          () => elapsed,
          async (ms) => {
            elapsed += ms;
          },
        );
      },
    );
    const controller = new AbortController();
    const task = runner.run(controller.signal);
    const rejection = expect(task).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(gateway.channels[0]!.connected).toBe(true));
    const moved = gameSnapshot(['e4', 'e5']);
    gateway.channels[0]!.receive({
      t: 'move',
      d: {
        ply: 2,
        san: 'e5',
        fen: moved.steps.at(-1)!.fen,
        clock: { white: 120, black: 176 },
      },
    });
    await vi.waitFor(() =>
      expect(gateway.channels[0]!.sent.some((frame) => frame.t === 'move')).toBe(true),
    );
    expect(clocks).toHaveLength(1);
    expect(clocks[0]?.remainingMs).toBeLessThanOrEqual(120_000);
    expect(clocks[0]?.remainingMs).toBeGreaterThan(119_900);
    expect(clocks[0]).toMatchObject({ incrementMs: 2000, completedMoves: 1 });
    controller.abort(abortError());
    await rejection;
  });

  it('cancels queued analysis and submits the last legal root candidate after a low-clock update', async () => {
    const gateway = new FakeGateway();
    gateway.state = gameSnapshot(['e4', 'e5']);
    const response = deferred<Analysis>();
    const cancelled = vi.fn();
    const analyze = vi.fn((request: AnalysisRequest) => {
      request.onInfo?.(analysis.variations[0]!);
      request.signal.addEventListener(
        'abort',
        () => {
          cancelled();
          response.reject(request.signal.reason);
        },
        { once: true },
      );
      return response.promise;
    });
    const runner = new GameRunner(
      'abcdefghwxyz',
      account,
      gateway,
      new MoveSelector({ analyze }),
      { ...DEFAULT_SETTINGS, dynamicDelay: true, randomDelayMaxMs: 10_000 },
      new Set(),
      null,
      pino({ level: 'silent' }),
    );
    const controller = new AbortController();
    const task = runner.run(controller.signal);
    const rejection = expect(task).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(analyze).toHaveBeenCalledTimes(1));
    gateway.channels[0]!.receive({ t: 'clock', d: { white: 2, black: 100 } });
    await vi.waitFor(() =>
      expect(gateway.channels[0]!.sent.some((frame) => frame.t === 'move')).toBe(true),
    );
    expect(cancelled).toHaveBeenCalledTimes(1);
    expect(gateway.channels[0]!.sent.find((frame) => frame.t === 'move')?.d).toMatchObject({
      u: 'g1f3',
    });
    controller.abort(abortError());
    await rejection;
  });

  it('includes queued analysis in the turn delay and publishes updated clock urgency while waiting', async () => {
    const gateway = new FakeGateway();
    gateway.state = gameSnapshot(['e4', 'e5']);
    const response = deferred<Analysis>();
    const analyze = vi.fn((request: AnalysisRequest) => {
      request.signal.throwIfAborted();
      return response.promise;
    });
    let now = 100;
    const wait = vi.fn(async (duration: number) => {
      now += duration;
    });
    const settings = { ...DEFAULT_SETTINGS, randomDelayMaxMs: 4000 };
    const runner = new GameRunner(
      'abcdefghwxyz',
      account,
      gateway,
      new MoveSelector({ analyze }),
      settings,
      new Set(),
      null,
      pino({ level: 'silent' }),
      (getClock) =>
        new TurnTiming(
          settings,
          getClock,
          () => 0.75,
          () => now,
          wait,
        ),
    );
    const controller = new AbortController();
    const task = runner.run(controller.signal);
    const rejection = expect(task).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(analyze).toHaveBeenCalledTimes(1));
    const request = analyze.mock.calls[0]![0];
    const before = Date.now();
    gateway.channels[0]!.receive({ t: 'clock', d: { white: 20, black: 100 } });
    expect(request.getDeadline?.()).toBeGreaterThanOrEqual(before + 20_000);
    expect(request.getDeadline?.()).toBeLessThanOrEqual(Date.now() + 20_000);
    now += 2000;
    response.resolve(analysis);
    await vi.waitFor(() =>
      expect(gateway.channels[0]!.sent.some((frame) => frame.t === 'move')).toBe(true),
    );
    expect(wait.mock.calls.reduce((sum, [duration]) => sum + duration, 0)).toBe(1000);
    controller.abort(abortError());
    await rejection;
  });
  it('submits a legal move once and waits for authoritative confirmation', async () => {
    const gateway = new FakeGateway();
    gateway.state = gameSnapshot(['e4', 'e5']);
    const store = new DashboardStore(DEFAULT_SETTINGS);
    const analyze = vi.fn(async () => analysis);
    const runner = new GameRunner(
      'abcdefghwxyz',
      account,
      gateway,
      new MoveSelector({ analyze }),
      DEFAULT_SETTINGS,
      new Set(['testbot']),
      store,
      pino({ level: 'silent' }),
    );
    const controller = new AbortController();
    const task = runner.run(controller.signal);
    const channel = gateway.channels[0]!;
    await vi.waitFor(() =>
      expect(channel.sent.filter((frame) => frame.t === 'move')).toHaveLength(1),
    );
    expect(store.snapshot().games[0]?.activity).toBe('confirming');
    expect(store.snapshot().games[0]?.ply).toBe(2);
    const moved = gameSnapshot(['e4', 'e5', 'Nf3']);
    channel.receive({
      t: 'move',
      d: { ply: 3, san: 'Nf3', fen: moved.steps.at(-1)!.fen, clock: { white: 175, black: 176 } },
    });
    gateway.state = { ...moved, status: 31, statusName: 'resign', winner: 'white' };
    channel.receive({ t: 'endData' });
    expect((await task).result).toBe('win');
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(channel.connected).toBe(false);
    store.close();
  });
  it('cancels stale analysis and never submits its move after a changed position', async () => {
    const gateway = new FakeGateway();
    gateway.state = gameSnapshot(['e4', 'e5']);
    const response = deferred<Analysis>();
    const analyze = vi.fn((request) => {
      request.signal.addEventListener('abort', () => response.reject(abortError()), { once: true });
      return response.promise;
    });
    const runner = new GameRunner(
      'abcdefghwxyz',
      account,
      gateway,
      new MoveSelector({ analyze }),
      DEFAULT_SETTINGS,
      new Set(),
      null,
      pino({ level: 'silent' }),
    );
    const controller = new AbortController();
    const task = runner.run(controller.signal);
    await vi.waitFor(() => expect(analyze).toHaveBeenCalledTimes(1));
    gateway.state = gameSnapshot(['e4', 'e5', 'Nf3'], {
      status: 31,
      statusName: 'resign',
      winner: 'black',
    });
    gateway.channels[0]!.receive({ t: 'reload' });
    expect((await task).result).toBe('loss');
    expect(gateway.channels[0]!.sent.filter((frame) => frame.t === 'move')).toHaveLength(0);
  });
  it('does not treat a countdown as permission to claim a victory', async () => {
    const gateway = new FakeGateway();
    gateway.state = gameSnapshot(['e4', 'e5', 'Nf3']);
    const runner = new GameRunner(
      'abcdefghwxyz',
      account,
      gateway,
      new MoveSelector({ analyze: vi.fn() }),
      DEFAULT_SETTINGS,
      new Set(),
      null,
      pino({ level: 'silent' }),
    );
    const controller = new AbortController();
    const task = runner.run(controller.signal);
    await vi.waitFor(() => expect(gateway.channels[0]?.connected).toBe(true));
    const channel = gateway.channels[0]!;
    channel.receive({ t: 'goneIn', d: 10 });
    expect(channel.sent.some((frame) => frame.t === 'resign-force')).toBe(false);
    channel.receive({ t: 'gone', d: true });
    await vi.waitFor(() =>
      expect(channel.sent.some((frame) => frame.t === 'resign-force')).toBe(true),
    );
    gateway.state = { ...gateway.state, status: 31, statusName: 'resign', winner: 'white' };
    channel.receive({ t: 'endData' });
    expect((await task).result).toBe('win');
  });
  it('allows opening moves before requesting a draw between managed accounts', async () => {
    const gateway = new FakeGateway();
    gateway.state = gameSnapshot();
    const analyze = vi.fn(async () => ({
      ...analysis,
      bestMove: 'e2e4',
      variations: [{ ...analysis.variations[0]!, moves: ['e2e4'] }],
    }));
    const runner = new GameRunner(
      'abcdefghwxyz',
      account,
      gateway,
      new MoveSelector({ analyze }),
      DEFAULT_SETTINGS,
      new Set(['testbot', 'opponent']),
      null,
      pino({ level: 'silent' }),
    );
    const controller = new AbortController();
    const task = runner.run(controller.signal);
    const rejection = expect(task).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() =>
      expect(gateway.channels[0]!.sent.some((frame) => frame.t === 'move')).toBe(true),
    );
    controller.abort(abortError());
    await rejection;
  });
});

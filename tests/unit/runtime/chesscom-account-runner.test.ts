import { describe, expect, it, vi } from 'vitest';
import pino from 'pino';
import { randomUUID } from 'node:crypto';
import { DEFAULT_SETTINGS } from '../../../packages/contracts/src/index.js';
import type { GameView } from '../../../packages/contracts/src/index.js';
import type { GameHistoryRepository } from '../../../apps/server/src/application/game/game-history-repository.js';
import { ConfigurationService } from '../../../apps/server/src/application/config/configuration-service.js';
import { DashboardStore } from '../../../apps/server/src/application/dashboard/dashboard-store.js';
import { EngineRegistry } from '../../../apps/server/src/application/engine/engine-registry.js';
import { BotRuntime } from '../../../apps/server/src/application/runtime/bot-runtime.js';
import { memoryConfig } from '../../fixtures/server.js';
import type {
  ChesscomChannel,
  ChesscomGameEvent,
} from '../../../apps/server/src/domain/chesscom/gateway.js';

const GAME_ID = 'f305a451-c51e-11f1-a987-563c1101000f';

class FakeChesscomChannel implements ChesscomChannel {
  connected = false;
  private listener?: (event: ChesscomGameEvent) => void;
  connect = vi.fn(async () => {
    this.connected = true;
  });
  watchGame = vi.fn((_: string, listener: (event: ChesscomGameEvent) => void) => {
    this.listener = listener;
    return () => {};
  });
  acknowledge = vi.fn(() => {});
  sendMove = vi.fn(async () => new Date().toISOString());
  close = vi.fn(() => {
    this.connected = false;
  });
  emit(event: ChesscomGameEvent): void {
    this.listener?.(event);
  }
}

class FakeChesscomGateway {
  readonly channels: FakeChesscomChannel[] = [];
  authenticate = vi.fn(async () => ({ id: 'user-uuid', username: 'TestPlayer' }));
  activeGames = vi.fn(async () => [
    {
      id: GAME_ID,
      region: 'play-eu-1-5',
      transport: { wsUrl: null, region: 'play-eu-1-5', routes: null },
      raw: {
        players: ['user-uuid', 'opp-uuid'],
        playersDetails: [
          { id: 'user-uuid', username: 'TestPlayer', rating: 1500 },
          { id: 'opp-uuid', username: 'Opponent', rating: 1500 },
        ],
      },
    },
  ]);
  seekState = vi.fn(async () => 'active');
  seek = vi.fn(async () => ({ id: 'seek-1', state: 'active' }));
  cancelSeek = vi.fn(async () => {});
  createChannel(): FakeChesscomChannel {
    const channel = new FakeChesscomChannel();
    this.channels.push(channel);
    return channel;
  }
}

describe('chess.com session completion', () => {
  it('records a finished UUID game in history with names and ratings', async () => {
    const gateway = new FakeChesscomGateway();
    const config = new ConfigurationService(
      memoryConfig(
        [
          {
            id: randomUUID(),
            label: 'Chess',
            provider: 'chesscom',
            cookie: 'PHPSESSID=fake-session-for-local-tests',
          },
        ],
        { ...DEFAULT_SETTINGS, totalMatches: 1, chesscomGameTypes: ['1+0'] },
      ),
    );
    await config.load();
    const store = new DashboardStore(config.settings);
    const registry = new EngineRegistry();
    const create = vi.fn(() => ({
      analyze: vi.fn(async () => ({
        bestMove: 'g1f3',
        variations: [{ index: 1, depth: 4, score: 0.2, mate: null, nodes: 10, moves: ['g1f3'] }],
      })),
      close: vi.fn(async () => {}),
    }));
    registry.register({ id: DEFAULT_SETTINGS.engineId, name: 'Fake local engine', create });
    const saved: GameView[] = [];
    const archive: GameHistoryRepository = {
      save: vi.fn(async (game: GameView) => {
        saved.push(game);
      }),
      load: vi.fn(async () => []),
      flush: vi.fn(async () => {}),
      clear: vi.fn(async () => {}),
    };
    const runtime = new BotRuntime(
      config,
      registry,
      () => gateway,
      store,
      archive,
      pino({ level: 'silent' }),
    );
    try {
      runtime.command('start');
      await vi.waitFor(() => expect(gateway.channels.length).toBeGreaterThan(0));
      gateway.channels[0]!.emit({
        id: GAME_ID,
        clocks: [59_000, 60_000],
        moves: [],
        updatedAt: '2026-10-11T02:25:10.000Z',
        results: ['win', 'resigned'],
      });
      await vi.waitFor(() => expect(store.snapshot().runtime.phase).toBe('completed'));
      expect(archive.save).toHaveBeenCalledTimes(1);
      expect(saved[0]).toMatchObject({
        id: GAME_ID,
        provider: 'chesscom',
        result: 'win',
        white: { name: 'TestPlayer', rating: 1500 },
        black: { name: 'Opponent', rating: 1500 },
      });
      expect(store.snapshot().history[0]).toBeUndefined();
      await vi.waitFor(
        () =>
          expect(store.snapshot().history[0]).toMatchObject({ id: GAME_ID, result: 'win' }),
        { timeout: 8000 },
      );
      expect(store.snapshot().runtime.completed).toBe(1);
    } finally {
      await runtime.close();
      store.close();
    }
  });
});

import { describe, expect, it, vi } from 'vitest';
import pino from 'pino';
import { DEFAULT_SETTINGS, type AccountView } from '../../../packages/contracts/src/index.js';
import { LozzaEngine } from '../../../apps/server/src/adapters/engines/lozza/lozza-engine.js';
import { LOZZA_DISTRIBUTIONS } from '../../../apps/server/src/adapters/engines/lozza/lozza-distributions.js';
import { DashboardStore } from '../../../apps/server/src/application/dashboard/dashboard-store.js';
import { GameRunner } from '../../../apps/server/src/application/game/game-runner.js';
import { MoveSelector } from '../../../apps/server/src/application/game/move-selector.js';
import { abortError } from '../../../apps/server/src/shared/async.js';
import { FakeGateway, gameSnapshot } from '../../fixtures/server.js';

const account: AccountView = {
  id: 'test-account',
  label: 'Test',
  username: 'TestBot',
  userId: 'testbot',
  state: 'ready',
  pool: null,
  error: null,
};

describe.each(LOZZA_DISTRIBUTIONS)('$name game integration', (distribution) => {
  for (const scenario of [
    { color: 'white' as const, fen: '4k3/8/8/8/8/8/q7/R3K3 w - - 0 1', move: 'a1a2', sign: 1 },
    { color: 'black' as const, fen: 'r3k3/Q7/8/8/8/8/8/4K3 b - - 0 1', move: 'a8a7', sign: -1 },
  ]) {
    it(`publishes a ${scenario.color} evaluation and takes an undefended queen through balanced selection`, async () => {
      const logger = pino({ level: 'silent' });
      const engine = new LozzaEngine(logger, distribution);
      const gateway = new FakeGateway();
      gateway.state = gameSnapshot([], {
        initialFen: scenario.fen,
        color: scenario.color,
        steps: [{ ply: 0, fen: scenario.fen, san: null, uci: null }],
      });
      const settings = {
        ...DEFAULT_SETTINGS,
        engineId: distribution.id,
        depth: 4,
        evaluationDepth: 4,
        variations: 3,
        mistakeProbability: 0,
        dynamicDelay: false,
        randomDelayMaxMs: 0,
      };
      const store = new DashboardStore(settings);
      const runner = new GameRunner(
        'abcdefghwxyz',
        account,
        gateway,
        new MoveSelector(engine),
        settings,
        new Set(),
        store,
        logger,
      );
      const cancellation = new AbortController();
      const finished = expect(runner.run(cancellation.signal)).rejects.toMatchObject({
        name: 'AbortError',
      });
      try {
        await vi.waitFor(
          () => {
            const move = gateway.channels[0]?.sent.find((frame) => frame.t === 'move');
            expect(move?.d).toMatchObject({ u: scenario.move });
          },
          { timeout: 15_000 },
        );
        const evaluation = store.snapshot().games[0]?.evaluation;
        expect(evaluation?.fen).toBe(scenario.fen);
        expect(evaluation?.depth).toBeGreaterThanOrEqual(4);
        expect((evaluation?.score ?? 0) * scenario.sign).toBeGreaterThan(2);
      } finally {
        cancellation.abort(abortError());
        await finished;
        await engine.close();
        store.close();
      }
    }, 20_000);
  }
});

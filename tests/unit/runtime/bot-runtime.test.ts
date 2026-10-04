import { describe, expect, it, vi } from 'vitest';
import pino from 'pino';
import { DEFAULT_SETTINGS } from '../../../packages/contracts/src/index.js';
import { ConfigurationService } from '../../../apps/server/src/application/config/configuration-service.js';
import { DashboardStore } from '../../../apps/server/src/application/dashboard/dashboard-store.js';
import { EngineRegistry } from '../../../apps/server/src/application/engine/engine-registry.js';
import { BotRuntime } from '../../../apps/server/src/application/runtime/bot-runtime.js';
import { deferred } from '../../../apps/server/src/shared/async.js';
import { FakeGateway, gameSnapshot, memoryConfig, secret } from '../../fixtures/server.js';

async function createRuntime(gateways: FakeGateway[], target = 1) {
  const accounts = gateways.map((_, index) => ({
    ...secret(`Account ${index}`),
    cookie: `lila2=test-session-${index}`,
  }));
  const config = new ConfigurationService(
    memoryConfig(accounts, { ...DEFAULT_SETTINGS, totalMatches: target }),
  );
  await config.load();
  const store = new DashboardStore(config.settings);
  const registry = new EngineRegistry();
  const create = vi.fn(() => ({ analyze: vi.fn(), close: vi.fn(async () => {}) }));
  registry.register({ id: DEFAULT_SETTINGS.engineId, name: 'Fake local engine', create });
  const archive = {
    save: vi.fn(async () => {}),
    load: vi.fn(async () => []),
    flush: vi.fn(async () => {}),
    clear: vi.fn(async () => {}),
  };
  const runtime = new BotRuntime(
    config,
    registry,
    (account) => gateways[accounts.findIndex((entry) => entry.id === account.id)]!,
    store,
    archive,
    pino({ level: 'silent' }),
  );
  runtime.refreshConfiguration();
  return { runtime, store, create, archive };
}

describe('session coordination', () => {
  it('verifies all accounts and recovers games before any new pairing starts', async () => {
    const first = new FakeGateway();
    const second = new FakeGateway();
    const verification = deferred<{ id: string; username: string }>();
    second.authenticate.mockImplementation(() => verification.promise);
    first.playing.mockResolvedValue([{ fullId: 'abcdefghwxyz', speed: 'blitz' }]);
    first.state = gameSnapshot(['e4', 'e5'], { status: 31, statusName: 'resign', winner: 'white' });
    const app = await createRuntime([first, second]);
    try {
      app.runtime.command('start');
      await vi.waitFor(() => expect(second.authenticate).toHaveBeenCalled());
      expect(first.channels[0]!.sent.some((frame) => frame.t === 'poolIn')).toBe(false);
      expect(app.create).not.toHaveBeenCalled();
      expect(app.store.snapshot().runtime.active).toBe(1);
      verification.resolve({ id: 'anotherbot', username: 'AnotherBot' });
      await vi.waitFor(() => expect(app.store.snapshot().runtime.phase).toBe('completed'));
      expect(app.store.snapshot().runtime.completed).toBe(1);
      expect(app.archive.save).toHaveBeenCalledTimes(1);
      expect(first.channels[0]!.sent.some((frame) => frame.t === 'poolIn')).toBe(false);
    } finally {
      await app.runtime.close();
      app.store.close();
    }
  });
  it('pauses matchmaking, resumes it and can stop immediately without leaving resources running', async () => {
    const gateway = new FakeGateway();
    const app = await createRuntime([gateway], 10);
    try {
      app.runtime.command('start');
      await vi.waitFor(() =>
        expect(gateway.channels[0]!.sent.some((frame) => frame.t === 'poolIn')).toBe(true),
      );
      expect(() => app.runtime.assertEditable()).toThrow('Finish');
      app.runtime.command('pause');
      await vi.waitFor(() =>
        expect(gateway.channels[0]!.sent.some((frame) => frame.t === 'poolOut')).toBe(true),
      );
      app.runtime.command('resume');
      await vi.waitFor(() =>
        expect(
          gateway.channels[0]!.sent.filter((frame) => frame.t === 'poolIn').length,
        ).toBeGreaterThan(1),
      );
      app.runtime.command('stop-now');
      await vi.waitFor(() => expect(app.store.snapshot().runtime.phase).toBe('idle'));
      expect(gateway.channels.every((channel) => !channel.connected)).toBe(true);
      expect(app.runtime.editable).toBe(true);
    } finally {
      await app.runtime.close();
      app.store.close();
    }
  });
  it('rejects two sessions for the same account before either enters matchmaking', async () => {
    const first = new FakeGateway();
    const second = new FakeGateway();
    const app = await createRuntime([first, second]);
    try {
      app.runtime.command('start');
      await vi.waitFor(() => expect(app.store.snapshot().runtime.phase).toBe('error'));
      expect(app.store.snapshot().accounts[1]?.error).toContain('Another session');
      expect(first.channels[0]!.sent).toEqual([]);
      expect(app.create).not.toHaveBeenCalled();
    } finally {
      await app.runtime.close();
      app.store.close();
    }
  });
});

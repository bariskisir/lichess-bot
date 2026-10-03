import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pino from 'pino';
import { ConfigurationService } from '../../../apps/server/src/application/config/configuration-service.js';
import { DashboardStore } from '../../../apps/server/src/application/dashboard/dashboard-store.js';
import { BotRuntime } from '../../../apps/server/src/application/runtime/bot-runtime.js';
import { EngineRegistry } from '../../../apps/server/src/application/engine/engine-registry.js';
import { GameArchive } from '../../../apps/server/src/adapters/persistence/game-archive.js';
import { DashboardHttpServer } from '../../../apps/server/src/adapters/http/http-server.js';
import { memoryConfig, FakeGateway } from '../../fixtures/server.js';
import { AuthenticationService } from '../../../apps/server/src/application/auth/authentication-service.js';
import { JsonAuthenticationRepository } from '../../../apps/server/src/adapters/auth/json-authentication-repository.js';
import { ScryptPasswordHasher } from '../../../apps/server/src/adapters/auth/scrypt-password-hasher.js';

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});
async function application() {
  const directory = await mkdtemp(join(tmpdir(), 'lichess-bot-http-'));
  cleanup.push(() => rm(directory, { recursive: true, force: true }));
  const config = new ConfigurationService(memoryConfig());
  await config.load();
  const store = new DashboardStore(config.settings);
  const archive = new GameArchive(directory);
  await archive.load();
  const gateway = vi.fn(() => new FakeGateway());
  const registry = new EngineRegistry();
  registry.register({
    id: 'stockfish-19-lite-local',
    name: 'Test engine',
    create: () => {
      throw new Error('No games should be started.');
    },
  });
  const runtime = new BotRuntime(
    config,
    registry,
    gateway,
    store,
    archive,
    pino({ level: 'silent' }),
  );
  runtime.refreshConfiguration();
  const auth = new AuthenticationService(
    new JsonAuthenticationRepository(directory),
    new ScryptPasswordHasher(),
  );
  await auth.load();
  const server = new DashboardHttpServer(
    { host: '127.0.0.1', port: 0, development: false, demo: false },
    config,
    runtime,
    store,
    pino({ level: 'silent' }),
    auth,
    registry,
  );
  await server.listen();
  cleanup.push(async () => {
    await runtime.close();
    await server.close();
    store.close();
  });
  return { url: `http://127.0.0.1:${server.port}`, gateway, directory };
}
const mutationHeaders = { 'Content-Type': 'application/json', 'X-Lichess-Bot': 'dashboard' };

describe('dashboard API boundaries', () => {
  it('opens without a password, then protects the APIs and supports password rotation and removal', async () => {
    const app = await application();
    const request = (path: string, method = 'GET', body?: unknown, cookie = '') =>
      fetch(`${app.url}/api/${path}`, {
        method,
        headers: { ...mutationHeaders, Cookie: cookie },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    expect(await (await request('auth/status')).json()).toEqual({
      passwordEnabled: false,
      authenticated: true,
    });
    const set = await request('auth/password', 'PUT', { password: 'test-password-one' });
    expect(set.status).toBe(200);
    expect(set.headers.get('set-cookie')).toContain('HttpOnly');
    expect(set.headers.get('set-cookie')).toContain('SameSite=Strict');
    const firstCookie = set.headers.get('set-cookie')!.split(';')[0]!;
    expect((await request('snapshot')).status).toBe(401);
    expect((await request('events')).status).toBe(401);
    expect((await request('configuration')).status).toBe(401);
    expect((await request('snapshot', 'GET', undefined, firstCookie)).status).toBe(200);
    const stored = await readFile(join(app.directory, 'dashboard-auth.json'), 'utf8');
    expect(stored).toContain('scrypt');
    expect(stored).not.toContain('test-password-one');
    expect((await request('auth/login', 'POST', { password: 'incorrect' })).status).toBe(401);
    expect(
      (
        await request(
          'auth/password',
          'PUT',
          { password: 'test-password-two', currentPassword: 'incorrect' },
          firstCookie,
        )
      ).status,
    ).toBe(401);
    const changed = await request(
      'auth/password',
      'PUT',
      { password: 'test-password-two', currentPassword: 'test-password-one' },
      firstCookie,
    );
    expect(changed.status).toBe(200);
    const secondCookie = changed.headers.get('set-cookie')!.split(';')[0]!;
    expect((await request('snapshot', 'GET', undefined, firstCookie)).status).toBe(401);
    expect((await request('auth/logout', 'POST', {}, secondCookie)).status).toBe(200);
    expect((await request('snapshot', 'GET', undefined, secondCookie)).status).toBe(401);
    const login = await request('auth/login', 'POST', { password: 'test-password-two' });
    expect(login.status).toBe(200);
    const thirdCookie = login.headers.get('set-cookie')!.split(';')[0]!;
    expect(
      (
        await request(
          'auth/password',
          'PUT',
          { password: null, currentPassword: 'test-password-two' },
          thirdCookie,
        )
      ).status,
    ).toBe(200);
    expect((await request('snapshot')).status).toBe(200);
    expect(await readFile(join(app.directory, 'dashboard-auth.json'), 'utf8')).toBe('null\n');
    expect(app.gateway).not.toHaveBeenCalled();
  });
  it('limits failed password attempts and rejects a short password', async () => {
    const app = await application();
    const update = (password: string) =>
      fetch(`${app.url}/api/auth/password`, {
        method: 'PUT',
        headers: mutationHeaders,
        body: JSON.stringify({ password }),
      });
    expect((await update('short')).status).toBe(422);
    await update('test-password');
    for (let index = 0; index < 5; index++) {
      const failure = await fetch(`${app.url}/api/auth/login`, {
        method: 'POST',
        headers: mutationHeaders,
        body: '{"password":"incorrect"}',
      });
      expect(failure.status).toBe(401);
    }
    const blocked = await fetch(`${app.url}/api/auth/login`, {
      method: 'POST',
      headers: mutationHeaders,
      body: '{"password":"test-password"}',
    });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).toBe('60');
  });
  it('stores a credential without exposing it in snapshots or configuration responses', async () => {
    const app = await application();
    const response = await fetch(`${app.url}/api/accounts`, {
      method: 'POST',
      headers: mutationHeaders,
      body: JSON.stringify({ label: 'Main', cookie: 'private-fake-test-session' }),
    });
    expect(response.status).toBe(201);
    const snapshot = await (await fetch(`${app.url}/api/snapshot`)).text();
    expect(snapshot).toContain('Main');
    expect(snapshot).not.toContain('private-fake-test-session');
    const configuration = await (await fetch(`${app.url}/api/configuration`)).text();
    expect(configuration).not.toContain('private-fake-test-session');
    expect(app.gateway).not.toHaveBeenCalled();
  });
  it('rejects foreign origins and unmarked mutations before changing state', async () => {
    const app = await application();
    const foreign = await fetch(`${app.url}/api/accounts`, {
      method: 'POST',
      headers: { ...mutationHeaders, Origin: 'https://example.org' },
      body: '{}',
    });
    expect(foreign.status).toBe(403);
    const unmarked = await fetch(`${app.url}/api/control`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"command":"start"}',
    });
    expect(unmarked.status).toBe(403);
    expect(app.gateway).not.toHaveBeenCalled();
  });
  it('validates settings and serves read-only demo data without opening Lichess connections', async () => {
    const app = await application();
    const invalid = await fetch(`${app.url}/api/settings`, {
      method: 'PUT',
      headers: mutationHeaders,
      body: '{"depth":0}',
    });
    expect(invalid.status).toBe(422);
    const unknown = await fetch(`${app.url}/api/settings`, {
      method: 'PUT',
      headers: mutationHeaders,
      body: '{"engineId":"unavailable"}',
    });
    expect(unknown.status).toBe(400);
    const demo = await (await fetch(`${app.url}/api/demo`)).json();
    expect(demo.demo).toBe(true);
    expect(demo.games).toHaveLength(6);
    expect(app.gateway).not.toHaveBeenCalled();
  });
});

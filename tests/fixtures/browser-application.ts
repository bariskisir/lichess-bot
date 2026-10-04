import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import pino from 'pino';
import { ConfigurationService } from '../../apps/server/src/application/config/configuration-service.js';
import { DashboardStore } from '../../apps/server/src/application/dashboard/dashboard-store.js';
import { BotRuntime } from '../../apps/server/src/application/runtime/bot-runtime.js';
import { EngineRegistry } from '../../apps/server/src/application/engine/engine-registry.js';
import { AuthenticationService } from '../../apps/server/src/application/auth/authentication-service.js';
import { JsonConfigurationRepository } from '../../apps/server/src/adapters/persistence/json-configuration-repository.js';
import { GameArchive } from '../../apps/server/src/adapters/persistence/game-archive.js';
import { JsonAuthenticationRepository } from '../../apps/server/src/adapters/auth/json-authentication-repository.js';
import { ScryptPasswordHasher } from '../../apps/server/src/adapters/auth/scrypt-password-hasher.js';
import { DashboardHttpServer } from '../../apps/server/src/adapters/http/http-server.js';

/** A real dashboard and SSE stream with isolated data and no external game connections. */
export async function browserApplication() {
  const directory = await mkdtemp(join(tmpdir(), 'lichess-bot-browser-'));
  const logger = pino({ level: 'silent' });
  const config = new ConfigurationService(new JsonConfigurationRepository(directory));
  await config.load();
  const store = new DashboardStore(config.settings);
  const archive = new GameArchive(directory);
  await archive.load();
  const registry = new EngineRegistry();
  const runtime = new BotRuntime(
    config,
    registry,
    () => {
      throw new Error('External connections are disabled in browser fixtures.');
    },
    store,
    archive,
    logger,
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
    logger,
    auth,
    registry,
  );
  await server.listen();
  return {
    store,
    archive,
    url: `http://127.0.0.1:${server.port}`,
    async close() {
      await runtime.close();
      await server.close();
      store.close();
      await archive.flush();
      if (
        dirname(directory) !== resolve(tmpdir()) ||
        !basename(directory).startsWith('lichess-bot-browser-')
      )
        throw new Error('Unexpected browser fixture directory.');
      await rm(directory, { recursive: true, force: true });
    },
  };
}

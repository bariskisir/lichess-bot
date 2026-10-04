import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import pino from 'pino';
import { readLaunchOptions } from './config/launch-options.js';
import { ConfigurationService } from './application/config/configuration-service.js';
import { DashboardStore } from './application/dashboard/dashboard-store.js';
import { EngineRegistry } from './application/engine/engine-registry.js';
import { StockfishEngine } from './adapters/engines/stockfish/stockfish-engine.js';
import { STOCKFISH_DISTRIBUTIONS } from './adapters/engines/stockfish/stockfish-distributions.js';
import { LozzaEngine } from './adapters/engines/lozza/lozza-engine.js';
import { LOZZA_DISTRIBUTIONS } from './adapters/engines/lozza/lozza-distributions.js';
import { WebLichessGateway } from './adapters/lichess/web-gateway.js';
import { GameArchive } from './adapters/persistence/game-archive.js';
import { JsonConfigurationRepository } from './adapters/persistence/json-configuration-repository.js';
import { BotRuntime } from './application/runtime/bot-runtime.js';
import { DashboardHttpServer } from './adapters/http/http-server.js';
import { AuthenticationService } from './application/auth/authentication-service.js';
import { ScryptPasswordHasher } from './adapters/auth/scrypt-password-hasher.js';
import { JsonAuthenticationRepository } from './adapters/auth/json-authentication-repository.js';

const launch = readLaunchOptions();
const config = new ConfigurationService(new JsonConfigurationRepository(launch.directory));
await config.load();
await mkdir('logs', { recursive: true });
const destination = pino.destination({
  dest: resolve('logs', `lichess-bot-${new Date().toISOString().slice(0, 10)}.jsonl`),
  sync: false,
});
const logger = pino(
  {
    level: config.settings.logLevel,
    redact: ['cookie', 'token', 'accounts', 'headers', '*.cookie', '*.token'],
  },
  destination,
);
const archive = new GameArchive(launch.directory);
const store = new DashboardStore(config.settings);
store.restoreHistory(await archive.load());
const engines = new EngineRegistry();
for (const distribution of STOCKFISH_DISTRIBUTIONS)
  engines.register({
    id: distribution.id,
    name: distribution.name,
    elo: distribution.elo,
    create: () => new StockfishEngine(config.settings.hashMb, logger, distribution),
  });
for (const distribution of LOZZA_DISTRIBUTIONS)
  engines.register({
    id: distribution.id,
    name: distribution.name,
    elo: distribution.elo,
    create: () => new LozzaEngine(logger, distribution),
  });
const runtime = new BotRuntime(
  config,
  engines,
  (account) =>
    new WebLichessGateway(account.cookie, {
      userAgent: config.settings.userAgent,
      retry: { attempts: config.settings.requestAttempts, delayMs: config.settings.requestDelayMs },
    }),
  store,
  archive,
  logger,
);
runtime.refreshConfiguration();
const auth = new AuthenticationService(
  new JsonAuthenticationRepository(launch.directory),
  new ScryptPasswordHasher(),
);
await auth.load();
const server = new DashboardHttpServer(
  {
    host: '127.0.0.1',
    port: launch.port ?? config.settings.dashboardPort,
    development: launch.development,
    demo: false,
  },
  config,
  runtime,
  store,
  logger,
  auth,
  engines,
);
await server.listen();
console.info(`lichess-bot is ready at http://localhost:${server.port}`);
if (config.settings.autoStart && launch.autoStart && config.accounts.length)
  runtime.command('start');
let closing = false;
async function shutdown(): Promise<void> {
  if (closing) return;
  closing = true;
  console.info('Stopping lichess-bot...');
  await runtime.close();
  await server.close();
  await archive.flush();
  store.close();
  await new Promise<void>((resolve) => logger.flush(() => resolve()));
  destination.end();
}
process.once('SIGINT', () => {
  void shutdown();
});
process.once('SIGTERM', () => {
  void shutdown();
});

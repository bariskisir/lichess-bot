import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { z } from 'zod';
import type { Logger } from 'pino';
import {
  settingsSchema,
  type DashboardSnapshot,
} from '../../../../../packages/contracts/src/index.js';
import type { EngineRegistry } from '../../application/engine/engine-registry.js';
import type { ConfigurationService } from '../../application/config/configuration-service.js';
import { RuntimeConflict, type BotRuntime } from '../../application/runtime/bot-runtime.js';
import type { DashboardStore } from '../../application/dashboard/dashboard-store.js';
import { createDemoSnapshot } from '../demo/demo-snapshot.js';
import {
  AuthenticationFailure,
  type AuthenticationService,
} from '../../application/auth/authentication-service.js';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
};

export interface HttpServerOptions {
  host: string;
  port: number;
  development: boolean;
  demo: boolean;
}

export class DashboardHttpServer {
  private readonly server;
  private vite?: import('vite').ViteDevServer;
  private readonly streams = new Set<ServerResponse>();
  private readonly staticRoot = resolve('dist/web');
  private demoSnapshot?: DashboardSnapshot;
  private boundPort = 0;
  private mutations: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly options: HttpServerOptions,
    private readonly config: ConfigurationService,
    private readonly runtime: BotRuntime,
    private readonly store: DashboardStore,
    private readonly logger: Logger,
    private readonly auth: AuthenticationService,
    private readonly engines: EngineRegistry,
  ) {
    if (options.demo) this.demoSnapshot = createDemoSnapshot();
    this.server = createServer((request, response) => {
      void this.handle(request, response).catch((error: unknown) => this.fail(response, error));
    });
    this.server.requestTimeout = 15_000;
    this.server.headersTimeout = 10_000;
  }
  get port(): number {
    return this.boundPort;
  }

  async listen(): Promise<void> {
    if (this.options.development) {
      const { createServer: createViteServer } = await import('vite');
      this.vite = await createViteServer({
        configFile: resolve('apps/web/vite.config.ts'),
        server: { middlewareMode: true, ws: { server: this.server } },
      });
    }
    await new Promise<void>((accept, reject) => {
      this.server.once('error', reject);
      this.server.listen(this.options.port, this.options.host, () => {
        this.server.off('error', reject);
        accept();
      });
    });
    const address = this.server.address();
    this.boundPort = typeof address === 'object' && address ? address.port : this.options.port;
  }

  private authorizedHost(request: IncomingMessage): boolean {
    try {
      const host = new URL(`http://${request.headers.host ?? ''}`);
      return (
        ['localhost', '127.0.0.1', '[::1]'].includes(host.hostname) &&
        Number(host.port || 80) === this.boundPort
      );
    } catch {
      return false;
    }
  }
  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (!this.authorizedHost(request)) {
      this.json(response, 403, { error: 'Invalid dashboard host.' });
      return;
    }
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader(
      'Content-Security-Policy',
      `default-src 'self'; script-src 'self'${this.options.development ? " 'unsafe-inline'" : ''}; style-src 'self'${this.options.development ? " 'unsafe-inline'" : ''}; img-src 'self' data:; connect-src 'self'${this.options.development ? ' ws://localhost:* ws://127.0.0.1:*' : ''}; object-src 'none'; base-uri 'self'; frame-ancestors 'none'`,
    );
    const path = new URL(request.url ?? '/', 'http://localhost').pathname;
    const method = request.method ?? 'GET';
    if (method !== 'GET' && method !== 'HEAD') {
      const origin = request.headers.origin;
      if (
        (origin && origin !== `http://${request.headers.host}`) ||
        request.headers['x-lichess-bot'] !== 'dashboard'
      ) {
        this.json(response, 403, { error: 'Use the dashboard to change application state.' });
        return;
      }
      if (this.options.demo) {
        this.json(response, 409, {
          error: 'Preview is read-only. Return to your workspace to make changes.',
        });
        return;
      }
    }
    if (path === '/api/health' && method === 'GET') {
      this.json(response, 200, { status: 'ok', name: 'lichess-bot' });
      return;
    }
    const token = /(?:^|;\s*)lichess_bot_session=([A-Za-z\d_-]{43})(?:;|$)/.exec(
      request.headers.cookie ?? '',
    )?.[1];
    const client = request.socket.remoteAddress ?? 'local';
    if (path === '/api/auth/status' && method === 'GET') {
      this.json(response, 200, this.auth.status(token));
      return;
    }
    if (path === '/api/auth/login' && method === 'POST') {
      const input = z
        .object({ password: z.string().min(1).max(128) })
        .parse(await this.body(request));
      const session = await this.mutate(() => this.auth.login(input.password, client));
      this.sessionCookie(response, session);
      this.json(response, 200, this.auth.status(session ?? undefined));
      return;
    }
    if (path === '/api/auth/logout' && method === 'POST') {
      this.auth.logout(token);
      for (const stream of this.streams) stream.end();
      this.sessionCookie(response, null);
      this.json(response, 200, this.auth.status());
      return;
    }
    if (path.startsWith('/api/') && !this.auth.authorized(token)) {
      this.json(response, 401, { error: 'Sign in to access the dashboard.' });
      return;
    }
    if (path === '/api/auth/password' && method === 'PUT') {
      const input = z
        .object({
          password: z.string().min(8).max(128).nullable(),
          currentPassword: z.string().max(128).optional(),
        })
        .parse(await this.body(request));
      const session = await this.mutate(async () => {
        if (!this.auth.authorized(token))
          throw new AuthenticationFailure('Sign in to access the dashboard.');
        return this.auth.change(input.password, input.currentPassword, client);
      });
      this.sessionCookie(response, session);
      for (const stream of this.streams) stream.end();
      this.json(response, 200, this.auth.status(session ?? undefined));
      return;
    }
    if (path === '/api/snapshot' && method === 'GET') {
      this.json(response, 200, this.demoSnapshot ?? this.store.snapshot());
      return;
    }
    if (path === '/api/demo' && method === 'GET') {
      this.json(response, 200, createDemoSnapshot());
      return;
    }
    if (path === '/api/events' && method === 'GET') {
      this.stream(request, response);
      return;
    }
    if (path === '/api/configuration' && method === 'GET') {
      this.json(response, 200, {
        settings: this.config.settings,
        engines: this.engines.list(),
      });
      return;
    }
    if (path === '/api/control' && method === 'POST') {
      const input = z
        .object({ command: z.enum(['start', 'pause', 'resume', 'stop', 'stop-now']) })
        .parse(await this.body(request));
      await this.mutate(async () => {
        if (!this.auth.authorized(token))
          throw new AuthenticationFailure('Sign in to access the dashboard.');
        this.runtime.command(input.command);
      });
      this.json(response, 202, { ok: true });
      return;
    }
    if (path === '/api/settings' && method === 'PUT') {
      const input = await this.body(request);
      await this.mutate(async () => {
        if (!this.auth.authorized(token))
          throw new AuthenticationFailure('Sign in to access the dashboard.');
        this.runtime.assertEditable();
        const settings = settingsSchema.parse(input);
        this.engines.get(settings.engineId);
        await this.config.updateSettings(settings);
        this.logger.level = this.config.settings.logLevel;
        this.runtime.refreshConfiguration();
      });
      this.json(response, 200, { settings: this.config.settings });
      return;
    }
    if (path === '/api/accounts' && method === 'POST') {
      const input = await this.body(request);
      await this.mutate(async () => {
        if (!this.auth.authorized(token))
          throw new AuthenticationFailure('Sign in to access the dashboard.');
        this.runtime.assertEditable();
        await this.config.addAccount(input);
        this.runtime.refreshConfiguration();
      });
      this.json(response, 201, { ok: true });
      return;
    }
    const accountId = /^\/api\/accounts\/([a-f\d-]{36})$/.exec(path)?.[1];
    if (accountId && (method === 'DELETE' || method === 'PUT')) {
      const input = method === 'PUT' ? await this.body(request) : undefined;
      await this.mutate(async () => {
        if (!this.auth.authorized(token))
          throw new AuthenticationFailure('Sign in to access the dashboard.');
        this.runtime.assertEditable();
        if (method === 'DELETE') await this.config.removeAccount(accountId);
        else await this.config.replaceAccount(accountId, input);
        this.runtime.refreshConfiguration();
      });
      this.json(response, 200, { ok: true });
      return;
    }
    if (path.startsWith('/api/')) {
      this.json(response, 404, { error: 'Endpoint not found.' });
      return;
    }
    if (!['GET', 'HEAD'].includes(method)) {
      this.json(response, 405, { error: 'Method not allowed.' });
      return;
    }
    if (this.vite) {
      this.vite.middlewares(request, response, () => {
        if (!response.writableEnded) this.json(response, 404, { error: 'Page not found.' });
      });
      return;
    }
    let file: string;
    try {
      file = resolve(this.staticRoot, `.${decodeURIComponent(path)}`);
    } catch {
      this.json(response, 400, { error: 'Invalid path.' });
      return;
    }
    if (!file.startsWith(`${this.staticRoot}${sep}`) && file !== this.staticRoot) {
      this.json(response, 403, { error: 'Invalid path.' });
      return;
    }
    try {
      if (!(await stat(file)).isFile()) throw new Error('Not a file.');
    } catch {
      if (extname(path)) {
        this.json(response, 404, { error: 'Asset not found.' });
        return;
      }
      file = resolve(this.staticRoot, 'index.html');
    }
    const bytes = await readFile(file);
    response.setHeader('Content-Type', MIME[extname(file)] ?? 'application/octet-stream');
    response.setHeader(
      'Cache-Control',
      file.includes(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
    );
    response.end(method === 'HEAD' ? undefined : bytes);
  }

  private json(response: ServerResponse, status: number, data: unknown): void {
    response.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    response.end(JSON.stringify(data));
  }
  private sessionCookie(response: ServerResponse, token: string | null): void {
    response.setHeader(
      'Set-Cookie',
      `lichess_bot_session=${token ?? ''}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${token ? 43200 : 0}`,
    );
  }
  private mutate<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.mutations.then(operation);
    this.mutations = next.catch(() => {});
    return next;
  }
  private async body(request: IncomingMessage): Promise<unknown> {
    if (!request.headers['content-type']?.startsWith('application/json'))
      throw new RuntimeConflict('Send JSON data.');
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
      const buffer = Buffer.from(chunk);
      size += buffer.length;
      if (size > 32_768) throw new RuntimeConflict('The request is too large.');
      chunks.push(buffer);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      throw new RuntimeConflict('The request contains invalid JSON.');
    }
  }
  private stream(request: IncomingMessage, response: ServerResponse): void {
    if (this.streams.size >= 20) {
      this.json(response, 503, { error: 'Too many dashboard connections.' });
      return;
    }
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    this.streams.add(response);
    const token = /(?:^|;\s*)lichess_bot_session=([A-Za-z\d_-]{43})(?:;|$)/.exec(
      request.headers.cookie ?? '',
    )?.[1];
    const send = (snapshot: DashboardSnapshot) => {
      if (!this.auth.authorized(token)) {
        response.end();
        return;
      }
      if (response.writableLength > 1024 * 1024) {
        response.end();
        return;
      }
      response.write(`id: ${snapshot.revision}\ndata: ${JSON.stringify(snapshot)}\n\n`);
    };
    send(this.demoSnapshot ?? this.store.snapshot());
    const unsubscribe = this.options.demo ? () => {} : this.store.subscribe(send);
    const heartbeat = setInterval(() => {
      if (!this.auth.authorized(token)) response.end();
      else response.write(': heartbeat\n\n');
    }, 15_000);
    const close = () => {
      clearInterval(heartbeat);
      unsubscribe();
      this.streams.delete(response);
    };
    request.once('close', close);
    response.once('close', close);
  }
  private fail(response: ServerResponse, error: unknown): void {
    if (response.headersSent) {
      response.end();
      return;
    }
    if (error instanceof z.ZodError) {
      this.json(response, 422, {
        error: 'Check the highlighted settings.',
        details: z.flattenError(error).fieldErrors,
      });
      return;
    }
    if (error instanceof AuthenticationFailure) {
      if (error.status === 429) response.setHeader('Retry-After', '60');
      this.json(response, error.status, { error: error.message });
      return;
    }
    if (error instanceof RuntimeConflict) {
      this.json(response, 409, { error: error.message });
      return;
    }
    this.logger.warn('Dashboard request failed');
    this.json(response, 400, {
      error:
        error instanceof Error && !error.message.includes('data')
          ? error.message
          : 'The request failed. Check the application logs.',
    });
  }
  async close(): Promise<void> {
    for (const stream of this.streams) stream.end();
    await this.vite?.close();
    await new Promise<void>((resolve) => {
      this.server.close(() => resolve());
      this.server.closeIdleConnections();
    });
  }
}

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import type { Logger } from 'pino';
import type {
  ChessEngine,
  AnalysisRequest,
  Analysis,
  Variation,
} from '../../../domain/engine/engine.js';
import { abortError, deferred } from '../../../shared/async.js';
import { parseInfo, positionCommand } from './uci.js';
import { DEFAULT_STOCKFISH, type StockfishDistribution } from './stockfish-distributions.js';

interface Search {
  result: ReturnType<typeof deferred<Analysis>>;
  request: AnalysisRequest;
  variations: Map<number, Variation>;
  abort: () => void;
}

export class StockfishEngine implements ChessEngine {
  private child?: ChildProcessWithoutNullStreams;
  private opening?: Promise<void>;
  private handshake?: ReturnType<typeof deferred<void>>;
  private search?: Search;
  private cleanup: Promise<void> = Promise.resolve();
  private startupTimer?: ReturnType<typeof setTimeout>;
  private progressTimer?: ReturnType<typeof setInterval>;
  private lastProgress = 0;
  private previousGame = '';
  private identified = false;

  constructor(
    private readonly hashMb: number,
    private readonly logger: Logger,
    private readonly distribution: StockfishDistribution = DEFAULT_STOCKFISH,
  ) {}

  async analyze(request: AnalysisRequest): Promise<Analysis> {
    request.signal.throwIfAborted();
    await this.start();
    request.signal.throwIfAborted();
    if (this.search) throw new Error('An engine worker can search only one position at a time.');
    const result = deferred<Analysis>();
    const abort = () => this.fail(abortError());
    this.search = { result, request, variations: new Map(), abort };
    request.signal.addEventListener('abort', abort, { once: true });
    this.lastProgress = Date.now();
    this.progressTimer = setInterval(() => {
      if (Date.now() - this.lastProgress > 30_000)
        this.fail(new Error('Stockfish stopped making progress.'));
    }, 1000);
    try {
      if (this.previousGame !== request.gameId) {
        this.send('ucinewgame');
        this.previousGame = request.gameId;
      }
      this.send(`setoption name MultiPV value ${request.variations}`);
      this.send(positionCommand(request.position));
      this.send(`go depth ${request.depth}`);
    } catch (error) {
      this.fail(error instanceof Error ? error : new Error('Engine command failed.'));
    }
    return result.promise;
  }

  private async start(): Promise<void> {
    await this.cleanup;
    if (this.opening) return this.opening;
    if (this.child) return;
    const require = createRequire(import.meta.url);
    const engineFile = join(
      dirname(require.resolve(`${this.distribution.packageName}/package.json`)),
      this.distribution.directory,
      this.distribution.entry,
    );
    const child = spawn(process.execPath, [engineFile], { stdio: 'pipe', windowsHide: true });
    this.child = child;
    this.identified = false;
    this.handshake = deferred<void>();
    const handshake = this.handshake;
    const lines = createInterface({ input: child.stdout });
    lines.on('line', (line) => {
      if (this.child === child) this.receive(line);
    });
    child.stdin.on('error', (error) => {
      if (this.child === child) this.fail(error);
    });
    child.stderr.on('data', () => this.logger.warn('Stockfish reported a diagnostic.'));
    child.once('error', (error) => {
      if (this.child === child) this.fail(error);
    });
    child.once('exit', () => {
      lines.close();
      if (this.child === child) this.fail(new Error('Stockfish exited unexpectedly.'));
    });
    this.startupTimer = setTimeout(
      () => this.fail(new Error('Stockfish startup timed out.')),
      15_000,
    );
    this.opening = handshake.promise.finally(() => {
      this.opening = undefined;
    });
    this.send('uci');
    return this.opening;
  }

  private send(command: string): void {
    if (!this.child || this.child.stdin.destroyed)
      throw new Error('The engine command channel is closed.');
    this.child.stdin.write(`${command}\n`);
  }

  private receive(line: string): void {
    if (line.startsWith('id name '))
      this.identified = line.startsWith(`id name ${this.distribution.identification}`);
    if (line === 'uciok') {
      if (!this.identified) {
        this.fail(new Error(`Expected ${this.distribution.name}.`));
        return;
      }
      this.send(`setoption name Hash value ${this.hashMb}`);
      this.send('isready');
    }
    if (line === 'readyok' && this.handshake) {
      clearTimeout(this.startupTimer);
      this.handshake.resolve();
      this.handshake = undefined;
    }
    const search = this.search;
    if (!search) return;
    if (/\b(depth|nodes|currmove)\b/.test(line)) this.lastProgress = Date.now();
    const info = parseInfo(line);
    if (info) {
      search.variations.set(info.index, info);
      if (info.index === 1) search.request.onInfo?.(info);
    }
    if (!line.startsWith('bestmove ')) return;
    this.search = undefined;
    clearInterval(this.progressTimer);
    search.request.signal.removeEventListener('abort', search.abort);
    const bestMove = line.split(' ')[1] ?? '';
    const variations = [...search.variations.values()]
      .filter((variation) => variation.depth >= search.request.depth)
      .sort((a, b) => a.index - b.index);
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(bestMove) || !variations.length)
      search.result.reject(new Error('Stockfish did not complete the requested search depth.'));
    else search.result.resolve({ bestMove, variations });
  }

  private fail(error: Error): void {
    clearInterval(this.progressTimer);
    clearTimeout(this.startupTimer);
    const search = this.search;
    this.search = undefined;
    search?.request.signal.removeEventListener('abort', search.abort);
    search?.result.reject(error);
    this.handshake?.reject(error);
    this.handshake = undefined;
    const child = this.child;
    this.child = undefined;
    this.previousGame = '';
    if (child && child.exitCode === null && child.signalCode === null) {
      this.cleanup = new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          child.kill('SIGKILL');
          resolve();
        }, 2000);
        child.once('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
        child.kill();
      });
    }
  }

  async close(): Promise<void> {
    this.fail(abortError('Engine stopped.'));
    await this.cleanup;
  }
}

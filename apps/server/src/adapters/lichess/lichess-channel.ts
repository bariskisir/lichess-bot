import { randomBytes } from 'node:crypto';
import WebSocket, { type RawData } from 'ws';
import {
  AuthenticationError,
  type GameChannel,
  type RemoteFrame,
} from '../../domain/lichess/gateway.js';
import { frameSchema } from './protocol.js';
import { DEFAULT_TRANSPORT, type LichessTransportOptions } from './transport-options.js';
import { LichessRetry } from './lichess-retry.js';
import { LichessHttpError, retryAfterMilliseconds } from './lichess-errors.js';

const SOCKET_HOSTS = [
  'socket0.lichess.org',
  'socket3.lichess.org',
  'socket1.lichess.org',
  'socket4.lichess.org',
  'socket2.lichess.org',
  'socket5.lichess.org',
];

export class LichessChannel implements GameChannel {
  private socket?: WebSocket;
  private heartbeat?: ReturnType<typeof setInterval>;
  private abortSignal?: AbortSignal;
  private readonly sri = randomBytes(9).toString('base64url');
  private readonly listeners = new Set<(frame: RemoteFrame) => void>();
  private readonly disconnectListeners = new Set<() => void>();
  private connectionNumber = 0;
  private receivedAt = 0;
  private pingAt = 0;
  private currentVersion?: number;
  lagMs = 0;
  constructor(
    private readonly cookie: string,
    private readonly options: LichessTransportOptions = DEFAULT_TRANSPORT,
    private readonly retry = new LichessRetry(options.retry),
  ) {}
  get connected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }
  get version(): number | undefined {
    return this.currentVersion;
  }
  setVersion(version: number): void {
    this.currentVersion = version;
  }
  subscribe(listener: (frame: RemoteFrame) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  onDisconnect(listener: () => void): () => void {
    this.disconnectListeners.add(listener);
    return () => this.disconnectListeners.delete(listener);
  }

  async connect(path: string, signal: AbortSignal, version?: number): Promise<void> {
    await this.retry.run(async () => {
      try {
        await this.connectOnce(path, signal, version);
      } catch (error) {
        this.close();
        throw error;
      }
    }, signal);
  }
  private async connectOnce(path: string, signal: AbortSignal, version?: number): Promise<void> {
    this.close();
    signal.throwIfAborted();
    this.currentVersion = version;
    const url = new URL(
      path,
      `wss://${SOCKET_HOSTS[this.connectionNumber++ % SOCKET_HOSTS.length]}`,
    );
    url.searchParams.set('sri', this.sri);
    if (version !== undefined) url.searchParams.set('v', String(version));
    const socket = new WebSocket(url, {
      headers: { Cookie: this.cookie, 'User-Agent': this.options.userAgent },
      origin: 'https://lichess.org',
      handshakeTimeout: 10_000,
      perMessageDeflate: false,
      maxPayload: 2 * 1024 * 1024,
    });
    this.socket = socket;
    this.abortSignal = signal;
    signal.addEventListener('abort', this.abort, { once: true });
    socket.on('error', () => {});
    socket.on('message', (raw) => {
      if (this.socket === socket) this.receive(raw);
    });
    socket.once('close', () => {
      if (this.socket === socket) this.disconnected();
    });
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        socket.off('open', open);
        socket.off('error', error);
        socket.off('close', closed);
        socket.off('unexpected-response', unexpected);
      };
      const open = () => {
        cleanup();
        this.receivedAt = Date.now();
        this.heartbeat = setInterval(() => {
          if (Date.now() - this.receivedAt > 15_000) this.disconnected();
          else this.ping();
        }, 2500);
        this.ping();
        resolve();
      };
      const error = (error: Error) => {
        cleanup();
        reject(error);
      };
      const closed = () => {
        cleanup();
        reject(signal.aborted ? signal.reason : new Error('Lichess closed the connection.'));
      };
      const unexpected = (_request: unknown, response: import('node:http').IncomingMessage) => {
        const status = response.statusCode ?? 502;
        const header = response.headers['retry-after'];
        response.resume();
        error(
          [401, 403].includes(status)
            ? new AuthenticationError()
            : new LichessHttpError(
                status,
                retryAfterMilliseconds(typeof header === 'string' ? header : undefined, status),
              ),
        );
      };
      socket.once('open', open);
      socket.once('error', error);
      socket.once('close', closed);
      socket.once('unexpected-response', unexpected);
    });
  }
  send(type: string, data?: unknown): void {
    if (!this.connected || !this.socket) throw new Error('Lichess is disconnected.');
    this.socket.send(JSON.stringify(data === undefined ? { t: type } : { t: type, d: data }));
  }
  private ping(): void {
    if (!this.connected || !this.socket) return;
    this.pingAt = Date.now();
    this.socket.send(
      this.currentVersion === undefined
        ? 'null'
        : JSON.stringify({ t: 'p', v: this.currentVersion }),
    );
  }
  private receive(raw: RawData): void {
    this.receivedAt = Date.now();
    const text = raw.toString();
    if (text === '0') {
      this.lagMs = this.lagMs
        ? this.lagMs * 0.8 + (Date.now() - this.pingAt) * 0.2
        : Date.now() - this.pingAt;
      return;
    }
    try {
      const value: unknown = JSON.parse(text);
      if (value === null) return;
      const frames = Array.isArray(value) ? value : [value];
      for (const item of frames) {
        this.deliver(frameSchema.parse(item));
        if (!this.socket) return;
      }
    } catch {
      this.disconnected();
    }
  }
  private deliver(frame: RemoteFrame): void {
    if (frame.t === 'batch') {
      if (!Array.isArray(frame.d)) throw new Error('Invalid Lichess event batch.');
      for (const item of frame.d) {
        this.deliver(frameSchema.parse(item));
        if (!this.socket) return;
      }
      return;
    }
    if (frame.t === 'n') this.lagMs = Math.max(0, Date.now() - this.pingAt);
    if (frame.t === 'resync') {
      this.disconnected();
      return;
    }
    if (frame.v !== undefined && this.currentVersion !== undefined) {
      if (frame.v <= this.currentVersion) return;
      if (frame.v !== this.currentVersion + 1) {
        this.disconnected();
        return;
      }
      this.currentVersion = frame.v;
    }
    for (const listener of this.listeners) listener(frame);
  }
  private readonly abort = (): void => {
    this.close();
  };
  private disconnected(): void {
    this.close();
    for (const listener of this.disconnectListeners) listener();
  }
  close(): void {
    clearInterval(this.heartbeat);
    this.abortSignal?.removeEventListener('abort', this.abort);
    this.abortSignal = undefined;
    const socket = this.socket;
    this.socket = undefined;
    socket?.terminate();
  }
}

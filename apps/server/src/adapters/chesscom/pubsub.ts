import WebSocket from 'ws';
import { gunzipSync } from 'node:zlib';
import type { Logger } from 'pino';
import { DEFAULT_TRANSPORT, type LichessTransportOptions } from '../lichess/transport-options.js';

export const PUBSUB_CLIENT_VERSION = '1.6.0';
export const PUBSUB_WEB_VERSION = '20261007101245';

function randomClientId(length = 8): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < length; i++) id += alphabet[Math.floor(Math.random() * alphabet.length)];
  return id;
}

export function pubsubUrl(userId: string): string {
  const params = new URLSearchParams({
    uid: userId,
    client_type: 'web',
    client_version: PUBSUB_CLIENT_VERSION,
    client_id: randomClientId(),
    web_version: PUBSUB_WEB_VERSION,
  });
  return `wss://www.chess.com/pubsub?${params}`;
}

export const MATCHER_TICKETS_CHANNEL = 'matcher/tickets/users/:me';

/**
 * Minimal client for the chess.com pubsub socket (`wss://www.chess.com/pubsub`).
 * Wire vectors come from `har/www.chess.com.har` (`GET wss://www.chess.com/pubsub?...`):
 * `0[...]` handshake, `41[...]` subscribe, `45[...]` acknowledgments, `43[...]`
 * confirmations, gzip-compressed `47[...]` data pushes and `2`/`3` keepalives.
 */
export class PubsubClient {
  private socket?: WebSocket;
  private abortSignal?: AbortSignal;
  private nextSubId = 1;
  private readonly subscriptions = new Map<number, string>();
  private readonly listeners = new Map<string, Set<(data: unknown) => void>>();

  constructor(
    private readonly cookie: string,
    private readonly userId: string,
    private readonly options: LichessTransportOptions = DEFAULT_TRANSPORT,
    private readonly logger?: Logger,
  ) {}

  get connected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  async connect(signal: AbortSignal, url: string = pubsubUrl(this.userId)): Promise<void> {
    this.close();
    signal.throwIfAborted();
    const socket = new WebSocket(url, {
      headers: {
        Cookie: this.cookie,
        Origin: 'https://www.chess.com',
        'User-Agent': this.options.userAgent,
      },
      handshakeTimeout: 10_000,
      maxPayload: 4 * 1024 * 1024,
    });
    this.socket = socket;
    this.abortSignal = signal;
    signal.addEventListener('abort', this.abort, { once: true });
    socket.on('error', () => {});
    socket.on('message', (raw) => {
      if (this.socket === socket) this.receive(String(raw));
    });
    socket.once('close', () => {
      if (this.socket === socket) this.close();
    });
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        socket.off('open', open);
        socket.off('error', error);
        socket.off('close', closed);
      };
      const open = () => {
        cleanup();
        resolve();
      };
      const error = (error: Error) => {
        cleanup();
        reject(error);
      };
      const closed = () => {
        cleanup();
        reject(signal.aborted ? signal.reason : new Error('chess.com pubsub closed.'));
      };
      socket.once('open', open);
      socket.once('error', error);
      socket.once('close', closed);
    });
  }

  subscribe(channel: string, listener: (data: unknown) => void): () => void {
    let listeners = this.listeners.get(channel);
    if (!listeners) {
      listeners = new Set();
      this.listeners.set(channel, listeners);
    }
    listeners.add(listener);
    const subId = this.nextSubId++;
    this.subscriptions.set(subId, channel);
    this.send(`41[${JSON.stringify(channel)}]`);
    return () => {
      listeners.delete(listener);
      if (!listeners.size) {
        this.listeners.delete(channel);
        this.send(`42[${JSON.stringify(channel)}]`);
      }
      this.subscriptions.delete(subId);
    };
  }

  close(): void {
    this.abortSignal?.removeEventListener('abort', this.abort);
    this.abortSignal = undefined;
    const socket = this.socket;
    this.socket = undefined;
    this.subscriptions.clear();
    socket?.terminate();
  }

  private send(text: string): void {
    if (!this.connected || !this.socket) throw new Error('chess.com pubsub is disconnected.');
    this.socket.send(text);
  }

  private receive(text: string): void {
    const type = /^\d+/.exec(text)?.[0];
    if (type === undefined) return;
    const payload = text.slice(type.length);
    try {
      if (type === '0') {
        const handshake: unknown[] = payload ? (JSON.parse(payload) as unknown[]) : [];
        this.send(`0${JSON.stringify(handshake.slice(0, 3))}`);
      } else if (type === '2') {
        this.send('3');
      } else if (type === '45' || type === '47') {
        const message = JSON.parse(payload) as [number, ...unknown[]];
        const [subId, channel, , data] = message;
        this.send(`43[${subId}]`);
        if (type === '47' && typeof channel === 'string') {
          let decoded: unknown = data;
          if (typeof data === 'string') {
            try {
              decoded = JSON.parse(gunzipSync(Buffer.from(data, 'base64')).toString('utf8'));
            } catch {
              decoded = data;
            }
          }
          for (const listener of this.listeners.get(channel) ?? []) listener(decoded);
        }
      }
    } catch (error) {
      this.logger?.warn(
        { error: error instanceof Error ? error.message : 'Unknown error' },
        'chess.com pubsub message failed',
      );
    }
  }

  private readonly abort = (): void => {
    this.close();
  };
}

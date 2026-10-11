import WebSocket from 'ws';
import type { Logger } from 'pino';
import {
  acknowledgmentsRoute,
  decodeFrame,
  encodeCancel,
  encodeFireAndForget,
  encodeKeepalive,
  encodePayload,
  encodeRequestResponse,
  encodeRequestStream,
  encodeSetup,
  eventsRoute,
  movesRoute,
  type SetupAuth,
} from './rsocket.js';
import type {
  ChesscomChannel,
  ChesscomGameEvent,
  ChesscomGameTransport,
} from '../../domain/chesscom/gateway.js';
import { DEFAULT_TRANSPORT, type LichessTransportOptions } from '../lichess/transport-options.js';
import { LichessRetry } from '../lichess/lichess-retry.js';
import { AuthenticationError } from '../../domain/lichess/gateway.js';

interface PendingResponse {
  resolve: (data: string) => void;
  reject: (error: Error) => void;
}

export class ChesscomRSocketChannel implements ChesscomChannel {
  private socket?: WebSocket;
  private keepalive?: ReturnType<typeof setInterval>;
  private abortSignal?: AbortSignal;
  private nextStream = 1;
  private readonly streams = new Map<number, { route: string; gameId: string }>();
  private readonly watchers = new Map<string, Set<(event: ChesscomGameEvent) => void>>();
  private readonly pending = new Map<number, PendingResponse>();
  private readonly acknowledged = new Set<string>();

  constructor(
    private readonly cookie: string,
    private readonly auth: SetupAuth,
    private readonly url: string = 'wss://www.chess.com/service/play-us-2-5/rsocket',
    private readonly options: LichessTransportOptions = DEFAULT_TRANSPORT,
    private readonly retry = new LichessRetry(options.retry),
    private readonly logger?: Logger,
    private readonly routes: ChesscomGameTransport['routes'] = null,
  ) {}

  private watchRoute(gameId: string): string {
    return this.routes?.watch ?? eventsRoute(gameId);
  }

  private moveRoute(gameId: string): string {
    return this.routes?.move ?? movesRoute(gameId);
  }

  private ackRoute(gameId: string): string {
    return this.routes?.acknowledgement ?? acknowledgmentsRoute(gameId);
  }

  get connected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  async connect(signal: AbortSignal): Promise<void> {
    this.logger?.info({ url: this.url }, 'chess.com RSocket connecting');
    await this.retry.run(async () => {
      try {
        await this.connectOnce(signal);
      } catch (error) {
        this.close();
        throw error;
      }
    }, signal);
  }

  watchGame(gameId: string, listener: (event: ChesscomGameEvent) => void): () => void {
    let watchers = this.watchers.get(gameId);
    if (!watchers) {
      watchers = new Set();
      this.watchers.set(gameId, watchers);
    }
    watchers.add(listener);
    const streamId = this.nextStream;
    this.nextStream += 2;
    this.streams.set(streamId, { route: this.watchRoute(gameId), gameId });
    this.send(encodeRequestStream(streamId, this.watchRoute(gameId)));
    return () => {
      watchers.delete(listener);
      if (!watchers.size) this.watchers.delete(gameId);
      const entry = [...this.streams.entries()].find(([, value]) => value.gameId === gameId);
      if (entry) {
        this.streams.delete(entry[0]);
        this.send(encodeCancel(entry[0]));
      }
    };
  }

  acknowledge(gameId: string, eventUpdatedAt: string): void {
    const key = `${gameId}:${eventUpdatedAt}`;
    if (this.acknowledged.has(key)) return;
    this.acknowledged.add(key);
    if (this.acknowledged.size > 200) {
      const [first] = this.acknowledged;
      if (first) this.acknowledged.delete(first);
    }
    this.send(
      encodeFireAndForget(
        this.allocateStream(),
        this.ackRoute(gameId),
        JSON.stringify({ eventUpdatedAt, receivedAt: new Date().toISOString() }),
      ),
    );
  }

  sendMove(payload: {
    clock: number;
    gameId: string;
    index: number;
    metadata: {
      clockms: number;
      toggledMove: boolean;
      changeOfHeartMove: boolean;
      moveHoldTime: number;
      CM_6: number;
      CM_8: boolean;
    };
    move: string;
  }): Promise<string> {
    const streamId = this.allocateStream();
    return new Promise<string>((resolve, reject) => {
      this.pending.set(streamId, { resolve, reject });
      try {
        this.send(encodeRequestResponse(streamId, this.moveRoute(payload.gameId), JSON.stringify(payload)));
      } catch (error) {
        this.pending.delete(streamId);
        reject(error instanceof Error ? error : new Error('chess.com move failed.'));
      }
      setTimeout(() => {
        if (this.pending.delete(streamId))
          reject(new Error('chess.com did not confirm the move.'));
      }, 10_000).unref?.();
    });
  }

  close(): void {
    clearInterval(this.keepalive);
    this.keepalive = undefined;
    this.abortSignal?.removeEventListener('abort', this.abort);
    this.abortSignal = undefined;
    const socket = this.socket;
    this.socket = undefined;
    for (const [, pending] of this.pending) pending.reject(new Error('chess.com disconnected.'));
    this.pending.clear();
    socket?.terminate();
  }

  private allocateStream(): number {
    const streamId = this.nextStream;
    this.nextStream += 2;
    return streamId;
  }

  private send(buffer: Buffer): void {
    if (!this.connected || !this.socket) throw new Error('chess.com is disconnected.');
    this.socket.send(buffer);
  }

  private async connectOnce(signal: AbortSignal): Promise<void> {
    this.close();
    signal.throwIfAborted();
    const socket = new WebSocket(this.url, {
      headers: { Cookie: this.cookie, Origin: 'https://www.chess.com', 'User-Agent': this.options.userAgent },
      handshakeTimeout: 10_000,
      maxPayload: 4 * 1024 * 1024,
    });
    this.socket = socket;
    this.abortSignal = signal;
    signal.addEventListener('abort', this.abort, { once: true });
    socket.on('error', () => {});
    socket.on('message', (raw) => {
      if (this.socket === socket) this.receive(Buffer.from(raw as Buffer));
    });
    socket.once('close', () => {
      if (this.socket === socket) this.close();
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
        try {
          socket.send(encodeSetup(this.auth));
        } catch (error) {
          reject(error instanceof Error ? error : new Error('chess.com setup failed.'));
          return;
        }
        this.keepalive = setInterval(() => {
          try {
            this.send(encodeKeepalive(false));
          } catch {
            /* Reconnection is handled by the game runner. */
          }
        }, 2000);
        resolve();
      };
      const error = (error: Error) => {
        cleanup();
        reject(error);
      };
      const closed = () => {
        cleanup();
        reject(signal.aborted ? signal.reason : new Error('chess.com closed the connection.'));
      };
      const unexpected = (_request: unknown, response: import('node:http').IncomingMessage) => {
        cleanup();
        response.resume();
        reject(
          [401, 403].includes(response.statusCode ?? 500)
            ? new AuthenticationError()
            : new Error('chess.com closed the connection.'),
        );
      };
      socket.once('open', open);
      socket.once('error', error);
      socket.once('close', closed);
      socket.once('unexpected-response', unexpected);
    });
  }

  private receive(buffer: Buffer): void {
    let frame;
    try {
      frame = decodeFrame(buffer);
    } catch {
      return;
    }
    if (frame.kind === 'keepalive') {
      if (frame.respond) {
        try {
          this.send(encodeKeepalive(false));
        } catch {
          /* ignore */
        }
      }
      return;
    }
    if (frame.kind === 'error') {
      this.logger?.warn(
        { streamId: frame.streamId, data: frame.data.slice(0, 300) },
        'chess.com RSocket error',
      );
      const pending = this.pending.get(frame.streamId);
      if (pending) {
        this.pending.delete(frame.streamId);
        pending.reject(new Error(`chess.com rejected the request: ${frame.data.slice(0, 200)}`));
      }
      return;
    }
    if (frame.kind === 'payload') {
      const pending = this.pending.get(frame.streamId);
      if (pending) {
        this.pending.delete(frame.streamId);
        pending.resolve(frame.data);
        return;
      }
      const stream = this.streams.get(frame.streamId);
      if (stream && frame.data) {
        try {
          const event = JSON.parse(frame.data) as ChesscomGameEvent;
          if (event?.id === stream.gameId)
            for (const listener of this.watchers.get(stream.gameId) ?? []) listener(event);
        } catch {
          /* Malformed game events trigger recovery in the runner. */
        }
      }
      return;
    }
    if (frame.kind === 'request' && (frame.route === 'echo' || frame.route?.endsWith('.pings'))) {
      try {
        this.send(encodePayload(frame.streamId, frame.data, true));
      } catch {
        /* ignore */
      }
    }
  }

  private readonly abort = (): void => {
    this.close();
  };
}

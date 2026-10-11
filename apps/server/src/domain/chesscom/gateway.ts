import type { Color } from '../../../../../packages/contracts/src/index.js';

export interface ChesscomAccount {
  id: string;
  username: string;
}

export interface ChesscomGameTransport {
  /** Absolute RSocket URL when the entry names it, else derived from `region`. */
  wsUrl: string | null;
  region: string | null;
  routes: { watch: string; move: string; acknowledgement: string } | null;
}

export interface ChesscomActiveGame {
  id: string;
  region: string | null;
  transport: ChesscomGameTransport;
  raw: Record<string, unknown>;
}

export interface ChesscomTicket {
  seekId: string;
  state: string;
  /** Our color as reported by the matcher ticket. */
  color: Color | null;
  game: {
    id: string;
    players: string[];
    raw: Record<string, unknown>;
    transport: ChesscomGameTransport;
  } | null;
}

/** Live event pushed on `games.{id}.events` (clocks are milliseconds). */
export interface ChesscomGameEvent {
  id: string;
  clocks: [number, number];
  moves: [string, number][];
  updatedAt: string;
  startedAt?: string;
  actions?: string[][];
  /** Present when the game ends: per-player results, e.g. `['win', 'resigned']`. */
  results?: unknown;
}

export interface ChesscomMovePayload {
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
}

export interface ChesscomChannel {
  readonly connected: boolean;
  connect(signal: AbortSignal): Promise<void>;
  watchGame(gameId: string, listener: (event: ChesscomGameEvent) => void): () => void;
  acknowledge(gameId: string, eventUpdatedAt: string): void;
  sendMove(payload: ChesscomMovePayload): Promise<string>;
  close(): void;
}

export interface ChesscomGateway {
  authenticate(signal: AbortSignal): Promise<ChesscomAccount>;
  activeGames(signal: AbortSignal): Promise<ChesscomActiveGame[]>;
  seekState(seekId: string, signal: AbortSignal): Promise<string | null>;
  createChannel(transport: ChesscomGameTransport): ChesscomChannel;
}

export class ChesscomAuthenticationError extends Error {
  constructor(message = 'The chess.com session expired. Replace the account session in Accounts.') {
    super(message);
    this.name = 'ChesscomAuthenticationError';
  }
}

export function chesscomExternalGameUrl(gameId: string): string {
  return `https://www.chess.com/game/live/${encodeURIComponent(gameId)}`;
}

export function chesscomProfileUrl(username: string): string {
  return `https://www.chess.com/member/${encodeURIComponent(username)}`;
}

export function colorOfIndex(color: Color, index: number): boolean {
  return (color === 'white') === (index % 2 === 0);
}

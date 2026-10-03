import type { Color, PlayerView } from '../../../../../packages/contracts/src/index.js';

export interface RemoteAccount {
  id: string;
  username: string;
}
export interface RemoteGame {
  fullId: string;
  speed: string;
}
export interface GameStep {
  ply: number;
  fen: string;
  san: string | null;
  uci: string | null;
}
export interface GameSnapshot {
  id: string;
  playerId: string;
  userId: string;
  variant: string;
  version: number;
  color: Color;
  white: PlayerView;
  black: PlayerView;
  initialFen: string;
  steps: GameStep[];
  ply: number;
  status: number;
  statusName: string;
  winner: Color | null;
  clock: {
    white: number;
    black: number;
    running: boolean;
    initial: number;
    increment: number;
  } | null;
  rated: boolean;
  createdAt: number;
  opponentGone: boolean;
  ownDrawOffer: boolean;
  opponentDrawOffer: boolean;
  noClaimWin: boolean;
}
export interface RemoteFrame {
  t: string;
  d?: unknown;
  v?: number;
}
export interface GameChannel {
  readonly connected: boolean;
  readonly version: number | undefined;
  readonly lagMs: number;
  connect(path: string, signal: AbortSignal, version?: number): Promise<void>;
  setVersion(version: number): void;
  send(type: string, data?: unknown): void;
  subscribe(listener: (frame: RemoteFrame) => void): () => void;
  onDisconnect(listener: () => void): () => void;
  close(): void;
}
export interface LichessGateway {
  authenticate(signal: AbortSignal): Promise<RemoteAccount>;
  playing(signal: AbortSignal): Promise<RemoteGame[]>;
  snapshot(fullId: string, signal: AbortSignal): Promise<GameSnapshot>;
  createChannel(): GameChannel;
}
export class AuthenticationError extends Error {
  constructor(message = 'The session expired. Replace the account session in Accounts.') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

import type { BotSettings } from './settings.js';

export type Color = 'white' | 'black';
export type RuntimePhase =
  'idle' | 'starting' | 'running' | 'paused' | 'draining' | 'completed' | 'error';
export type GameActivity =
  'recovering' | 'queued' | 'thinking' | 'delaying' | 'confirming' | 'waiting' | 'finished';
export type GameResult = 'win' | 'loss' | 'draw' | 'aborted';
export const RESULT_HOLD_MS = 3000;

export interface PlayerView {
  id: string;
  name: string;
  rating: number | null;
  title: string | null;
}
export interface EvaluationView {
  score: number;
  mate: number | null;
  depth: number;
  fen: string;
  updatedAt: number;
}
export interface GameView {
  id: string;
  accountId: string;
  accountName: string;
  color: Color;
  white: PlayerView;
  black: PlayerView;
  fen: string;
  initialFen: string;
  moves: string[];
  lastMove: string | null;
  ply: number;
  turn: Color;
  check: boolean;
  clock: { white: number; black: number; running: boolean; updatedAt: number } | null;
  timeControl: string;
  rated: boolean;
  activity: GameActivity;
  delayUntil: number | null;
  status: string;
  evaluation: EvaluationView | null;
  startedAt: number;
  finishedAt: number | null;
  result: GameResult | null;
}
export interface AccountView {
  id: string;
  label: string;
  username: string | null;
  userId: string | null;
  state: 'ready' | 'authenticating' | 'searching' | 'playing' | 'recovering' | 'error';
  pool: string | null;
  error: string | null;
}
export interface ActivityView {
  id: string;
  at: number;
  level: 'info' | 'warn' | 'error';
  message: string;
  accountId: string | null;
  gameId: string | null;
}
export interface RuntimeView {
  phase: RuntimePhase;
  startedAt: number | null;
  completed: number;
  target: number;
  active: number;
  searching: number;
  wins: number;
  losses: number;
  draws: number;
  aborted: number;
  error: string | null;
}
export interface EngineView {
  id: string;
  name: string;
  workers: number;
  busy: number;
  queued: number;
  capacity: number;
}
export interface DashboardSnapshot {
  instanceId: string;
  revision: number;
  serverTime: number;
  demo: boolean;
  runtime: RuntimeView;
  engine: EngineView;
  settings: BotSettings;
  accounts: AccountView[];
  games: GameView[];
  history: GameView[];
  activity: ActivityView[];
}
export type RuntimeCommand = 'start' | 'pause' | 'resume' | 'stop' | 'stop-now';
export interface ApiError {
  error: string;
  details?: Record<string, string[]>;
}

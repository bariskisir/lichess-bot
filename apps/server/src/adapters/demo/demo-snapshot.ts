import { Chess, DEFAULT_POSITION } from 'chess.js';
import {
  DEFAULT_SETTINGS,
  type DashboardSnapshot,
  type GameView,
} from '../../../../../packages/contracts/src/index.js';
import { initialRuntime } from '../../application/dashboard/dashboard-store.js';

const openings = [
  [
    'e4',
    'e5',
    'Nf3',
    'Nc6',
    'Bb5',
    'a6',
    'Ba4',
    'Nf6',
    'O-O',
    'Be7',
    'Re1',
    'b5',
    'Bb3',
    'd6',
    'c3',
  ],
  ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Bg5', 'Be7', 'e3', 'O-O', 'Nf3', 'h6', 'Bh4', 'b6'],
  [
    'e4',
    'c5',
    'Nf3',
    'd6',
    'd4',
    'cxd4',
    'Nxd4',
    'Nf6',
    'Nc3',
    'a6',
    'Be3',
    'e5',
    'Nb3',
    'Be6',
    'f3',
    'Be7',
  ],
  ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7', 'e4', 'd6', 'Nf3', 'O-O', 'Be2', 'e5', 'O-O'],
  ['e4', 'e6', 'd4', 'd5', 'Nc3', 'Bb4', 'e5', 'c5', 'a3', 'Bxc3+', 'bxc3', 'Ne7'],
  ['Nf3', 'd5', 'g3', 'Nf6', 'Bg2', 'e6', 'O-O', 'Be7', 'd3', 'O-O', 'Nbd2'],
];
const opponents = [
  'QuietBishop',
  'EndgameAtlas',
  'KnightHorizon',
  'PassedPawn',
  'TempoSeeker',
  'FileAndRank',
];

export function createDemoSnapshot(): DashboardSnapshot {
  const now = Date.now();
  const games: GameView[] = openings.map((moves, index) => {
    const board = new Chess();
    for (const move of moves) board.move(move);
    const color = index % 2 === 0 ? 'white' : 'black';
    const own = { id: 'demo-bot', name: 'DemoBot', rating: 2140, title: null };
    const opponent = {
      id: `demo-player-${index}`,
      name: opponents[index]!,
      rating: 1920 + index * 47,
      title: index === 2 ? 'FM' : null,
    };
    const last = board.history({ verbose: true }).at(-1)!;
    return {
      id: `demo000${index}`,
      accountId: 'demo-account',
      accountName: 'DemoBot',
      color,
      white: color === 'white' ? own : opponent,
      black: color === 'black' ? own : opponent,
      fen: board.fen(),
      initialFen: DEFAULT_POSITION,
      moves: board.history(),
      lastMove: `${last.from}${last.to}${last.promotion ?? ''}`,
      ply: moves.length,
      turn: board.turn() === 'w' ? 'white' : 'black',
      check: board.isCheck(),
      clock: { white: 162 - index * 15, black: 154 - index * 11, running: true, updatedAt: now },
      timeControl: index % 2 ? '5+3' : '3+2',
      rated: true,
      activity: index === 0 ? 'thinking' : index === 3 ? 'queued' : 'waiting',
      delayUntil: null,
      status: 'started',
      evaluation: {
        score: [0.34, -0.72, 1.26, 0.12, -0.21, 0.58][index]!,
        mate: null,
        depth: 12,
        fen: board.fen(),
        updatedAt: now,
      },
      startedAt: now - 180_000 - index * 9000,
      finishedAt: null,
      result: null,
    };
  });
  const history: GameView[] = games.slice(0, 3).map((game, index) => ({
    ...game,
    id: `history${index}`,
    activity: 'finished',
    status: ['mate', 'draw', 'resign'][index]!,
    result: (['win', 'draw', 'loss'] as const)[index]!,
    finishedAt: now - (index + 1) * 300_000,
    clock: game.clock ? { ...game.clock, running: false } : null,
  }));
  return {
    instanceId: 'dashboard-preview',
    revision: 1,
    serverTime: now,
    demo: true,
    settings: { ...DEFAULT_SETTINGS, maxConcurrentGames: 8 },
    runtime: {
      ...initialRuntime(100),
      phase: 'running',
      startedAt: now - 2_100_000,
      active: games.length,
      completed: 18,
      wins: 12,
      draws: 4,
      losses: 2,
      searching: 1,
    },
    engine: {
      id: DEFAULT_SETTINGS.engineId,
      name: 'Lozza 2',
      workers: 2,
      busy: 1,
      queued: 1,
      capacity: 2,
    },
    accounts: [
      {
        id: 'demo-account',
        label: 'Main account',
        username: 'DemoBot',
        userId: 'demo-bot',
        state: 'searching',
        pool: '3+2',
        error: null,
      },
    ],
    games,
    history,
    activity: [
      {
        id: 'demo-event-1',
        at: now - 10_000,
        level: 'info',
        message: 'Game finished: win.',
        accountId: 'demo-account',
        gameId: 'history0',
      },
      {
        id: 'demo-event-2',
        at: now - 35_000,
        level: 'warn',
        message: 'Game connection interrupted; recovering the same game.',
        accountId: 'demo-account',
        gameId: games[2]!.id,
      },
      {
        id: 'demo-event-3',
        at: now - 65_000,
        level: 'info',
        message: 'Session started. Existing games were recovered before matchmaking.',
        accountId: null,
        gameId: null,
      },
    ],
  };
}

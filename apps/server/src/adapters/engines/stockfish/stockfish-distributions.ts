export interface StockfishDistribution {
  id: string;
  name: string;
  packageName: string;
  directory: string;
  entry: string;
  identification: string;
  elo: number;
  maxHashMb?: number;
}

export const STOCKFISH_DISTRIBUTIONS: readonly StockfishDistribution[] = [
  {
    id: 'stockfish-19-lite-local',
    name: 'Stockfish 19 Lite',
    packageName: 'stockfish',
    directory: 'bin',
    entry: 'stockfish-19-lite-single.js',
    identification: 'Stockfish 19 Lite',
    elo: 3792,
  },
  {
    id: 'stockfish-10-local',
    name: 'Stockfish 10',
    packageName: 'stockfish-10',
    directory: 'src',
    entry: 'stockfish.js',
    identification: 'Stockfish.js 10',
    elo: 3447,
    maxHashMb: 16,
  },
];

export const DEFAULT_STOCKFISH = STOCKFISH_DISTRIBUTIONS[0]!;

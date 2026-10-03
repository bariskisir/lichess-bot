export interface StockfishDistribution {
  id: string;
  name: string;
  packageName: string;
  directory: string;
  entry: string;
  identification: string;
}

export const STOCKFISH_DISTRIBUTIONS: readonly StockfishDistribution[] = [
  {
    id: 'stockfish-19-lite-local',
    name: 'Stockfish 19 Lite',
    packageName: 'stockfish',
    directory: 'bin',
    entry: 'stockfish-19-lite-single.js',
    identification: 'Stockfish 19 Lite',
  },
  {
    id: 'stockfish-18-lite-local',
    name: 'Stockfish 18 Lite',
    packageName: 'stockfish-18',
    directory: 'bin',
    entry: 'stockfish-18-lite-single.js',
    identification: 'Stockfish 18 Lite',
  },
  {
    id: 'stockfish-17-lite-local',
    name: 'Stockfish 17.1 Lite',
    packageName: 'stockfish-17',
    directory: 'src',
    entry: 'stockfish-17.1-lite-single-03e3232.js',
    identification: 'Stockfish 17.1 Lite',
  },
];

export const DEFAULT_STOCKFISH = STOCKFISH_DISTRIBUTIONS[0]!;

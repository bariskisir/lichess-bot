import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { Logger } from 'pino';
import { UciEngine } from '../uci/uci-engine.js';
import { DEFAULT_STOCKFISH, type StockfishDistribution } from './stockfish-distributions.js';

export class StockfishEngine extends UciEngine {
  constructor(
    hashMb: number,
    logger: Logger,
    distribution: StockfishDistribution = DEFAULT_STOCKFISH,
  ) {
    super(hashMb, logger, {
      name: distribution.name,
      identification: distribution.identification,
      maxHashMb: distribution.maxHashMb,
      arguments: () => {
        const require = createRequire(import.meta.url);
        return [
          join(
            dirname(require.resolve(`${distribution.packageName}/package.json`)),
            distribution.directory,
            distribution.entry,
          ),
        ];
      },
    });
  }
}

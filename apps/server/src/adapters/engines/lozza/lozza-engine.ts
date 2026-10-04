import { fileURLToPath } from 'node:url';
import type { Logger } from 'pino';
import { UciEngine } from '../uci/uci-engine.js';
import { DEFAULT_LOZZA, type LozzaDistribution } from './lozza-distributions.js';

export class LozzaEngine extends UciEngine {
  constructor(logger: Logger, distribution: LozzaDistribution = DEFAULT_LOZZA) {
    super(16, logger, {
      name: distribution.name,
      identification: distribution.identification,
      interruptible: false,
      arguments: () => {
        const development = import.meta.url.endsWith('.ts');
        const runner = fileURLToPath(
          new URL(development ? './lozza-process.ts' : './lozza-process.js', import.meta.url),
        );
        return [...(development ? ['--import', 'tsx'] : []), runner, distribution.version];
      },
    });
  }
}

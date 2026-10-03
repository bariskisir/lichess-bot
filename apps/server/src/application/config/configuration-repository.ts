import type { Configuration } from '../../../../../packages/contracts/src/index.js';

export interface ConfigurationRepository {
  load(): Promise<Configuration>;
  save(configuration: Configuration): Promise<void>;
}

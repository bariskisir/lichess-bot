import { join } from 'node:path';
import {
  configurationSchema,
  DEFAULT_SETTINGS,
  type Configuration,
} from '../../../../../packages/contracts/src/index.js';
import type { ConfigurationRepository } from '../../application/config/configuration-repository.js';
import { AtomicJsonFile } from './atomic-json.js';

export class JsonConfigurationRepository implements ConfigurationRepository {
  private readonly file: AtomicJsonFile<Configuration>;
  constructor(directory: string) {
    this.file = new AtomicJsonFile(join(directory, 'configuration.json'), (value) =>
      configurationSchema.parse(value),
    );
  }
  load(): Promise<Configuration> {
    return this.file.read({ version: 1, settings: DEFAULT_SETTINGS, accounts: [] });
  }
  save(configuration: Configuration): Promise<void> {
    return this.file.write(configuration);
  }
}

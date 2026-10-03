import { randomUUID } from 'node:crypto';
import {
  accountInputSchema,
  configurationSchema,
  settingsSchema,
  type AccountSecret,
  type BotSettings,
  type Configuration,
} from '../../../../../packages/contracts/src/index.js';
import type { ConfigurationRepository } from './configuration-repository.js';

export class ConfigurationService {
  private configuration!: Configuration;
  constructor(private readonly repository: ConfigurationRepository) {}
  async load(): Promise<void> {
    this.configuration = await this.repository.load();
  }
  get settings(): BotSettings {
    return this.configuration.settings;
  }
  get accounts(): AccountSecret[] {
    return this.configuration.accounts;
  }
  async updateSettings(input: unknown): Promise<void> {
    const settings = settingsSchema.parse(input);
    const next = { ...this.configuration, settings };
    await this.repository.save(next);
    this.configuration = next;
  }
  async addAccount(input: unknown): Promise<AccountSecret> {
    const parsed = accountInputSchema.parse(input);
    if (this.accounts.some((account) => account.cookie === parsed.cookie))
      throw new Error('This session is already connected.');
    const account = { ...parsed, id: randomUUID() };
    const next = configurationSchema.parse({
      ...this.configuration,
      accounts: [...this.configuration.accounts, account],
    });
    await this.repository.save(next);
    this.configuration = next;
    return account;
  }
  async replaceAccount(id: string, input: unknown): Promise<void> {
    if (!this.accounts.some((account) => account.id === id)) throw new Error('Account not found.');
    const parsed = accountInputSchema.parse(input);
    if (this.accounts.some((account) => account.id !== id && account.cookie === parsed.cookie))
      throw new Error('This session is already connected.');
    const next = {
      ...this.configuration,
      accounts: this.configuration.accounts.map((account) =>
        account.id === id ? { ...parsed, id } : account,
      ),
    };
    await this.repository.save(next);
    this.configuration = next;
  }
  async removeAccount(id: string): Promise<void> {
    const next = {
      ...this.configuration,
      accounts: this.configuration.accounts.filter((account) => account.id !== id),
    };
    await this.repository.save(next);
    this.configuration = next;
  }
}

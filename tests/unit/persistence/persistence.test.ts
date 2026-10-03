import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigurationService } from '../../../apps/server/src/application/config/configuration-service.js';
import { JsonConfigurationRepository } from '../../../apps/server/src/adapters/persistence/json-configuration-repository.js';
import { GameArchive } from '../../../apps/server/src/adapters/persistence/game-archive.js';
import { archivedGame } from '../../fixtures/server.js';

const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});
async function directory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'lichess-bot-test-'));
  directories.push(path);
  return path;
}

describe('local persistence', () => {
  it('persists normalized sessions and replaces them without returning secrets to public models', async () => {
    const path = await directory();
    const config = new ConfigurationService(new JsonConfigurationRepository(path));
    await config.load();
    const account = await config.addAccount({ label: 'Main', cookie: 'test-session-value' });
    await config.replaceAccount(account.id, { label: 'Updated', cookie: 'new-test-session' });
    await config.updateSettings({ ...config.settings, depth: 16 });
    const reloaded = new ConfigurationService(new JsonConfigurationRepository(path));
    await reloaded.load();
    expect(reloaded.accounts[0]?.cookie).toBe('lila2=new-test-session');
    expect(reloaded.settings.depth).toBe(16);
    await expect(
      reloaded.addAccount({ label: 'Duplicate', cookie: 'new-test-session' }),
    ).rejects.toThrow('already');
  });
  it('bounds saved history and deduplicates the same completed game', async () => {
    const path = await directory();
    const archive = new GameArchive(path);
    await archive.load();
    const game = archivedGame();
    await archive.save(game, 2);
    await archive.save(game, 2);
    await archive.save({ ...game, id: 'other001' }, 2);
    await archive.save({ ...game, id: 'other002' }, 2);
    const reload = await new GameArchive(path).load();
    expect(reload.map((entry) => entry.id)).toEqual(['other002', 'other001']);
    expect(await readFile(join(path, 'history.json'), 'utf8')).not.toContain('cookie');
  });
  it('refuses to silently overwrite corrupt configuration', async () => {
    const path = await directory();
    await writeFile(join(path, 'configuration.json'), '{broken');
    await expect(new JsonConfigurationRepository(path).load()).rejects.toThrow('Restore or repair');
  });
});

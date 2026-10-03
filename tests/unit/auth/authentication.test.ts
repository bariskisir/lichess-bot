import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AuthenticationService } from '../../../apps/server/src/application/auth/authentication-service.js';
import { JsonAuthenticationRepository } from '../../../apps/server/src/adapters/auth/json-authentication-repository.js';
import { ScryptPasswordHasher } from '../../../apps/server/src/adapters/auth/scrypt-password-hasher.js';

const directories: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const path of directories.splice(0)) await rm(path, { recursive: true, force: true });
});
async function fixture() {
  const path = await mkdtemp(join(tmpdir(), 'lichess-bot-auth-'));
  directories.push(path);
  const repository = new JsonAuthenticationRepository(path);
  const hasher = new ScryptPasswordHasher();
  const auth = new AuthenticationService(repository, hasher);
  await auth.load();
  return { path, repository, hasher, auth };
}

describe('persistent dashboard authentication', () => {
  it('retains the hash on restart while invalidating browser sessions and expiring them after twelve hours', async () => {
    const app = await fixture();
    const token = await app.auth.change('test-password', undefined, 'local');
    expect(app.auth.authorized(token!)).toBe(true);
    const restarted = new AuthenticationService(app.repository, app.hasher);
    await restarted.load();
    expect(restarted.status(token!)).toEqual({ passwordEnabled: true, authenticated: false });
    const newToken = await restarted.login('test-password', 'local');
    expect(restarted.authorized(newToken!)).toBe(true);
    const afterExpiry = Date.now() + 12 * 60 * 60 * 1000 + 1;
    vi.spyOn(Date, 'now').mockReturnValue(afterExpiry);
    expect(restarted.authorized(newToken!)).toBe(false);
  });
  it('fails explicitly on corrupt password data', async () => {
    const app = await fixture();
    await writeFile(join(app.path, 'dashboard-auth.json'), '{"algorithm":"plaintext"}');
    await expect(new AuthenticationService(app.repository, app.hasher).load()).rejects.toThrow(
      'Restore or repair',
    );
  });
});

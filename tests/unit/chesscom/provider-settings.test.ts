import { describe, expect, it } from 'vitest';
import {
  accountInputSchema,
  accountSecretSchema,
  settingsSchema,
  DEFAULT_SETTINGS,
} from '../../../packages/contracts/src/settings.js';

describe('provider accounts and pools', () => {
  it('keeps lichess sessions on lila2 and accepts chess.com cookie headers', () => {
    expect(
      accountInputSchema.parse({ label: 'Main', cookie: 'complete-session-value' }),
    ).toMatchObject({ provider: 'lichess', cookie: 'lila2=complete-session-value' });
    expect(
      accountInputSchema.parse({
        label: 'Chess',
        provider: 'chesscom',
        cookie: 'PHPSESSID=abc; CA=def',
      }).cookie,
    ).toBe('PHPSESSID=abc; CA=def');
    expect(
      accountInputSchema.parse({
        label: 'Chess',
        provider: 'chesscom',
        cookie: '9f8e7d6c5b4a39281706f5e4d3c2b1a0',
      }).cookie,
    ).toBe('PHPSESSID=9f8e7d6c5b4a39281706f5e4d3c2b1a0');
    expect(
      accountInputSchema.safeParse({ label: 'Chess', provider: 'chesscom', cookie: 'lila2=only' })
        .success,
    ).toBe(false);
    expect(
      accountInputSchema.safeParse({ label: 'Chess', provider: 'chesscom', cookie: 'a b' }).success,
    ).toBe(false);
  });

  it('stores the provider on secrets and separates duplicate detection by provider', () => {
    const secret = accountSecretSchema.parse({
      id: '123e4567-e89b-12d3-a456-426614174000',
      label: 'Chess',
      provider: 'chesscom',
      cookie: 'A=b; C=d',
    });
    expect(secret.provider).toBe('chesscom');
  });

  it('defaults both pool selections and migrates saved configurations', () => {
    expect(DEFAULT_SETTINGS.gameTypes).toEqual([...DEFAULT_SETTINGS.chesscomGameTypes]);
    expect(settingsSchema.safeParse({ chesscomGameTypes: ['3+2', '3+2'] }).success).toBe(false);
    expect(settingsSchema.safeParse({ chesscomGameTypes: [] }).success).toBe(false);
    const { chesscomGameTypes: _omitted, ...legacy } = DEFAULT_SETTINGS;
    expect(settingsSchema.parse(legacy).chesscomGameTypes).toEqual([...DEFAULT_SETTINGS.gameTypes]);
  });
});

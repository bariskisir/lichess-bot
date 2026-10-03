import { describe, expect, it } from 'vitest';
import {
  accountInputSchema,
  settingsSchema,
  DEFAULT_SETTINGS,
  DEFAULT_POOLS,
} from '../../../packages/contracts/src/settings.js';

describe('shared validation', () => {
  it('rejects empty engine identifiers, duplicate pools and invalid limits', () => {
    expect(settingsSchema.safeParse({ engineId: '' }).success).toBe(false);
    expect(settingsSchema.safeParse({ gameTypes: ['3+2', '3+2'] }).success).toBe(false);
    expect(settingsSchema.safeParse({ maxConcurrentGames: 0 }).success).toBe(false);
    expect(settingsSchema.safeParse({ gameTypes: [] }).success).toBe(false);
  });
  it('starts with the requested operating defaults and shorter pools selected', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({
      depth: 7,
      evaluationDepth: 15,
      maxEngines: 3,
      maxConcurrentGames: 4,
      movePolicy: 'balanced',
      randomDelayMaxMs: 1000,
      variations: 10,
      mistakeProbability: 25,
    });
    expect(DEFAULT_SETTINGS.gameTypes).toEqual([...DEFAULT_POOLS]);
    expect(DEFAULT_SETTINGS.gameTypes).toContain('5+0');
  });
  it('normalizes the session value and rejects full cookie strings and line breaks', () => {
    expect(
      accountInputSchema.parse({ label: 'Main', cookie: 'complete-session-value' }).cookie,
    ).toBe('lila2=complete-session-value');
    expect(
      accountInputSchema.safeParse({ label: 'Main', cookie: 'lila2=session; other=value' }).success,
    ).toBe(false);
    expect(
      accountInputSchema.safeParse({ label: 'Main', cookie: 'lila2=session\nheader:value' })
        .success,
    ).toBe(false);
  });
});

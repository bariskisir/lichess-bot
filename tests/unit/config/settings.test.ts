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
      engineId: 'lozza-2-local',
      depth: 7,
      evaluationDepth: 15,
      maxEngines: 3,
      maxConcurrentGames: 4,
      movePolicy: 'balanced',
      randomDelayMaxMs: 1000,
      dynamicDelay: true,
      variations: 10,
      mistakeProbability: 25,
    });
    expect(DEFAULT_SETTINGS.gameTypes).toEqual([...DEFAULT_POOLS]);
    expect(DEFAULT_SETTINGS.gameTypes).toContain('5+0');
  });
  it('migrates retired engines to Lozza 2 and preserves available selections', () => {
    for (const engineId of ['stockfish-17-lite-local', 'stockfish-18-lite-local']) {
      expect(settingsSchema.parse({ engineId }).engineId).toBe('lozza-2-local');
    }
    for (const engineId of [
      'lozza-2-local',
      'lozza-5-local',
      'stockfish-10-local',
      'stockfish-19-lite-local',
    ]) {
      expect(settingsSchema.parse({ engineId }).engineId).toBe(engineId);
    }
  });
  it('enables dynamic delay for older saved settings while preserving an explicit opt-out', () => {
    const { dynamicDelay: _dynamicDelay, ...legacy } = DEFAULT_SETTINGS;
    expect(settingsSchema.parse(legacy).dynamicDelay).toBe(true);
    expect(settingsSchema.parse({ ...legacy, dynamicDelay: false }).dynamicDelay).toBe(false);
    expect(settingsSchema.safeParse({ dynamicDelay: 'true' }).success).toBe(false);
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

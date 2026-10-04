import { expect, test } from '@playwright/test';
import pino from 'pino';
import { LozzaEngine } from '../../apps/server/src/adapters/engines/lozza/lozza-engine.js';
import { LOZZA_DISTRIBUTIONS } from '../../apps/server/src/adapters/engines/lozza/lozza-distributions.js';
import { StockfishEngine } from '../../apps/server/src/adapters/engines/stockfish/stockfish-engine.js';
import { STOCKFISH_DISTRIBUTIONS } from '../../apps/server/src/adapters/engines/stockfish/stockfish-distributions.js';
import { createDemoSnapshot } from '../../apps/server/src/adapters/demo/demo-snapshot.js';
import { browserApplication } from '../fixtures/browser-application.js';

const logger = pino({ level: 'silent' });
const engines = [
  ...LOZZA_DISTRIBUTIONS.map((distribution) => ({
    name: distribution.name,
    create: () => new LozzaEngine(logger, distribution),
  })),
  ...STOCKFISH_DISTRIBUTIONS.map((distribution) => ({
    name: distribution.name,
    create: () => new StockfishEngine(16, logger, distribution),
  })),
];

for (const definition of engines) {
  test(`${definition.name} sends real evaluation scores to the browser bar`, async ({ page }) => {
    const app = await browserApplication();
    const engine = definition.create();
    const fen = '4k3/8/8/8/8/8/q7/R3K3 w - - 0 1';
    const game = {
      ...createDemoSnapshot().games[0]!,
      fen,
      initialFen: fen,
      moves: [],
      ply: 0,
      evaluation: null,
      color: 'white' as const,
      turn: 'white' as const,
      check: false,
      lastMove: null,
      clock: null,
      activity: 'thinking' as const,
    };
    try {
      app.store.setGame(game);
      await page.goto(app.url);
      const bar = page.locator('.games-grid .evaluation__bar');
      await expect(bar).toHaveAttribute('value', '50');
      await expect(page.locator('.games-grid .evaluation')).toHaveAttribute(
        'title',
        'Waiting for engine evaluation',
      );
      const result = await engine.analyze({
        gameId: game.id,
        position: { initialFen: fen, moves: [] },
        depth: 4,
        variations: 1,
        signal: AbortSignal.timeout(20_000),
        onInfo: (variation) =>
          app.store.updateGame(game.id, {
            evaluation: {
              score: variation.score,
              mate: variation.mate,
              depth: variation.depth,
              fen,
              updatedAt: Date.now(),
            },
          }),
      });
      expect(result.bestMove).toBe('a1a2');
      await expect.poll(async () => Number(await bar.getAttribute('value'))).toBeGreaterThan(65);
      await expect(page.locator('.games-grid .evaluation')).not.toHaveClass(/evaluation--stale/);
      await expect(bar).not.toHaveAttribute('aria-label', 'White advantage: —');
    } finally {
      await engine.close();
      await app.close();
    }
  });
}

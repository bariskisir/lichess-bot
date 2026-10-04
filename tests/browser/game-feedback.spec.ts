import { expect, test } from '@playwright/test';
import { createDemoSnapshot } from '../../apps/server/src/adapters/demo/demo-snapshot.js';
import { browserApplication } from '../fixtures/browser-application.js';
import type { GameResult, GameView } from '../../packages/contracts/src/index.js';

let app: Awaited<ReturnType<typeof browserApplication>>;
test.beforeEach(async () => {
  app = await browserApplication();
});
test.afterEach(async () => {
  await app.close();
});

test('results animate on live boards for three seconds and finished boards stay static', async ({
  page,
}) => {
  const sample = createDemoSnapshot();
  for (const game of sample.games) app.store.setGame(game);
  await page.goto(app.url);
  await expect(page.locator('.games-grid .game-card')).toHaveCount(6);
  const finishedAt = Date.now();
  const results: GameView[] = [];
  for (const [index, result] of (
    ['win', 'loss', 'draw', 'aborted'] satisfies GameResult[]
  ).entries()) {
    const game = {
      ...sample.games[index]!,
      result,
      finishedAt,
      activity: 'finished' as const,
      clock: sample.games[index]!.clock ? { ...sample.games[index]!.clock!, running: false } : null,
      status: result === 'draw' ? 'draw' : result === 'aborted' ? 'aborted' : 'mate',
    };
    results.push(game);
    app.store.setGame(game);
    app.store.finishGame(game.id);
  }
  await expect(page.locator('.game-result-overlay')).toHaveCount(4);
  for (const [index, label] of ['Victory', 'Defeat', 'Draw', 'Aborted'].entries())
    await expect(
      page.getByRole('status', { name: `Game demo000${index}: ${label}`, exact: true }),
    ).toBeVisible();
  await expect(page.locator('.games-grid .game-card__inspect')).toHaveCount(2);
  expect(
    await page
      .locator('.game-result-overlay__panel')
      .first()
      .evaluate((element) => getComputedStyle(element).animationName),
  ).toBe('game-result-arrive');
  await expect(page.locator('.game-result-overlay')).toHaveCount(0, { timeout: 6000 });
  await expect(page.locator('.games-grid .game-card')).toHaveCount(2);
  await expect(page.locator('.finished-games-grid .game-card')).toHaveCount(4);
  await expect(page.locator('.finished-games-grid .game-card__inspect')).toHaveCount(0);
  const board = page.locator('.finished-games-grid .chessboard').first();
  expect(await board.evaluate((element) => getComputedStyle(element).cursor)).not.toBe('pointer');
  await board.click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Keep visual fixtures stable after verifying the real three-second transition.
  for (const game of results) app.store.setGame({ ...game, finishedAt: Date.now() });
  await expect(page.locator('.game-result-overlay')).toHaveCount(4);
  if ((await page.locator('html').getAttribute('data-theme')) !== 'dark')
    await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await page.screenshot({ path: 'test-results/game-results-dark-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  const victory = page
    .locator('.game-card')
    .filter({ has: page.locator('.game-result-overlay--win') });
  await victory.screenshot({ path: 'test-results/game-results-light-mobile.png' });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(
    await page
      .locator('.game-result-overlay__panel')
      .first()
      .evaluate((element) => getComputedStyle(element).animationName),
  ).toBe('none');
});

test('delay countdown uses one decimal and updates without a new server snapshot', async ({
  page,
}) => {
  const game = createDemoSnapshot().games[0]!;
  app.store.setGame(game);
  await page.goto(app.url);
  await expect(page.locator('.games-grid .game-card')).toHaveCount(1);
  app.store.updateGame(game.id, { activity: 'delaying', delayUntil: Date.now() + 3000 });
  const countdown = page.locator('.game-state__countdown');
  await expect(countdown).toHaveText(/^\d+\.\ds$/);
  const first = parseFloat((await countdown.textContent())!);
  await expect
    .poll(async () => parseFloat((await countdown.textContent())!))
    .toBeLessThan(first - 0.1);
  app.store.updateGame(game.id, { activity: 'waiting', delayUntil: null });
  await expect(countdown).toHaveCount(0);
  await expect(page.locator('.game-state')).toHaveText('Waiting');
});

test('history reset supports cancel, reports failures and clears persisted games', async ({
  page,
}) => {
  const sample = createDemoSnapshot();
  for (const game of sample.history) await app.archive.save(game, 200);
  app.store.restoreHistory(await app.archive.load());
  app.store.setGame(sample.games[0]!);
  app.store.setRuntime({ wins: 2, completed: 3, active: 1 });
  await page.goto(`${app.url}/#history`);
  await expect(page.locator('.finished-games-grid .game-card')).toHaveCount(3);
  await page.getByRole('button', { name: 'Clear history', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('.finished-games-grid .game-card')).toHaveCount(3);
  await page.route('**/api/history', (route) =>
    route.fulfill({ status: 500, json: { error: 'History could not be cleared. Try again.' } }),
  );
  await page.getByRole('button', { name: 'Clear history', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm clear', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('History could not be cleared. Try again.');
  await expect(page.locator('.finished-games-grid .game-card')).toHaveCount(3);
  await page.unroute('**/api/history');
  await page.getByRole('button', { name: 'Confirm clear', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Completed games appear here' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Clear history', exact: true })).toBeDisabled();
  expect(await app.archive.load()).toEqual([]);
  expect(app.store.snapshot().games).toHaveLength(1);
  expect(app.store.snapshot().runtime).toMatchObject({ wins: 2, completed: 3, active: 1 });
  await page.reload();
  await expect(page.locator('.finished-games-grid .game-card')).toHaveCount(0);
});

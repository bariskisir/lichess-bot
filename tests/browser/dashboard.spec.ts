import { expect, test } from '@playwright/test';

test('a new workspace explains setup and saves a theme across reloads', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Connect an account to start playing' }),
  ).toBeVisible();
  const current = await page.locator('html').getAttribute('data-theme');
  const railColor = await page
    .locator('.sidebar')
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  await page.getByRole('button', { name: /Switch to .* theme/ }).click();
  await expect(page.locator('html')).toHaveAttribute(
    'data-theme',
    current === 'dark' ? 'light' : 'dark',
  );
  await expect
    .poll(() =>
      page.locator('.sidebar').evaluate((element) => getComputedStyle(element).backgroundColor),
    )
    .not.toBe(railColor);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute(
    'data-theme',
    current === 'dark' ? 'light' : 'dark',
  );
});

test('expanded games contain complete boards, exclude history and never scroll horizontally', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Preview dashboard' }).click();
  await expect(page.locator('.games-grid .game-card')).toHaveCount(6);
  await expect(page.locator('.finished-games-grid .game-card')).toHaveCount(3);
  await expect(page.getByLabel('Search live games')).toHaveCount(0);
  await expect(page.getByLabel('Filter by account')).toHaveCount(0);
  await expect(page.locator('.workspace-header')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Flip board' })).toHaveCount(0);
  await expect(page.getByText('Review', { exact: true })).toHaveCount(0);
  const boardSizes = await page.evaluate(() => ({
    live: document.querySelector('.games-grid .chessboard')!.getBoundingClientRect().width,
    finished: document.querySelector('.finished-games-grid .chessboard')!.getBoundingClientRect()
      .width,
  }));
  expect(boardSizes.finished).toBeLessThan(boardSizes.live);
  await expect(page.getByRole('heading', { name: 'Recently finished' })).toBeVisible();
  await page.getByRole('button', { name: 'Expand', exact: true }).click();
  await expect(page.locator('.game-card')).toHaveCount(6);
  await expect(page.getByRole('heading', { name: 'Recently finished' })).toHaveCount(0);
  await expect(page.locator('.sidebar')).toHaveCount(0);
  expect((await page.locator('.games-grid .game-card').first().boundingBox())!.y).toBeLessThan(20);
  await expect(page.locator('.games-workspace__exit')).toHaveText('Live games');
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const fits = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.game-card')];
      return (
        document.documentElement.scrollWidth <= innerWidth &&
        cards.every((card) => {
          const bounds = card.getBoundingClientRect();
          const board = card.querySelector('.chessboard')!.getBoundingClientRect();
          const evaluation = card.querySelector('.evaluation')!.getBoundingClientRect();
          const squares = [...card.querySelectorAll('.chessboard__square')];
          return (
            bounds.left >= 0 &&
            bounds.right <= innerWidth + 1 &&
            Math.abs(board.width - board.height) < 1 &&
            evaluation.right <= board.left &&
            Math.abs(evaluation.height - board.height) < 1 &&
            squares.length === 64 &&
            squares.every((square) => {
              const cell = square.getBoundingClientRect();
              return (
                cell.bottom <= board.bottom + 1 &&
                cell.right <= board.right + 1 &&
                Math.abs(cell.width - cell.height) < 1
              );
            })
          );
        })
      );
    });
    expect(fits, `expanded view at ${width}px`).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Expand', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('game review navigates legal history and exports a PGN', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Preview dashboard' }).click();
  await page.getByRole('button', { name: 'Inspect game demo0000' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Starting position', exact: true }).click();
  await expect(page.locator('.game-inspector__navigation')).toContainText('0 / 15');
  await page.getByRole('button', { name: 'Latest position' }).click();
  await expect(page.locator('.game-inspector__navigation')).toContainText('15 / 15');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PGN' }).click();
  expect((await download).suggestedFilename()).toBe('demo0000.pgn');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('mobile navigation reaches engine selection and preview stays read-only', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Preview dashboard' }).click();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  const current = await page.locator('html').getAttribute('data-theme');
  await page.getByRole('button', { name: /Switch to .* theme/ }).click();
  await expect(page.locator('html')).toHaveAttribute(
    'data-theme',
    current === 'dark' ? 'light' : 'dark',
  );
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page.locator('.engine-identity__details strong')).toHaveText('Lozza 2 · 2554');
  await expect(page.getByRole('button', { name: 'Engine', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Save settings' })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('history displays smaller complete boards, filters results and links public game IDs', async ({
  page,
}) => {
  await page.route('**/api/demo', async (route) => {
    const response = await route.fetch();
    const snapshot = await response.json();
    snapshot.games[0].id = 'AbC123XY';
    await route.fulfill({ json: snapshot });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Preview dashboard' }).click();
  await expect(page.getByRole('link', { name: 'Open game AbC123XY on Lichess' })).toHaveAttribute(
    'href',
    'https://lichess.org/AbC123XY',
  );
  await page.getByRole('button', { name: 'View history', exact: true }).click();
  await expect(page.locator('.finished-games-grid .game-card')).toHaveCount(3);
  await expect(page.locator('.finished-games-grid .chessboard__square')).toHaveCount(192);
  await expect(page.locator('.history-list')).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Game result', exact: true }).selectOption('win');
  await expect(page.locator('.finished-games-grid .game-card')).toHaveCount(1);
  await expect(page.locator('.finished-games-grid .game-card__inspect')).toHaveCount(0);
  await page.locator('.finished-games-grid .chessboard').first().click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Game result', exact: true }).selectOption('all');
  await page.getByLabel('Search game history', { exact: true }).fill('no-such-player');
  await expect(page.getByRole('heading', { name: 'No games match this filter' })).toBeVisible();
  await page.getByLabel('Search game history', { exact: true }).fill('');
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(() => {
        const boards = [...document.querySelectorAll('.finished-games-grid .chessboard')];
        return (
          document.documentElement.scrollWidth <= innerWidth &&
          boards.every((board) => {
            const bounds = board.getBoundingClientRect();
            return Math.abs(bounds.width - bounds.height) < 1 && bounds.right <= innerWidth + 1;
          })
        );
      }),
      `history grid at ${width}px`,
    ).toBe(true);
  }
});

test('settings expose the requested defaults and dashboard passwords can be set, used and removed', async ({
  page,
  request,
}) => {
  const password = 'test-dashboard-password';
  try {
    await page.goto('/#settings');
    await expect(page.getByLabel('Search depth', { exact: true })).toHaveValue('7');
    await expect(page.getByLabel('Evaluation depth', { exact: true })).toHaveValue('15');
    await expect(page.getByLabel('Engine workers', { exact: true })).toHaveValue('3');
    await expect(page.getByLabel('Candidate variations', { exact: true })).toHaveValue('10');
    await expect(page.locator('.pool-selector input:checked')).toHaveCount(6);
    await expect(page.getByLabel('Lichess request attempts', { exact: true })).toHaveValue('3');
    await expect(page.getByLabel('Retry interval (ms)', { exact: true })).toHaveValue('1000');
    const engine = page.getByRole('button', { name: 'Engine', exact: true });
    await engine.click();
    await expect(
      page.getByRole('listbox', { name: 'Chess engines' }).getByRole('option'),
    ).toHaveCount(4);
    await page.getByRole('option', { name: 'Lozza 5 · 3071', exact: true }).click();
    await expect(page.locator('.engine-identity__details strong')).toHaveText('Lozza 5 · 3071');
    await engine.click();
    await page.getByRole('option', { name: 'Lozza 2 · 2554', exact: true }).click();
    await expect(page.getByLabel('User-Agent', { exact: true })).not.toHaveValue(/lichess-bot/);
    await expect(page.getByText('No password is set.', { exact: false })).toBeVisible();
    await page.getByLabel('Dashboard password', { exact: true }).fill(password);
    await page.getByLabel('Confirm new password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Set password', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Open your workspace' })).toBeVisible();
    await page.getByLabel('Password', { exact: true }).fill('incorrect-password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Incorrect password');
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Dashboard access', exact: true }),
    ).toBeVisible();
    await page.getByLabel('Current password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Remove password', exact: true }).click();
    await expect(page.getByText('Password removed.', { exact: false })).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Dashboard access', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toHaveCount(0);
  } finally {
    const login = await request.post('/api/auth/login', {
      headers: { 'X-Lichess-Bot': 'dashboard' },
      data: { password },
    });
    if (login.ok())
      await request.put('/api/auth/password', {
        headers: { 'X-Lichess-Bot': 'dashboard' },
        data: { password: null, currentPassword: password },
      });
  }
});

test('the engine selector orders reference ratings and persists every available engine', async ({
  page,
  request,
}) => {
  const configuration = await (await request.get('/api/configuration')).json();
  const headers = { 'X-Lichess-Bot': 'dashboard' };
  const engines = [
    { id: 'lozza-2-local', name: 'Lozza 2', elo: 2554 },
    { id: 'lozza-5-local', name: 'Lozza 5', elo: 3071 },
    { id: 'stockfish-10-local', name: 'Stockfish 10', elo: 3447 },
    { id: 'stockfish-19-lite-local', name: 'Stockfish 19 Lite', elo: 3792 },
  ];
  expect(configuration.engines).toEqual(engines);
  try {
    await page.goto('/#settings');
    const trigger = page.getByRole('button', { name: 'Engine', exact: true });
    const selected = page.locator('.engine-identity__details strong');
    for (const engine of engines) {
      await trigger.click();
      const options = page.getByRole('listbox', { name: 'Chess engines' }).getByRole('option');
      await expect(options).toHaveText(engines.map((option) => `${option.name} · ${option.elo}`));
      const label = `${engine.name} · ${engine.elo}`;
      await page.getByRole('option', { name: label, exact: true }).click();
      await expect(selected).toHaveText(label);
      const save = page.getByRole('button', { name: 'Save settings', exact: true });
      if (await save.isEnabled()) {
        await save.click();
        await expect(page.getByText('Settings saved', { exact: true })).toBeVisible();
      }
      await page.reload();
      await expect(selected).toHaveText(label);
      expect((await (await request.get('/api/configuration')).json()).settings.engineId).toBe(
        engine.id,
      );
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(selected).toHaveText('Stockfish 19 Lite · 3792');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  } finally {
    expect(
      (await request.put('/api/settings', { headers, data: configuration.settings })).ok(),
    ).toBe(true);
  }
});

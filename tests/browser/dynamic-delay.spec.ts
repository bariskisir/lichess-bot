import { expect, test } from '@playwright/test';

test('dynamic delay disables the manual maximum and persists either timing mode', async ({
  page,
  request,
}) => {
  const configuration = await (await request.get('/api/configuration')).json();
  const headers = { 'X-Lichess-Bot': 'dashboard' };
  try {
    await page.goto('/#settings');
    const dynamic = page.getByRole('switch', { name: 'Dynamic delay' });
    const maximum = page.getByLabel('Maximum delay (ms)', { exact: true });
    await expect(dynamic).toBeChecked();
    await expect(maximum).toBeDisabled();
    await expect(
      page.getByText('Ignored while Dynamic delay is on.', { exact: true }),
    ).toBeVisible();
    await dynamic.uncheck();
    await expect(maximum).toBeEnabled();
    await maximum.fill('2500');
    await page.getByRole('button', { name: 'Save settings', exact: true }).click();
    await expect(page.getByText('Settings saved', { exact: true })).toBeVisible();
    await page.reload();
    await expect(dynamic).not.toBeChecked();
    await expect(maximum).toBeEnabled();
    await expect(maximum).toHaveValue('2500');
    await dynamic.check();
    await expect(maximum).toBeDisabled();
    await page.getByRole('button', { name: 'Save settings', exact: true }).click();
    await expect(page.getByText('Settings saved', { exact: true })).toBeVisible();
    await page.reload();
    await expect(dynamic).toBeChecked();
    await expect(maximum).toBeDisabled();
    await expect(maximum).toHaveValue('2500');
    const saved = await (await request.get('/api/configuration')).json();
    expect(saved.settings).toMatchObject({ dynamicDelay: true, randomDelayMaxMs: 2500 });

    for (const theme of ['dark', 'light']) {
      if ((await page.locator('html').getAttribute('data-theme')) !== theme)
        await page.getByRole('button', { name: `Switch to ${theme} theme` }).click();
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 1000 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        await expect(dynamic).toBeVisible();
        await expect(maximum).toBeDisabled();
        const behavior = page
          .locator('.settings-section')
          .filter({ has: page.getByRole('heading', { name: 'Move behavior', exact: true }) });
        await behavior.evaluate((element) => element.scrollIntoView({ block: 'start' }));
        await page.screenshot({
          path: `test-results/dynamic-delay-${theme}-${width}.png`,
          fullPage: false,
        });
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
  } finally {
    const response = await request.put('/api/settings', { headers, data: configuration.settings });
    expect(response.ok()).toBe(true);
  }
});

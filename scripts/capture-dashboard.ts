import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const directory = '.impeccable/review';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'reduce',
  });
  async function capture(name: string, viewport = false): Promise<void> {
    await page.waitForTimeout(150);
    await page.evaluate(async () => {
      window.scrollTo(0, 0);
      await document.fonts.ready;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    await page.screenshot({
      path: `${directory}/${name}.png`,
      fullPage: !viewport,
      animations: 'disabled',
    });
  }
  await page.addInitScript(() => {
    if (!localStorage.getItem('lichess-bot-theme'))
      localStorage.setItem('lichess-bot-theme', 'dark');
  });
  await page.goto('http://127.0.0.1:4184');
  await page.getByRole('button', { name: 'Preview dashboard' }).click();
  await page.locator('.game-card').first().waitFor();
  await capture('desktop');
  await capture('desktop-viewport', true);
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Preview dashboard' }).click();
  await page.locator('.games-grid .game-card').first().waitFor();
  await capture('desktop-light');
  await capture('desktop-light-viewport', true);
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await page.getByRole('button', { name: 'Expand', exact: true }).click();
  await capture('expanded');
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  await capture('mobile');
  await capture('mobile-viewport', true);
  await page.getByRole('button', { name: 'View history', exact: true }).click();
  await capture('mobile-history');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await capture('desktop-history');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await capture('mobile-settings');
  await page.getByRole('button', { name: 'Return to workspace' }).click();
  await capture('mobile-security');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await capture('desktop-settings');
  await capture('desktop-settings-viewport', true);
  await page.route('**/api/auth/status', (route) =>
    route.fulfill({ json: { passwordEnabled: true, authenticated: false } }),
  );
  await page.reload();
  await page.getByRole('heading', { name: 'Open your workspace' }).waitFor();
  await capture('desktop-login');
  await page.setViewportSize({ width: 390, height: 844 });
  await capture('mobile-login');
} finally {
  await browser.close();
}

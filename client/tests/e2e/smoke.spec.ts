import { test, expect } from '@playwright/test';

test('app loads', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/AskFin/i);
  await page.screenshot({ path: 'tests/e2e/screenshots/home.png', fullPage: true });
});

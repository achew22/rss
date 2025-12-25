/**
 * Responsive Design E2E Tests
 *
 * Tests responsive design and mobile functionality:
 * - Mobile layout
 * - Hamburger menu
 */

import { test, expect } from '@playwright/test';
import {
  setupTestEnvironment,
  teardownTestEnvironment,
  resetBetweenTests,
} from './setup.js';
import { getWorkerUrl } from './test-helper.js';

test.describe('Responsive Design', () => {
  test.beforeAll(async () => {
    await setupTestEnvironment();
  });

  test.afterAll(async () => {
    await teardownTestEnvironment();
  });

  test.beforeEach(async () => {
    await resetBetweenTests();
  });

  test('06 - mobile layout', async ({ page }) => {
    const workerUrl = getWorkerUrl();
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(workerUrl, { waitUntil: 'networkidle', timeout: 30000 });

    await page.screenshot({
      path: 'e2e/screenshots/05-mobile.png',
      fullPage: true,
    });
    console.log('Screenshot: 05-mobile.png');

    // Try to open hamburger menu
    const hamburger = page.locator('.hamburger-btn');
    if (await hamburger.count() > 0) {
      await hamburger.click();
      await page.waitForTimeout(300);
      await page.screenshot({
        path: 'e2e/screenshots/06-mobile-menu.png',
        fullPage: true,
      });
      console.log('Screenshot: 06-mobile-menu.png');
    }
  });
});

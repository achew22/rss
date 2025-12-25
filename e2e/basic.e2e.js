/**
 * Basic Functionality E2E Tests
 *
 * Tests core application functionality:
 * - Homepage loading
 * - API health checks
 */

import { test, expect } from '@playwright/test';
import {
  setupTestEnvironment,
  teardownTestEnvironment,
  resetBetweenTests,
} from './setup.js';
import { getWorkerUrl } from './test-helper.js';

test.describe('Basic Functionality', () => {
  test.beforeAll(async () => {
    await setupTestEnvironment();
  });

  test.afterAll(async () => {
    await teardownTestEnvironment();
  });

  test.beforeEach(async () => {
    await resetBetweenTests();
  });

  test('01 - homepage loads correctly', async ({ page }) => {
    const workerUrl = getWorkerUrl();
    console.log(`Navigating to ${workerUrl}`);
    await page.goto(workerUrl, { waitUntil: 'networkidle', timeout: 30000 });

    // Check for the h1 element
    const h1 = page.locator('h1');
    await expect(h1).toBeVisible({ timeout: 10000 });

    // Take screenshot
    await page.screenshot({
      path: 'e2e/screenshots/01-homepage.png',
      fullPage: true,
    });
    console.log('Screenshot: 01-homepage.png');

    // Verify basic elements
    await expect(page.locator('nav')).toBeVisible();
    await expect(page.locator('.sidebar')).toBeVisible();
  });

  test('02 - API health check works', async ({ page }) => {
    const workerUrl = getWorkerUrl();
    const response = await page.request.get(`${workerUrl}/api/health`);
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.status).toBe('ok');
    console.log('Health check passed');
  });
});

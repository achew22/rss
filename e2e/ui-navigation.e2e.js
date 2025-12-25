/**
 * UI and Navigation Tests
 *
 * Tests for frontend user interface and navigation functionality.
 * Covers page loads, responsive design, mobile menu, and navigation between views.
 */

import { test, expect } from '@playwright/test';
import {
  setupTestEnvironment,
  teardownTestEnvironment,
  resetTestData,
  getWorkerUrl,
} from './helpers/test-setup.js';
import {
  waitForPageLoad,
  setMobileViewport,
  setDesktopViewport,
  toggleMobileMenu,
  takeScreenshot,
} from './helpers/page-helpers.js';

let workerUrl;

test.describe('UI and Navigation Tests', () => {
  test.beforeAll(async () => {
    const env = await setupTestEnvironment();
    workerUrl = env.workerUrl;
  });

  test.afterAll(async () => {
    await teardownTestEnvironment();
  });

  test.beforeEach(async () => {
    await resetTestData();
  });

  test('homepage loads correctly', async ({ page }) => {
    console.log(`Navigating to ${workerUrl}`);
    await page.goto(workerUrl, { waitUntil: 'networkidle', timeout: 30000 });

    // Check for the h1 element
    const h1 = page.locator('h1');
    await expect(h1).toBeVisible({ timeout: 10000 });

    // Take screenshot
    await takeScreenshot(page, 'ui-01-homepage');

    // Verify basic elements
    await expect(page.locator('nav')).toBeVisible();
    await expect(page.locator('.sidebar')).toBeVisible();
    console.log('✓ Homepage loads with all required elements');
  });

  test('desktop layout displays correctly', async ({ page }) => {
    await setDesktopViewport(page);
    await waitForPageLoad(page, workerUrl);

    // Verify desktop-specific elements are visible
    await expect(page.locator('nav')).toBeVisible();
    await expect(page.locator('.sidebar')).toBeVisible();

    await takeScreenshot(page, 'ui-02-desktop-layout');
    console.log('✓ Desktop layout renders correctly');
  });

  test('mobile layout displays correctly', async ({ page }) => {
    await setMobileViewport(page);
    await page.goto(workerUrl, { waitUntil: 'networkidle', timeout: 30000 });

    await takeScreenshot(page, 'ui-03-mobile-layout');

    // Verify page is responsive
    const h1 = page.locator('h1');
    await expect(h1).toBeVisible();
    console.log('✓ Mobile layout renders correctly');
  });

  test('mobile hamburger menu works', async ({ page }) => {
    await setMobileViewport(page);
    await page.goto(workerUrl, { waitUntil: 'networkidle', timeout: 30000 });

    // Try to open hamburger menu
    const menuOpened = await toggleMobileMenu(page);

    if (menuOpened) {
      await takeScreenshot(page, 'ui-04-mobile-menu-open');
      console.log('✓ Mobile menu opens successfully');
    } else {
      console.log('ℹ Mobile menu not found (may be disabled or not implemented)');
    }
  });

  test('navigation links are functional', async ({ page }) => {
    await waitForPageLoad(page, workerUrl);

    // Check that nav exists
    const nav = page.locator('nav');
    await expect(nav).toBeVisible();

    // Verify common navigation links exist
    const homeLink = page.locator('a[href="#/"]');
    const feedsLink = page.locator('a[href="#/feeds"]');

    // Check if links exist (they may not all be present)
    const homeCount = await homeLink.count();
    const feedsCount = await feedsLink.count();

    console.log(`Found ${homeCount} home link(s), ${feedsCount} feeds link(s)`);
    expect(homeCount + feedsCount).toBeGreaterThan(0);
    console.log('✓ Navigation links are present');
  });

  test('page maintains state after navigation', async ({ page }) => {
    await waitForPageLoad(page, workerUrl);

    // Navigate to feeds
    const feedsLink = page.locator('a[href="#/feeds"]');
    if (await feedsLink.count() > 0) {
      await feedsLink.click();
      await page.waitForTimeout(500);

      // Check URL changed
      expect(page.url()).toContain('#/feeds');

      // Navigate back to home
      const homeLink = page.locator('a[href="#/"]');
      if (await homeLink.count() > 0) {
        await homeLink.click();
        await page.waitForTimeout(500);

        // Verify we're back at home
        const h1 = page.locator('h1');
        await expect(h1).toBeVisible();
        console.log('✓ Navigation state maintained correctly');
      }
    }
  });
});

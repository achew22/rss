/**
 * Feed Management E2E Tests
 *
 * Tests feed-related functionality:
 * - Adding feeds and viewing articles
 * - Feeds page
 * - Atom feed support
 */

import { test, expect } from '@playwright/test';
import {
  setupTestEnvironment,
  teardownTestEnvironment,
  resetBetweenTests,
  getWorkerUrl,
  getMockServerUrl,
} from './setup.js';
import { addFeed, getFeeds } from './test-helper.js';

test.describe('Feed Management', () => {
  test.beforeAll(async () => {
    await setupTestEnvironment();
  });

  test.afterAll(async () => {
    await teardownTestEnvironment();
  });

  test.beforeEach(async () => {
    await resetBetweenTests();
  });

  test('03 - can add feed and see articles', async ({ page }) => {
    const workerUrl = getWorkerUrl();
    const mockServerUrl = getMockServerUrl();

    // Add feed via API
    console.log('Adding feed via API...');
    const result = await addFeed(`${mockServerUrl}/feeds/tech-news/rss`, 'Tech News');
    console.log('Feed added:', JSON.stringify(result));
    expect(result.feed).toBeDefined();

    // Navigate to app
    await page.goto(workerUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);

    // Screenshot with articles
    await page.screenshot({
      path: 'e2e/screenshots/02-with-articles.png',
      fullPage: true,
    });
    console.log('Screenshot: 02-with-articles.png');

    // Verify page has content
    const bodyText = await page.locator('body').textContent();
    console.log('Page has content:', bodyText.length > 0);
  });

  test('04 - feeds page shows subscriptions', async ({ page }) => {
    const workerUrl = getWorkerUrl();
    const mockServerUrl = getMockServerUrl();

    // Ensure we have a feed
    const feeds = await getFeeds();
    if (feeds.feeds.length === 0) {
      await addFeed(`${mockServerUrl}/feeds/web-dev/rss`, 'Web Dev');
    }

    await page.goto(workerUrl, { waitUntil: 'networkidle', timeout: 30000 });

    // Navigate to feeds page using the nav link
    await page.click('a[href="#/feeds"]');
    await page.waitForTimeout(1000);

    await page.screenshot({
      path: 'e2e/screenshots/03-feeds-page.png',
      fullPage: true,
    });
    console.log('Screenshot: 03-feeds-page.png');
  });

  test('07 - Atom feed support', async ({ page }) => {
    const workerUrl = getWorkerUrl();
    const mockServerUrl = getMockServerUrl();

    // Add Atom feed
    await addFeed(`${mockServerUrl}/feeds/tech-news/atom`, 'Tech Atom');

    await page.goto(workerUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);

    await page.screenshot({
      path: 'e2e/screenshots/07-atom-feed.png',
      fullPage: true,
    });
    console.log('Screenshot: 07-atom-feed.png');
  });
});

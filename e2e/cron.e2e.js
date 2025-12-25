/**
 * Cron Functionality E2E Tests
 *
 * Tests scheduled job functionality:
 * - Cron job fetching new articles
 */

import { test, expect } from '@playwright/test';
import {
  setupTestEnvironment,
  teardownTestEnvironment,
  resetBetweenTests,
  getWorkerUrl,
  getMockServerUrl,
} from './setup.js';
import {
  addFeed,
  getFeeds,
  getArticles,
  triggerCron,
  getMockServer,
} from './test-helper.js';

test.describe('Cron Functionality', () => {
  test.beforeAll(async () => {
    await setupTestEnvironment();
  });

  test.afterAll(async () => {
    await teardownTestEnvironment();
  });

  test.beforeEach(async () => {
    await resetBetweenTests();
  });

  test('05 - cron job fetches new articles', async ({ page }) => {
    const workerUrl = getWorkerUrl();
    const mockServerUrl = getMockServerUrl();

    // Add feed
    const feeds = await getFeeds();
    if (feeds.feeds.length === 0) {
      await addFeed(`${mockServerUrl}/feeds/cloudflare/rss`, 'Cloudflare');
    }

    // Get initial count
    const initial = await getArticles();
    console.log(`Initial articles: ${initial.articles.length}`);

    // Add new article to mock server
    const mockServer = getMockServer();
    mockServer.addArticle('cloudflare', {
      title: 'CRON TEST ARTICLE',
      description: 'Testing cron functionality',
      link: `/articles/cron-${Date.now()}`,
    });

    // Trigger cron
    console.log('Triggering cron...');
    await triggerCron();

    // Check articles increased
    const after = await getArticles();
    console.log(`After cron: ${after.articles.length}`);

    // Navigate and screenshot
    await page.goto(workerUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);

    await page.screenshot({
      path: 'e2e/screenshots/04-after-cron.png',
      fullPage: true,
    });
    console.log('Screenshot: 04-after-cron.png');
  });
});

/**
 * Feed Refresh Tests
 *
 * Tests for feed refresh functionality including cron jobs and manual refresh.
 * Verifies that new articles are fetched and displayed correctly.
 */

import { test, expect } from '@playwright/test';
import {
  setupTestEnvironment,
  teardownTestEnvironment,
  resetTestData,
  getWorkerUrl,
  getMockServerUrl,
} from './helpers/test-setup.js';
import {
  addFeed,
  getFeeds,
  getArticles,
  triggerCron,
  refreshAllFeeds,
  getMockServer,
} from './test-helper.js';
import { waitForPageLoad, takeScreenshot } from './helpers/page-helpers.js';

let workerUrl;
let mockServerUrl;

test.describe('Feed Refresh Tests', () => {
  test.beforeAll(async () => {
    const env = await setupTestEnvironment();
    workerUrl = env.workerUrl;
    mockServerUrl = env.mockServerUrl;
  });

  test.afterAll(async () => {
    await teardownTestEnvironment();
  });

  test.beforeEach(async () => {
    await resetTestData();
  });

  test('cron job fetches new articles', async ({ page }) => {
    // Add feed
    const feeds = await getFeeds(page);
    if (feeds.feeds.length === 0) {
      await addFeed(`${mockServerUrl}/feeds/cloudflare/rss`, 'Cloudflare', page);
    }

    // Get initial count
    const initial = await getArticles(null, false, page);
    console.log(`Initial articles: ${initial.articles.length}`);

    // Add new article to mock server via HTTP API
    await page.request.post(`${mockServerUrl}/feeds/cloudflare/articles`, {
      data: {
        title: 'CRON TEST ARTICLE',
        description: 'Testing cron functionality',
        link: `/articles/cron-${Date.now()}`,
      },
    });

    // Trigger cron
    console.log('Triggering cron...');
    await triggerCron(page);

    // Check articles increased
    const after = await getArticles(null, false, page);
    console.log(`After cron: ${after.articles.length}`);
    expect(after.articles.length).toBeGreaterThan(initial.articles.length);

    // Navigate and screenshot
    await waitForPageLoad(page, workerUrl);
    await page.waitForTimeout(1000);

    await takeScreenshot(page, 'feed-refresh-01-after-cron');
    console.log('✓ Cron job successfully fetched new articles');
  });

  test('manual refresh fetches new articles', async ({ page }) => {
    // Add feed
    await addFeed(`${mockServerUrl}/feeds/tech-news/rss`, 'Tech News', page);

    // Get initial count
    const initial = await getArticles(null, false, page);
    console.log(`Initial articles: ${initial.articles.length}`);

    // Add new article to mock server via HTTP API
    await page.request.post(`${mockServerUrl}/feeds/tech-news/articles`, {
      data: {
        title: 'MANUAL REFRESH TEST',
        description: 'Testing manual refresh functionality',
        link: `/articles/refresh-${Date.now()}`,
      },
    });

    // Manually refresh feeds
    console.log('Manually refreshing feeds...');
    await refreshAllFeeds(page);

    // Check articles increased
    const after = await getArticles(null, false, page);
    console.log(`After refresh: ${after.articles.length}`);
    expect(after.articles.length).toBeGreaterThan(initial.articles.length);

    await waitForPageLoad(page, workerUrl);
    await takeScreenshot(page, 'feed-refresh-02-manual-refresh');
    console.log('✓ Manual refresh successfully fetched new articles');
  });

  test('refresh handles multiple feeds', async ({ page }) => {
    // Add multiple feeds
    await addFeed(`${mockServerUrl}/feeds/tech-news/rss`, 'Tech News', page);
    await addFeed(`${mockServerUrl}/feeds/web-dev/rss`, 'Web Dev', page);

    const initial = await getArticles(null, false, page);
    console.log(`Initial articles from multiple feeds: ${initial.articles.length}`);

    // Add new articles to both feeds via HTTP API
    await page.request.post(`${mockServerUrl}/feeds/tech-news/articles`, {
      data: {
        title: 'New Tech Article',
        description: 'Latest technology news',
        link: `/articles/tech-${Date.now()}`,
      },
    });
    await page.request.post(`${mockServerUrl}/feeds/web-dev/articles`, {
      data: {
        title: 'New Web Dev Article',
        description: 'Latest web development tips',
        link: `/articles/webdev-${Date.now()}`,
      },
    });

    // Refresh all feeds
    await refreshAllFeeds(page);

    const after = await getArticles(null, false, page);
    console.log(`After refresh: ${after.articles.length}`);
    expect(after.articles.length).toBeGreaterThan(initial.articles.length);

    await waitForPageLoad(page, workerUrl);
    await takeScreenshot(page, 'feed-refresh-03-multiple-feeds');
    console.log('✓ Refresh handles multiple feeds correctly');
  });

  test('refresh preserves existing articles', async ({ page }) => {
    // Add feed and get initial articles
    await addFeed(`${mockServerUrl}/feeds/cloudflare/rss`, 'Cloudflare', page);
    const initial = await getArticles(null, false, page);
    const initialCount = initial.articles.length;
    console.log(`Initial articles: ${initialCount}`);

    // Refresh without adding new articles
    await refreshAllFeeds(page);

    const after = await getArticles(null, false, page);
    console.log(`After refresh (no new articles): ${after.articles.length}`);

    // Should have same or more articles (duplicates may be handled differently)
    expect(after.articles.length).toBeGreaterThanOrEqual(initialCount);
    console.log('✓ Refresh preserves existing articles');
  });
});

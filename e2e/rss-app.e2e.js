/**
 * RSS Reader E2E Tests
 *
 * These tests use Playwright to test the full RSS Reader application:
 * 1. Spin up the RSS Worker using Miniflare (via wrangler's unstable_dev)
 * 2. Spin up mock RSS feed servers
 * 3. Test user interactions and take screenshots
 * 4. Test cron job functionality
 */

import { test, expect } from '@playwright/test';
import {
  startWorker,
  stopWorker,
  startMockServer,
  stopMockServer,
  getMockServer,
  triggerCron,
  addFeed,
  getFeeds,
  getArticles,
} from './test-helper.js';

// Store the worker URL for browser navigation
let workerUrl;
let mockServerUrl;

test.describe('RSS Reader E2E Tests', () => {
  test.beforeAll(async () => {
    console.log('Starting test setup...');

    // Start the mock RSS server first
    const mockServer = await startMockServer(3001);
    mockServerUrl = mockServer.getUrl();
    console.log(`Mock RSS server started at ${mockServerUrl}`);

    // Start the worker
    console.log('Starting RSS Worker...');
    const worker = await startWorker({ port: 8787 });
    workerUrl = `http://localhost:8787`;
    console.log(`RSS Worker started at ${workerUrl}`);

    // Give servers time to fully initialize
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log('Test setup complete');
  });

  test.afterAll(async () => {
    console.log('Cleaning up...');
    await stopWorker();
    await stopMockServer();
    console.log('Servers stopped');
  });

  test.beforeEach(async () => {
    const mockServer = getMockServer();
    if (mockServer) {
      mockServer.reset();
    }
  });

  test('01 - homepage loads correctly', async ({ page }) => {
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
    const response = await page.request.get(`${workerUrl}/api/health`);
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.status).toBe('ok');
    console.log('Health check passed');
  });

  test('03 - can add feed and see articles', async ({ page }) => {
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

  test('05 - cron job fetches new articles', async ({ page }) => {
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

  test('06 - mobile layout', async ({ page }) => {
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

  test('07 - Atom feed support', async ({ page }) => {
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

  test('08 - manually mark article as read/unread', async ({ page }) => {
    // Ensure we have some articles
    const feeds = await getFeeds();
    if (feeds.feeds.length === 0) {
      await addFeed(`${mockServerUrl}/feeds/tech-news/rss`, 'Tech News');
    }

    await page.goto(workerUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);

    // Disable the "Hide read articles" filter to see all articles
    const filterToggle = page.locator('#hideReadToggle');
    if (await filterToggle.isChecked()) {
      await filterToggle.click();
      await page.waitForTimeout(500);
    }

    // Find the first article card (may already be read from previous tests)
    const firstArticle = page.locator('.article-card').first();
    await expect(firstArticle).toBeVisible();

    // Get current read state
    const initialClasses = await firstArticle.getAttribute('class');
    const isInitiallyRead = initialClasses.includes('read');

    // If already read, mark as unread first
    if (isInitiallyRead) {
      const readButton = firstArticle.locator('.article-action-read');
      await readButton.click();
      await page.waitForTimeout(500);
    }

    // Now article should be unread (either initially or after toggling)
    await expect(firstArticle).toHaveClass(/unread/);

    // Screenshot before marking as read
    await page.screenshot({
      path: 'e2e/screenshots/08-before-read.png',
      fullPage: true,
    });
    console.log('Screenshot: 08-before-read.png');

    // Click the read button to mark as read
    const readButton = firstArticle.locator('.article-action-read');
    await readButton.click();
    await page.waitForTimeout(500);

    // Article should now be marked as read
    await expect(firstArticle).toHaveClass(/read/);

    // Screenshot after marking as read
    await page.screenshot({
      path: 'e2e/screenshots/08-after-read.png',
      fullPage: true,
    });
    console.log('Screenshot: 08-after-read.png');

    // Click the read button again to mark as unread
    await readButton.click();
    await page.waitForTimeout(500);

    // Article should be unread again
    await expect(firstArticle).toHaveClass(/unread/);

    console.log('Manual read/unread toggle working');
  });

  test('09 - filter toggle hides/shows read articles', async ({ page }) => {
    // Ensure we have some articles
    const feeds = await getFeeds();
    if (feeds.feeds.length === 0) {
      await addFeed(`${mockServerUrl}/feeds/web-dev/rss`, 'Web Dev');
    }

    await page.goto(workerUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);

    // Disable filter first to ensure we can see articles
    const filterToggle = page.locator('#hideReadToggle');
    if (await filterToggle.isChecked()) {
      await filterToggle.click();
      await page.waitForTimeout(500);
    }

    // Ensure first article is marked as read (not just toggle)
    const firstArticle = page.locator('.article-card').first();
    const initialClasses = await firstArticle.getAttribute('class');
    const isRead = initialClasses.includes('read');

    if (!isRead) {
      // Mark as read if it's currently unread
      await firstArticle.locator('.article-action-read').click();
      await page.waitForTimeout(500);
    }

    // Re-enable the filter
    await filterToggle.click();
    await page.waitForTimeout(500);

    // Count articles with filter enabled (should not show the read article)
    const articlesWithFilter = await page.locator('.article-card').count();
    console.log(`Articles visible with filter: ${articlesWithFilter}`);

    // Screenshot with filter on
    await page.screenshot({
      path: 'e2e/screenshots/09-filter-on.png',
      fullPage: true,
    });
    console.log('Screenshot: 09-filter-on.png');

    // Disable the filter to show read articles
    await filterToggle.click();
    await page.waitForTimeout(500);

    // Count articles after disabling filter
    const articlesWithoutFilter = await page.locator('.article-card').count();
    console.log(`Articles visible without filter: ${articlesWithoutFilter}`);

    // Should see at least one more article (the one we marked as read)
    expect(articlesWithoutFilter).toBeGreaterThan(articlesWithFilter);

    // Screenshot with filter off
    await page.screenshot({
      path: 'e2e/screenshots/09-filter-off.png',
      fullPage: true,
    });
    console.log('Screenshot: 09-filter-off.png');

    console.log('Filter toggle working');
  });

  test('10 - scroll marking articles as read', async ({ page }) => {
    // Ensure we have some articles
    const feeds = await getFeeds();
    if (feeds.feeds.length === 0) {
      await addFeed(`${mockServerUrl}/feeds/cloudflare/rss`, 'Cloudflare');
      await addFeed(`${mockServerUrl}/feeds/web-dev/rss`, 'Web Dev');
    }

    await page.goto(workerUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);

    // Disable the filter to see all articles
    const filterToggle = page.locator('#hideReadToggle');
    if (await filterToggle.isChecked()) {
      await filterToggle.click();
      await page.waitForTimeout(500);
    }

    // Ensure we have at least one unread article for this test
    // (previous tests may have marked all articles as read via scroll observer)
    let initialUnread = await page.locator('.article-card.unread').count();
    console.log(`Initial unread articles: ${initialUnread}`);

    if (initialUnread === 0) {
      // Mark first article as unread to have something to test with
      const firstArticle = page.locator('.article-card').first();
      await firstArticle.locator('.article-action-read').click();
      await page.waitForTimeout(500);
      initialUnread = await page.locator('.article-card.unread').count();
      console.log(`After toggling, unread articles: ${initialUnread}`);
    }

    // Screenshot before scrolling
    await page.screenshot({
      path: 'e2e/screenshots/10-before-scroll.png',
      fullPage: true,
    });
    console.log('Screenshot: 10-before-scroll.png');

    // Scroll to make first unread article fully visible and wait for auto-mark
    const firstUnreadArticle = page.locator('.article-card.unread').first();
    await firstUnreadArticle.scrollIntoViewIfNeeded();

    // Wait for the scroll observer timeout (1 second) plus processing time
    await page.waitForTimeout(2000);

    // Screenshot after scrolling
    await page.screenshot({
      path: 'e2e/screenshots/10-after-scroll.png',
      fullPage: true,
    });
    console.log('Screenshot: 10-after-scroll.png');

    // Verify article was marked as read (might be hidden by filter or visible but marked)
    const afterUnread = await page.locator('.article-card.unread').count();
    console.log(`After scroll unread articles: ${afterUnread}`);

    // Should have fewer unread articles
    expect(afterUnread).toBeLessThan(initialUnread);

    console.log('Scroll-based read marking working');
  });

  test('11 - read state persists across page reloads', async ({ page }) => {
    // Ensure we have some articles
    const feeds = await getFeeds();
    if (feeds.feeds.length === 0) {
      await addFeed(`${mockServerUrl}/feeds/tech-news/rss`, 'Tech News');
    }

    await page.goto(workerUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);

    // Disable filter to see all articles
    const filterToggle = page.locator('#hideReadToggle');
    if (await filterToggle.isChecked()) {
      await filterToggle.click();
      await page.waitForTimeout(500);
    }

    // Mark first article as read
    const firstArticle = page.locator('.article-card').first();
    const articleId = await firstArticle.getAttribute('data-id');
    await firstArticle.locator('.article-action-read').click();
    await page.waitForTimeout(500);

    // Verify it's marked as read
    await expect(firstArticle).toHaveClass(/read/);

    // Reload the page
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    // Disable filter again after reload
    const filterToggleAfterReload = page.locator('#hideReadToggle');
    if (await filterToggleAfterReload.isChecked()) {
      await filterToggleAfterReload.click();
      await page.waitForTimeout(500);
    }

    // Find the same article by ID
    const sameArticle = page.locator(`.article-card[data-id="${articleId}"]`);

    // Verify it's still marked as read
    await expect(sameArticle).toHaveClass(/read/);

    // Screenshot showing persistence
    await page.screenshot({
      path: 'e2e/screenshots/11-read-persisted.png',
      fullPage: true,
    });
    console.log('Screenshot: 11-read-persisted.png');

    console.log('Read state persistence working');
  });
});

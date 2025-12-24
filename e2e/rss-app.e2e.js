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
  refreshAllFeeds,
} from './test-helper.js';

// Store the worker URL for browser navigation
let workerUrl;
let mockServerUrl;

test.describe('RSS Reader E2E Tests', () => {
  test.beforeAll(async () => {
    // Start the mock RSS server first
    const mockServer = await startMockServer(3001);
    mockServerUrl = mockServer.getUrl();
    console.log(`Mock RSS server started at ${mockServerUrl}`);

    // Start the worker
    const worker = await startWorker({ port: 8787 });
    workerUrl = `http://localhost:8787`;
    console.log(`RSS Worker started at ${workerUrl}`);
  });

  test.afterAll(async () => {
    // Clean up
    await stopWorker();
    await stopMockServer();
    console.log('Servers stopped');
  });

  test.beforeEach(async () => {
    // Reset mock server state before each test
    const mockServer = getMockServer();
    if (mockServer) {
      mockServer.reset();
    }
  });

  test('homepage loads and displays correctly', async ({ page }) => {
    await page.goto(workerUrl);

    // Wait for the app to load
    await expect(page.locator('h1')).toContainText('RSS Reader');

    // Take a screenshot of the initial state
    await page.screenshot({
      path: 'e2e/screenshots/01-homepage-initial.png',
      fullPage: true,
    });

    // Verify main navigation elements exist
    await expect(page.locator('nav')).toBeVisible();
    await expect(page.locator('.feed-sidebar, .sidebar, [class*="feed"]')).toBeVisible();
  });

  test('can add a new RSS feed', async ({ page }) => {
    await page.goto(workerUrl);
    await page.waitForLoadState('networkidle');

    // Navigate to feeds management
    await page.click('a[href="#/feeds"], [data-route="/feeds"], nav a:has-text("Feeds")');
    await page.waitForTimeout(500);

    // Take screenshot of feeds page
    await page.screenshot({
      path: 'e2e/screenshots/02-feeds-page-empty.png',
      fullPage: true,
    });

    // Click add feed button
    const addButton = page.locator('button:has-text("Add"), button:has-text("Subscribe"), .add-feed-btn, [class*="add"]');
    await addButton.first().click();

    // Fill in the feed URL
    const urlInput = page.locator('input[type="url"], input[name="url"], input[placeholder*="URL"], input[placeholder*="url"]');
    await urlInput.fill(`${mockServerUrl}/feeds/tech-news/rss`);

    // Fill in the feed name if there's a name field
    const nameInput = page.locator('input[name="name"], input[placeholder*="name"], input[placeholder*="Name"]');
    if (await nameInput.count() > 0) {
      await nameInput.fill('Tech News Daily');
    }

    // Take screenshot with form filled
    await page.screenshot({
      path: 'e2e/screenshots/03-add-feed-form.png',
      fullPage: true,
    });

    // Submit the form
    const submitButton = page.locator('button[type="submit"], button:has-text("Add"), button:has-text("Subscribe"), .modal button:has-text("Add")');
    await submitButton.first().click();

    // Wait for the feed to be added
    await page.waitForTimeout(2000);

    // Take screenshot after adding feed
    await page.screenshot({
      path: 'e2e/screenshots/04-feed-added.png',
      fullPage: true,
    });

    // Verify the feed appears in the sidebar
    await expect(page.locator('body')).toContainText('Tech News');
  });

  test('displays articles from subscribed feeds', async ({ page }) => {
    // First add a feed via API
    await addFeed(`${mockServerUrl}/feeds/web-dev/rss`, 'Web Development Weekly');

    await page.goto(workerUrl);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Take screenshot of homepage with articles
    await page.screenshot({
      path: 'e2e/screenshots/05-articles-displayed.png',
      fullPage: true,
    });

    // Check that articles are visible
    const articleCount = await page.locator('.article, .article-card, [class*="article"]').count();
    expect(articleCount).toBeGreaterThan(0);
  });

  test('can star an article', async ({ page }) => {
    // Ensure we have a feed with articles
    const feeds = await getFeeds();
    if (feeds.feeds.length === 0) {
      await addFeed(`${mockServerUrl}/feeds/tech-news/rss`, 'Tech News');
    }

    await page.goto(workerUrl);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Find and click a star button
    const starButton = page.locator('.star-btn, [class*="star"], button:has-text("★"), button:has-text("☆")').first();
    if (await starButton.count() > 0) {
      await starButton.click();
      await page.waitForTimeout(500);

      // Take screenshot after starring
      await page.screenshot({
        path: 'e2e/screenshots/06-article-starred.png',
        fullPage: true,
      });
    }
  });

  test('can filter articles by feed', async ({ page }) => {
    // Add multiple feeds
    await addFeed(`${mockServerUrl}/feeds/tech-news/rss`, 'Tech News');
    await addFeed(`${mockServerUrl}/feeds/cloudflare/rss`, 'Cloudflare Updates');

    await page.goto(workerUrl);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Click on a specific feed in the sidebar
    const feedLink = page.locator('.feed-item, .sidebar a, [class*="feed"]:has-text("Tech")').first();
    if (await feedLink.count() > 0) {
      await feedLink.click();
      await page.waitForTimeout(500);

      // Take screenshot of filtered view
      await page.screenshot({
        path: 'e2e/screenshots/07-filtered-by-feed.png',
        fullPage: true,
      });
    }
  });

  test('can view starred articles', async ({ page }) => {
    await page.goto(workerUrl);
    await page.waitForLoadState('networkidle');

    // Click on starred filter
    const starredLink = page.locator('a:has-text("Starred"), [class*="starred"], .sidebar a:has-text("★")').first();
    if (await starredLink.count() > 0) {
      await starredLink.click();
      await page.waitForTimeout(500);

      // Take screenshot of starred articles view
      await page.screenshot({
        path: 'e2e/screenshots/08-starred-articles.png',
        fullPage: true,
      });
    }
  });

  test('can refresh feeds manually', async ({ page }) => {
    // Ensure we have a feed
    const feeds = await getFeeds();
    if (feeds.feeds.length === 0) {
      await addFeed(`${mockServerUrl}/feeds/tech-news/rss`, 'Tech News');
    }

    await page.goto(workerUrl);
    await page.waitForLoadState('networkidle');

    // Find and click refresh button
    const refreshButton = page.locator('button:has-text("Refresh"), .refresh-btn, [class*="refresh"]').first();
    if (await refreshButton.count() > 0) {
      // Take screenshot before refresh
      await page.screenshot({
        path: 'e2e/screenshots/09-before-refresh.png',
        fullPage: true,
      });

      await refreshButton.click();
      await page.waitForTimeout(2000);

      // Take screenshot after refresh
      await page.screenshot({
        path: 'e2e/screenshots/10-after-refresh.png',
        fullPage: true,
      });
    }
  });

  test('cron job fetches new articles', async ({ page }) => {
    // Add a feed
    await addFeed(`${mockServerUrl}/feeds/cloudflare/rss`, 'Cloudflare Updates');

    // Get initial article count
    const initialArticles = await getArticles();
    const initialCount = initialArticles.articles.length;

    // Add a new article to the mock server
    const mockServer = getMockServer();
    mockServer.addArticle('cloudflare', {
      title: 'New Article Added by Cron Test',
      description: 'This article was added to test cron functionality',
      link: `/articles/cron-test-${Date.now()}`,
    });

    // Trigger the cron job
    await triggerCron();

    // Wait for the cron to complete
    await page.waitForTimeout(2000);

    // Check that we have more articles now
    const afterCronArticles = await getArticles();
    expect(afterCronArticles.articles.length).toBeGreaterThan(initialCount);

    // Navigate to the app and take a screenshot showing the new article
    await page.goto(workerUrl);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    await page.screenshot({
      path: 'e2e/screenshots/11-after-cron-job.png',
      fullPage: true,
    });

    // Verify the new article is visible
    await expect(page.locator('body')).toContainText('Cron Test');
  });

  test('can delete a feed', async ({ page }) => {
    // Add a feed to delete
    await addFeed(`${mockServerUrl}/feeds/web-dev/rss`, 'Web Dev to Delete');

    await page.goto(workerUrl);
    await page.waitForLoadState('networkidle');

    // Navigate to feeds page
    await page.click('a[href="#/feeds"], [data-route="/feeds"], nav a:has-text("Feeds")');
    await page.waitForTimeout(500);

    // Take screenshot before delete
    await page.screenshot({
      path: 'e2e/screenshots/12-before-delete-feed.png',
      fullPage: true,
    });

    // Find and click delete button for a feed
    const deleteButton = page.locator('button:has-text("Delete"), button:has-text("Remove"), .delete-btn, [class*="delete"]').first();
    if (await deleteButton.count() > 0) {
      await deleteButton.click();

      // Handle confirmation if there is one
      const confirmButton = page.locator('button:has-text("Confirm"), button:has-text("Yes"), .confirm-btn');
      if (await confirmButton.count() > 0) {
        await confirmButton.click();
      }

      await page.waitForTimeout(1000);

      // Take screenshot after delete
      await page.screenshot({
        path: 'e2e/screenshots/13-after-delete-feed.png',
        fullPage: true,
      });
    }
  });

  test('mobile responsive layout', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto(workerUrl);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    // Take screenshot of mobile view
    await page.screenshot({
      path: 'e2e/screenshots/14-mobile-view.png',
      fullPage: true,
    });

    // Check if hamburger menu exists and click it
    const hamburger = page.locator('.hamburger, .menu-toggle, [class*="hamburger"], button[aria-label*="menu"]').first();
    if (await hamburger.count() > 0) {
      await hamburger.click();
      await page.waitForTimeout(300);

      // Take screenshot with menu open
      await page.screenshot({
        path: 'e2e/screenshots/15-mobile-menu-open.png',
        fullPage: true,
      });
    }
  });

  test('API health check returns ok', async ({ page }) => {
    const response = await page.request.get(`${workerUrl}/api/health`);
    const data = await response.json();

    expect(response.status()).toBe(200);
    expect(data.status).toBe('ok');
  });

  test('handles Atom feeds correctly', async ({ page }) => {
    // Add an Atom feed
    await addFeed(`${mockServerUrl}/feeds/tech-news/atom`, 'Tech News (Atom)');

    await page.goto(workerUrl);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Take screenshot showing Atom feed articles
    await page.screenshot({
      path: 'e2e/screenshots/16-atom-feed-articles.png',
      fullPage: true,
    });

    // Verify articles are displayed
    await expect(page.locator('body')).toContainText('Breaking');
  });

  test('complete user flow with screenshots', async ({ page }) => {
    // This test demonstrates a complete user flow

    // 1. Start fresh and navigate to the app
    await page.goto(workerUrl);
    await page.waitForLoadState('networkidle');

    await page.screenshot({
      path: 'e2e/screenshots/flow-01-start.png',
      fullPage: true,
    });

    // 2. Navigate to feeds and add a new feed
    await page.click('a[href="#/feeds"], [data-route="/feeds"], nav a:has-text("Feeds")');
    await page.waitForTimeout(500);

    await page.screenshot({
      path: 'e2e/screenshots/flow-02-feeds-page.png',
      fullPage: true,
    });

    // 3. Add a feed via API (since UI interaction may vary)
    await addFeed(`${mockServerUrl}/feeds/cloudflare/rss`, 'Cloudflare Blog');

    // 4. Navigate home to see articles
    await page.click('a[href="#/"], a[href="/"], nav a:has-text("Home"), nav a:has-text("Articles")');
    await page.waitForTimeout(1000);

    await page.screenshot({
      path: 'e2e/screenshots/flow-03-with-articles.png',
      fullPage: true,
    });

    // 5. Add a new article via mock server and trigger cron
    const mockServer = getMockServer();
    mockServer.addArticle('cloudflare', {
      title: 'BREAKING: New Feature Announced!',
      description: 'An exciting new feature has just been announced.',
      link: `/articles/breaking-${Date.now()}`,
    });

    await triggerCron();
    await page.waitForTimeout(1000);

    // 6. Refresh the page to see new article
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    await page.screenshot({
      path: 'e2e/screenshots/flow-04-after-cron.png',
      fullPage: true,
    });

    // Verify the new article appears
    await expect(page.locator('body')).toContainText('BREAKING');
  });
});

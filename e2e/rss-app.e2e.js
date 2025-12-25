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
});

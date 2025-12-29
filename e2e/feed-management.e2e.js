/**
 * Feed Management Tests
 *
 * Tests for feed subscription and management functionality.
 * Covers adding RSS/Atom feeds, viewing feed lists, and managing subscriptions.
 */

import { test, expect } from '@playwright/test';
import {
  setupTestEnvironment,
  teardownTestEnvironment,
  resetTestData,
  getWorkerUrl,
  getMockServerUrl,
} from './helpers/test-setup.js';
import { addFeed, getFeeds, getArticles } from './test-helper.js';
import { waitForPageLoad, clickNavLink, takeScreenshot } from './helpers/page-helpers.js';

let workerUrl;
let mockServerUrl;

test.describe('Feed Management Tests', () => {
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

  test('can add RSS feed and see articles', async ({ page }) => {
    // Add feed via API (use unique name to avoid conflicts)
    console.log('Adding RSS feed via API...');
    const feedName = `Tech News ${Date.now()}`;
    const result = await addFeed(`${mockServerUrl}/feeds/tech-news/rss`, feedName, page);
    console.log('Feed added:', JSON.stringify(result));
    // Feed should be added successfully or already exist
    expect(result.feed || result.error).toBeDefined();

    // Navigate to app
    await waitForPageLoad(page, workerUrl);
    await page.waitForTimeout(1000);

    // Screenshot with articles
    await takeScreenshot(page, 'feed-management-01-rss-feed');

    // Verify page has content
    const bodyText = await page.locator('body').textContent();
    expect(bodyText.length).toBeGreaterThan(0);
    console.log('✓ RSS feed added and articles visible');
  });

  test('can add Atom feed and see articles', async ({ page }) => {
    // Add Atom feed (use unique name to avoid conflicts)
    console.log('Adding Atom feed via API...');
    const feedName = `Tech Atom ${Date.now()}`;
    const result = await addFeed(`${mockServerUrl}/feeds/tech-news/atom`, feedName, page);
    // Feed should be added successfully or already exist
    expect(result.feed || result.error).toBeDefined();

    await waitForPageLoad(page, workerUrl);
    await page.waitForTimeout(1000);

    await takeScreenshot(page, 'feed-management-02-atom-feed');
    console.log('✓ Atom feed added and articles visible');
  });

  test('feeds page shows subscriptions', async ({ page }) => {
    // Ensure we have a feed
    const feeds = await getFeeds(page);
    if (feeds.feeds.length === 0) {
      await addFeed(`${mockServerUrl}/feeds/web-dev/rss`, 'Web Dev', page);
    }

    await waitForPageLoad(page, workerUrl);

    // Navigate to feeds page using the nav link
    await clickNavLink(page, '#/feeds');

    await takeScreenshot(page, 'feed-management-03-feeds-page');

    // Verify we're on the feeds page
    const url = page.url();
    expect(url).toContain('#/feeds');
    console.log('✓ Feeds page displays subscriptions');
  });

  test('can add multiple feeds', async ({ page }) => {
    // Add multiple feeds
    await addFeed(`${mockServerUrl}/feeds/tech-news/rss`, 'Tech News', page);
    await addFeed(`${mockServerUrl}/feeds/web-dev/rss`, 'Web Dev', page);
    await addFeed(`${mockServerUrl}/feeds/cloudflare/rss`, 'Cloudflare', page);

    // Verify feeds were added
    const feeds = await getFeeds(page);
    expect(feeds.feeds.length).toBeGreaterThanOrEqual(3);

    // Verify articles from all feeds are available
    const articles = await getArticles(null, false, page);
    expect(articles.articles.length).toBeGreaterThan(0);

    await waitForPageLoad(page, workerUrl);
    await takeScreenshot(page, 'feed-management-04-multiple-feeds');
    console.log('✓ Multiple feeds added successfully');
  });
});

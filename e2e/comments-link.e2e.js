/**
 * Comments Link Tests
 *
 * Tests that HN-style feeds with <comments> tags display
 * a clickable Comments link in the article card.
 */

import { test, expect } from '@playwright/test';
import {
  setupTestEnvironment,
  teardownTestEnvironment,
  resetTestData,
  getWorkerUrl,
  getMockServerUrl,
} from './helpers/test-setup.js';
import { addFeed } from './test-helper.js';
import { waitForPageLoad, takeScreenshot } from './helpers/page-helpers.js';

let workerUrl;
let mockServerUrl;

test.describe('Comments Link Tests', () => {
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

  test('HN-style feed displays Comments link', async ({ page }) => {
    // Add HN-style feed that includes <comments> tags
    console.log('Adding HN-style feed via API...');
    const result = await addFeed(`${mockServerUrl}/feeds/hacker-news/rss`, 'Hacker News', page);
    console.log('Feed added:', JSON.stringify(result));
    expect(result.feed || result.error).toBeDefined();

    // Navigate to app
    await waitForPageLoad(page, workerUrl);
    await page.waitForTimeout(1000);

    // Screenshot showing articles with Comments link
    await takeScreenshot(page, 'comments-link-01-hn-feed');

    // Verify Comments links are present
    const commentsLinks = await page.locator('.article-comments-link').all();
    console.log(`Found ${commentsLinks.length} Comments links`);
    expect(commentsLinks.length).toBeGreaterThan(0);

    // Verify the Comments link has correct href
    const firstCommentsLink = page.locator('.article-comments-link').first();
    const href = await firstCommentsLink.getAttribute('href');
    console.log('Comments link href:', href);
    expect(href).toContain('/item?id=');

    // Verify the link text is "Comments"
    const linkText = await firstCommentsLink.textContent();
    expect(linkText).toBe('Comments');

    // Verify the link opens in new tab
    const target = await firstCommentsLink.getAttribute('target');
    expect(target).toBe('_blank');

    // Verify noopener noreferrer for security
    const rel = await firstCommentsLink.getAttribute('rel');
    expect(rel).toBe('noopener noreferrer');

    console.log('✓ HN-style feed displays Comments link correctly');
  });

  test('regular feeds do not display Comments link', async ({ page }) => {
    // Add regular feed without <comments> tags
    console.log('Adding regular feed via API...');
    const result = await addFeed(`${mockServerUrl}/feeds/web-dev/rss`, 'Web Dev', page);
    console.log('Feed added:', JSON.stringify(result));
    expect(result.feed || result.error).toBeDefined();

    // Navigate to app and wait for the feed sidebar to populate
    await waitForPageLoad(page, workerUrl);
    await page.waitForTimeout(1000);

    // Click on Web Dev in sidebar to filter to only that feed's articles
    const webDevFeed = page.locator('.feed-item', { hasText: 'Web Dev' });
    await expect(webDevFeed).toBeVisible({ timeout: 5000 });
    await webDevFeed.click();
    await page.waitForTimeout(500);

    // Get all visible article cards
    const articleCards = page.locator('.article-card');
    const cardCount = await articleCards.count();
    console.log(`Found ${cardCount} article cards in Web Dev feed`);
    expect(cardCount).toBeGreaterThan(0);

    // Verify NO Comments links are present in the visible articles
    const commentsLinks = await page.locator('.article-comments-link').all();
    console.log(`Found ${commentsLinks.length} Comments links`);
    expect(commentsLinks.length).toBe(0);

    console.log('✓ Regular feed does not display Comments link');
  });
});

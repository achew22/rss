/**
 * Unread Count Tests
 *
 * Tests for unread article count display in the sidebar.
 * Verifies that the "All Articles" count shows only unread articles.
 */

import { test, expect } from '@playwright/test';
import {
  setupTestEnvironment,
  teardownTestEnvironment,
  resetTestData,
} from './helpers/test-setup.js';
import { addFeed } from './test-helper.js';
import { waitForPageLoad, takeScreenshot } from './helpers/page-helpers.js';

let workerUrl;
let mockServerUrl;

test.describe('Unread Count Tests', () => {
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

  test('All Articles count shows unread count, not total count', async ({ page }) => {
    // Add a feed with multiple articles
    console.log('Adding feed with articles...');
    await addFeed(`${mockServerUrl}/feeds/tech-news/rss`, 'Tech News', page);

    // Navigate to app
    await waitForPageLoad(page, workerUrl);
    await page.waitForTimeout(500);

    // Get the initial count displayed in sidebar
    const allCountElement = page.locator('#allCount');
    const initialCount = parseInt(await allCountElement.textContent(), 10);
    console.log(`Initial All Articles count: ${initialCount}`);

    // Get the actual number of articles
    const articles = page.locator('.article-card');
    const totalArticles = await articles.count();
    console.log(`Total articles visible: ${totalArticles}`);

    // Count unread articles
    const unreadArticles = page.locator('.article-card.unread');
    const unreadCount = await unreadArticles.count();
    console.log(`Unread articles: ${unreadCount}`);

    await takeScreenshot(page, 'unread-count-01-initial-state');

    // The sidebar count should equal the unread count, NOT the total count
    expect(initialCount).toBe(unreadCount);
    console.log('✓ Initial count matches unread count');

    // Click "Show read" to ensure we can see all articles including read ones
    const showReadBtn = page.locator('button:has-text("Show read")');
    await showReadBtn.click();
    await page.waitForTimeout(300);

    // Mark first article as read using keyboard shortcut
    await page.keyboard.press('j'); // Select first article
    await page.waitForTimeout(200);
    await page.keyboard.press('m'); // Mark as read
    await page.waitForTimeout(500);

    await takeScreenshot(page, 'unread-count-02-after-marking-read');

    // Get the updated count
    const updatedCount = parseInt(await allCountElement.textContent(), 10);
    console.log(`Updated All Articles count: ${updatedCount}`);

    // The count should have decreased by 1
    expect(updatedCount).toBe(initialCount - 1);
    console.log('✓ Count decreased by 1 after marking article as read');

    // Mark the same article as unread again
    await page.keyboard.press('m'); // Toggle read status
    await page.waitForTimeout(500);

    await takeScreenshot(page, 'unread-count-03-after-marking-unread');

    // The count should be back to original
    const restoredCount = parseInt(await allCountElement.textContent(), 10);
    console.log(`Restored All Articles count: ${restoredCount}`);
    expect(restoredCount).toBe(initialCount);
    console.log('✓ Count restored after marking article as unread');
  });

  test('individual feed count shows unread count', async ({ page }) => {
    // Add a feed
    console.log('Adding feed with articles...');
    await addFeed(`${mockServerUrl}/feeds/tech-news/rss`, 'Tech News', page);

    // Navigate to app
    await waitForPageLoad(page, workerUrl);
    await page.waitForTimeout(500);

    // Find the feed item in sidebar (the third .feed-item, after All Articles and Starred)
    const feedItem = page.locator('.feed-item').nth(2);
    const feedCountElement = feedItem.locator('.feed-count');
    const initialFeedCount = parseInt(await feedCountElement.textContent(), 10);
    console.log(`Initial feed count: ${initialFeedCount}`);

    // Click on the feed to view only its articles
    await feedItem.click();
    await page.waitForTimeout(500);

    // Count unread articles in this feed
    const unreadArticles = page.locator('.article-card.unread');
    const unreadCount = await unreadArticles.count();
    console.log(`Unread articles in feed: ${unreadCount}`);

    await takeScreenshot(page, 'unread-count-04-feed-view');

    // The feed count should equal the unread count
    expect(initialFeedCount).toBe(unreadCount);
    console.log('✓ Feed count matches unread count');
  });
});

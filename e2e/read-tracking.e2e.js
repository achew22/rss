/**
 * Read Tracking E2E Tests
 *
 * Tests article read tracking functionality:
 * - Manual read/unread toggling
 * - Filter toggle to hide/show read articles
 * - Automatic scroll-based read marking
 * - Read state persistence
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

test.describe('Read Tracking', () => {
  test.beforeAll(async () => {
    await setupTestEnvironment();
  });

  test.afterAll(async () => {
    await teardownTestEnvironment();
  });

  test.beforeEach(async () => {
    await resetBetweenTests();
  });

  test('08 - manually mark article as read/unread', async ({ page }) => {
    const workerUrl = getWorkerUrl();
    const mockServerUrl = getMockServerUrl();

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
    const workerUrl = getWorkerUrl();
    const mockServerUrl = getMockServerUrl();

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
    const workerUrl = getWorkerUrl();
    const mockServerUrl = getMockServerUrl();

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
    const workerUrl = getWorkerUrl();
    const mockServerUrl = getMockServerUrl();

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

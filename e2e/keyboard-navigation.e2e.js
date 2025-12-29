/**
 * Keyboard Navigation Tests
 *
 * Tests for vim-style keyboard navigation (j/k) through articles.
 * Verifies that users can navigate, select, and interact with articles using keyboard shortcuts.
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

test.describe('Keyboard Navigation Tests', () => {
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

  test('j key navigates to next article', async ({ page }) => {
    // Add a feed with multiple articles
    console.log('Adding feed with articles...');
    await addFeed(`${mockServerUrl}/feeds/tech-news/rss`, 'Tech News', page);

    // Navigate to app
    await waitForPageLoad(page, workerUrl);
    await page.waitForTimeout(500);

    // Verify we have articles
    const articles = page.locator('.article-card');
    const articleCount = await articles.count();
    console.log(`Found ${articleCount} articles`);
    expect(articleCount).toBeGreaterThan(0);

    // Take initial screenshot
    await takeScreenshot(page, 'keyboard-01-initial-state');

    // Press 'j' to select first article
    await page.keyboard.press('j');
    await page.waitForTimeout(200);

    // First article should be focused
    const firstArticle = articles.first();
    await expect(firstArticle).toHaveClass(/focused/);

    await takeScreenshot(page, 'keyboard-02-first-article-focused');
    console.log('✓ First article focused after pressing j');

    // Press 'j' again to move to second article
    if (articleCount > 1) {
      await page.keyboard.press('j');
      await page.waitForTimeout(200);

      // Second article should be focused, first should not
      const secondArticle = articles.nth(1);
      await expect(secondArticle).toHaveClass(/focused/);
      await expect(firstArticle).not.toHaveClass(/focused/);

      await takeScreenshot(page, 'keyboard-03-second-article-focused');
      console.log('✓ Second article focused after pressing j again');
    }
  });

  test('k key navigates to previous article', async ({ page }) => {
    // Add a feed with multiple articles
    await addFeed(`${mockServerUrl}/feeds/tech-news/rss`, 'Tech News', page);

    await waitForPageLoad(page, workerUrl);
    await page.waitForTimeout(500);

    // Click "Show read" to ensure all articles are visible
    const showReadBtn = page.locator('button:has-text("Show read")');
    await showReadBtn.click();
    await page.waitForTimeout(300);

    const articles = page.locator('.article-card');
    const articleCount = await articles.count();
    expect(articleCount).toBeGreaterThan(1);

    // Navigate down to second article
    await page.keyboard.press('j');
    await page.waitForTimeout(100);
    await page.keyboard.press('j');
    await page.waitForTimeout(200);

    // Second article should be focused
    const secondArticle = articles.nth(1);
    await expect(secondArticle).toHaveClass(/focused/);

    await takeScreenshot(page, 'keyboard-04-before-k-press');

    // Press 'k' to go back to first article
    await page.keyboard.press('k');
    await page.waitForTimeout(200);

    // First article should be focused
    const firstArticle = articles.first();
    await expect(firstArticle).toHaveClass(/focused/);
    await expect(secondArticle).not.toHaveClass(/focused/);

    await takeScreenshot(page, 'keyboard-05-after-k-press');
    console.log('✓ Previous article focused after pressing k');
  });

  test('j/k navigation wraps at boundaries', async ({ page }) => {
    // Add a feed with articles
    await addFeed(`${mockServerUrl}/feeds/tech-news/rss`, 'Tech News', page);

    await waitForPageLoad(page, workerUrl);
    await page.waitForTimeout(500);

    const articles = page.locator('.article-card');
    const articleCount = await articles.count();
    expect(articleCount).toBeGreaterThan(0);

    // Navigate to first article
    await page.keyboard.press('j');
    await page.waitForTimeout(100);

    // First article should be focused
    const firstArticle = articles.first();
    await expect(firstArticle).toHaveClass(/focused/);

    // Press k - should stay at first article (no wrap)
    await page.keyboard.press('k');
    await page.waitForTimeout(200);

    // Should still be on first article
    await expect(firstArticle).toHaveClass(/focused/);

    await takeScreenshot(page, 'keyboard-06-boundary-top');
    console.log('✓ Navigation stops at top boundary');

    // Navigate to last article
    for (let i = 0; i < articleCount; i++) {
      await page.keyboard.press('j');
      await page.waitForTimeout(50);
    }
    await page.waitForTimeout(200);

    // Last article should be focused
    const lastArticle = articles.last();
    await expect(lastArticle).toHaveClass(/focused/);

    // Press j - should stay at last article (no wrap)
    await page.keyboard.press('j');
    await page.waitForTimeout(200);

    await expect(lastArticle).toHaveClass(/focused/);

    await takeScreenshot(page, 'keyboard-07-boundary-bottom');
    console.log('✓ Navigation stops at bottom boundary');
  });

  test('focused article has visible focus indicator', async ({ page }) => {
    // Add a feed
    await addFeed(`${mockServerUrl}/feeds/web-dev/rss`, 'Web Dev', page);

    await waitForPageLoad(page, workerUrl);
    await page.waitForTimeout(500);

    const articles = page.locator('.article-card');
    expect(await articles.count()).toBeGreaterThan(0);

    // Select first article
    await page.keyboard.press('j');
    await page.waitForTimeout(200);

    // Verify the focused class is applied
    const focusedArticle = page.locator('.article-card.focused');
    await expect(focusedArticle).toBeVisible();

    // Verify the outline style is applied (visual focus indicator)
    const outline = await focusedArticle.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      return styles.outline;
    });
    expect(outline).toContain('rgb(37, 99, 235)'); // Primary color

    await takeScreenshot(page, 'keyboard-08-focus-indicator');
    console.log('✓ Focus indicator is visible on selected article');
  });

  test('keyboard navigation works after switching feeds', async ({ page }) => {
    // Add multiple feeds
    await addFeed(`${mockServerUrl}/feeds/tech-news/rss`, 'Tech News', page);
    await addFeed(`${mockServerUrl}/feeds/web-dev/rss`, 'Web Dev', page);

    await waitForPageLoad(page, workerUrl);
    await page.waitForTimeout(500);

    // Click "Show read" button so articles remain visible after being marked as read
    const showReadBtn = page.locator('button:has-text("Show read")');
    await showReadBtn.click();
    await page.waitForTimeout(300);

    // Select first article in All Articles
    await page.keyboard.press('j');
    await page.waitForTimeout(200);

    const firstArticle = page.locator('.article-card').first();
    await expect(firstArticle).toHaveClass(/focused/);

    // Click on a specific feed in sidebar to switch
    const feedItem = page.locator('.feed-item').nth(2); // First user feed
    await feedItem.click();
    await page.waitForTimeout(500);

    // Focus should be reset - no article focused
    const focusedArticles = page.locator('.article-card.focused');
    expect(await focusedArticles.count()).toBe(0);

    // Navigate with j again - should work fresh
    await page.keyboard.press('j');
    await page.waitForTimeout(200);

    const newFirstArticle = page.locator('.article-card').first();
    await expect(newFirstArticle).toHaveClass(/focused/);

    await takeScreenshot(page, 'keyboard-09-navigation-after-feed-switch');
    console.log('✓ Keyboard navigation works after switching feeds');
  });

  test('keyboard navigation only works on home view', async ({ page }) => {
    // Add a feed
    await addFeed(`${mockServerUrl}/feeds/tech-news/rss`, 'Tech News', page);

    await waitForPageLoad(page, workerUrl);
    await page.waitForTimeout(500);

    // Navigate to feeds page
    await page.click('a[href="#/feeds"]');
    await page.waitForTimeout(500);

    // Verify we're on feeds page
    expect(page.url()).toContain('#/feeds');

    // Press j - should not create any focused article
    await page.keyboard.press('j');
    await page.waitForTimeout(200);

    // No focused articles should exist
    const focusedArticles = page.locator('.article-card.focused');
    expect(await focusedArticles.count()).toBe(0);

    await takeScreenshot(page, 'keyboard-10-feeds-page-no-nav');
    console.log('✓ Keyboard navigation disabled on non-home pages');
  });

  test('keyboard navigation disabled when modal is open', async ({ page }) => {
    // Add a feed
    await addFeed(`${mockServerUrl}/feeds/tech-news/rss`, 'Tech News', page);

    await waitForPageLoad(page, workerUrl);
    await page.waitForTimeout(500);

    // Open add feed modal
    const addFeedBtn = page.locator('#addFeedBtn');
    await addFeedBtn.click();
    await page.waitForTimeout(300);

    // Verify modal is open
    const modal = page.locator('#addFeedModal.active');
    await expect(modal).toBeVisible();

    await takeScreenshot(page, 'keyboard-11-modal-open');

    // Press j - should not navigate articles
    await page.keyboard.press('j');
    await page.waitForTimeout(200);

    // No focused articles should exist
    const focusedArticles = page.locator('.article-card.focused');
    expect(await focusedArticles.count()).toBe(0);

    console.log('✓ Keyboard navigation disabled when modal is open');

    // Close modal
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  });

  test('Enter/o key opens selected article', async ({ page }) => {
    // Add a feed
    await addFeed(`${mockServerUrl}/feeds/tech-news/rss`, 'Tech News', page);

    await waitForPageLoad(page, workerUrl);
    await page.waitForTimeout(500);

    // Select first article
    await page.keyboard.press('j');
    await page.waitForTimeout(200);

    // Get the link of the selected article
    const selectedCard = page.locator('.article-card.focused');
    const articleLink = await selectedCard.getAttribute('data-link');
    expect(articleLink).toBeTruthy();

    // Listen for popup (new tab)
    const popupPromise = page.waitForEvent('popup');

    // Press Enter to open article
    await page.keyboard.press('Enter');

    // Wait for popup
    const popup = await popupPromise;
    const popupUrl = popup.url();

    // Verify the popup URL matches the article link
    expect(popupUrl).toBe(articleLink);

    await takeScreenshot(page, 'keyboard-12-article-opened');
    console.log('✓ Enter key opens selected article in new tab');

    // Close popup
    await popup.close();
  });

  test('b key opens selected article in background tab', async ({ page }) => {
    // Add a feed
    await addFeed(`${mockServerUrl}/feeds/tech-news/rss`, 'Tech News', page);

    await waitForPageLoad(page, workerUrl);
    await page.waitForTimeout(500);

    // Select first article
    await page.keyboard.press('j');
    await page.waitForTimeout(200);

    // Get the link of the selected article
    const selectedCard = page.locator('.article-card.focused');
    const articleLink = await selectedCard.getAttribute('data-link');
    expect(articleLink).toBeTruthy();

    // Listen for popup (new tab)
    const popupPromise = page.waitForEvent('popup');

    // Press 'b' to open article in background
    await page.keyboard.press('b');

    // Wait for popup
    const popup = await popupPromise;
    const popupUrl = popup.url();

    // Verify the popup URL matches the article link
    expect(popupUrl).toBe(articleLink);

    // The main page should still have focus (article still focused)
    await expect(selectedCard).toHaveClass(/focused/);

    await takeScreenshot(page, 'keyboard-12b-article-opened-background');
    console.log('✓ b key opens selected article in background tab');

    // Close popup
    await popup.close();
  });

  test('s key toggles star on selected article', async ({ page }) => {
    // Add a feed
    await addFeed(`${mockServerUrl}/feeds/tech-news/rss`, 'Tech News', page);

    await waitForPageLoad(page, workerUrl);
    await page.waitForTimeout(500);

    // Select first article
    await page.keyboard.press('j');
    await page.waitForTimeout(200);

    // Get the article ID
    const selectedCard = page.locator('.article-card.focused');
    const articleId = await selectedCard.getAttribute('data-id');

    // Check initial star state
    const starButton = selectedCard.locator('.article-action-star');
    const initialStarred = await starButton.evaluate(el => el.classList.contains('starred'));

    await takeScreenshot(page, 'keyboard-13-before-star');

    // Press 's' to toggle star
    await page.keyboard.press('s');
    await page.waitForTimeout(500);

    // The re-render may change which card is focused, so find by ID
    const updatedCard = page.locator(`.article-card[data-id="${articleId}"]`);
    const updatedStarButton = updatedCard.locator('.article-action-star');
    const newStarred = await updatedStarButton.evaluate(el => el.classList.contains('starred'));

    // Star state should be toggled
    expect(newStarred).toBe(!initialStarred);

    await takeScreenshot(page, 'keyboard-14-after-star');
    console.log('✓ s key toggles star on selected article');
  });

  test('m key toggles read status on selected article', async ({ page }) => {
    // Add a feed
    await addFeed(`${mockServerUrl}/feeds/tech-news/rss`, 'Tech News', page);

    await waitForPageLoad(page, workerUrl);
    await page.waitForTimeout(500);

    // Click "Show read" button to disable hideRead filter so we can see the article after marking as read
    const showReadBtn = page.locator('button:has-text("Show read")');
    await showReadBtn.click();
    await page.waitForTimeout(300);

    // Wait for unread articles to appear (scroll to top to ensure articles haven't been auto-marked as read)
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(200);

    // Find an unread article to test with
    const unreadCards = page.locator('.article-card.unread');
    const unreadCount = await unreadCards.count();

    // If no unread articles, skip the unread assertion (previous tests may have marked them)
    if (unreadCount > 0) {
      // Select first article
      await page.keyboard.press('j');
      await page.waitForTimeout(200);

      // Get the article ID
      const selectedCard = page.locator('.article-card.focused');
      const articleId = await selectedCard.getAttribute('data-id');

      // Check initial read state
      const initialUnread = await selectedCard.evaluate(el => el.classList.contains('unread'));

      await takeScreenshot(page, 'keyboard-13b-before-read-toggle');

      // Press 'm' to toggle read status
      await page.keyboard.press('m');
      await page.waitForTimeout(500);

      // The re-render may change which card is focused, so find by ID
      const updatedCard = page.locator(`.article-card[data-id="${articleId}"]`);
      const newUnread = await updatedCard.evaluate(el => el.classList.contains('unread'));

      // Read state should be toggled
      expect(newUnread).toBe(!initialUnread);

      await takeScreenshot(page, 'keyboard-14b-after-read-toggle');

      // Press 'm' again to toggle back
      await page.keyboard.press('m');
      await page.waitForTimeout(500);

      const finalCard = page.locator(`.article-card[data-id="${articleId}"]`);
      const finalUnread = await finalCard.evaluate(el => el.classList.contains('unread'));

      // Should be back to original state
      expect(finalUnread).toBe(initialUnread);

      await takeScreenshot(page, 'keyboard-14c-after-second-read-toggle');
    } else {
      // No unread articles available, test with any article
      await page.keyboard.press('j');
      await page.waitForTimeout(200);

      const selectedCard = page.locator('.article-card.focused');
      const articleId = await selectedCard.getAttribute('data-id');
      const initialUnread = await selectedCard.evaluate(el => el.classList.contains('unread'));

      // Press 'm' to toggle
      await page.keyboard.press('m');
      await page.waitForTimeout(500);

      const updatedCard = page.locator(`.article-card[data-id="${articleId}"]`);
      const newUnread = await updatedCard.evaluate(el => el.classList.contains('unread'));

      // Read state should be toggled
      expect(newUnread).toBe(!initialUnread);

      await takeScreenshot(page, 'keyboard-14b-after-read-toggle');
    }

    console.log('✓ m key toggles read status on selected article');
  });

  test('full keyboard navigation workflow', async ({ page }) => {
    // Add feeds
    await addFeed(`${mockServerUrl}/feeds/tech-news/rss`, 'Tech News', page);
    await addFeed(`${mockServerUrl}/feeds/web-dev/rss`, 'Web Dev', page);

    await waitForPageLoad(page, workerUrl);
    await page.waitForTimeout(500);

    await takeScreenshot(page, 'keyboard-15-workflow-start');

    // Navigate through several articles with j
    await page.keyboard.press('j'); // First
    await page.waitForTimeout(100);
    await page.keyboard.press('j'); // Second
    await page.waitForTimeout(100);
    await page.keyboard.press('j'); // Third
    await page.waitForTimeout(200);

    await takeScreenshot(page, 'keyboard-16-workflow-navigated-down');

    // Go back up with k
    await page.keyboard.press('k'); // Second
    await page.waitForTimeout(100);
    await page.keyboard.press('k'); // First
    await page.waitForTimeout(200);

    await takeScreenshot(page, 'keyboard-17-workflow-navigated-up');

    // Star the article
    await page.keyboard.press('s');
    await page.waitForTimeout(500);

    await takeScreenshot(page, 'keyboard-18-workflow-starred');

    console.log('✓ Full keyboard navigation workflow completed');
  });
});

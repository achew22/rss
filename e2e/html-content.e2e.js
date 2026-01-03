/**
 * HTML Content Rendering Tests
 *
 * Tests that HTML content in article descriptions is properly sanitized
 * and rendered, including clickable links.
 */

import { test, expect } from '@playwright/test';
import {
  setupTestEnvironment,
  teardownTestEnvironment,
  resetTestData,
  getWorkerUrl,
  getMockServerUrl,
  getMockServer,
} from './helpers/test-setup.js';
import { addFeed, refreshAllFeeds } from './test-helper.js';
import { waitForPageLoad, takeScreenshot } from './helpers/page-helpers.js';

let workerUrl;
let mockServerUrl;

test.describe('HTML Content Rendering Tests', () => {
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

  test('HTML links in article description are rendered as clickable', async ({ page }) => {
    // Add an article with HTML link in description via mock server
    const mockServer = getMockServer();
    mockServer.addArticle('tech-news', {
      title: 'Article with HTML Link',
      description: 'Check out the discussion: <a href="https://example.com/comments">Comments</a> for more info.',
      link: '/articles/html-link-test',
    });

    // Add the feed
    await addFeed(`${mockServerUrl}/feeds/tech-news/rss`, 'Tech News', page);

    // Navigate to app and wait for articles to load
    await waitForPageLoad(page, workerUrl);
    await page.waitForTimeout(1000);

    // Take screenshot for debugging
    await takeScreenshot(page, 'html-content-01-link-rendering');

    // Find the article with HTML link
    const articleCard = page.locator('.article-card', { hasText: 'Article with HTML Link' });
    await expect(articleCard).toBeVisible();

    // Check that the "Comments" text is rendered as a clickable link
    const commentsLink = articleCard.locator('.article-excerpt a[href="https://example.com/comments"]');
    await expect(commentsLink).toBeVisible();
    await expect(commentsLink).toHaveText('Comments');

    // Verify the link is clickable (has proper href)
    const href = await commentsLink.getAttribute('href');
    expect(href).toBe('https://example.com/comments');

    console.log('✓ HTML link in article description is rendered as clickable');
  });

  test('dangerous HTML is stripped from article description', async ({ page }) => {
    // Add an article with dangerous HTML
    const mockServer = getMockServer();
    mockServer.addArticle('tech-news', {
      title: 'Article with Script Tag',
      description: 'Safe content <script>alert("xss")</script> more safe content',
      link: '/articles/script-test',
    });

    // Add the feed
    await addFeed(`${mockServerUrl}/feeds/tech-news/rss`, 'Tech News', page);

    // Navigate to app
    await waitForPageLoad(page, workerUrl);
    await page.waitForTimeout(1000);

    // Find the article
    const articleCard = page.locator('.article-card', { hasText: 'Article with Script Tag' });
    await expect(articleCard).toBeVisible();

    // Verify no script tags are present in the DOM
    const scriptTags = articleCard.locator('script');
    await expect(scriptTags).toHaveCount(0);

    // Verify the safe content is still there
    const excerpt = articleCard.locator('.article-excerpt');
    const text = await excerpt.textContent();
    expect(text).toContain('Safe content');
    expect(text).toContain('more safe content');
    expect(text).not.toContain('<script>');

    console.log('✓ Dangerous HTML (script tags) are stripped from content');
  });

  test('multiple HTML links in description are all rendered', async ({ page }) => {
    // Add an article with multiple HTML links
    const mockServer = getMockServer();
    mockServer.addArticle('tech-news', {
      title: 'Article with Multiple Links',
      description: 'Read the <a href="https://example.com/article">full article</a> and join the <a href="https://example.com/discussion">discussion</a>.',
      link: '/articles/multi-link-test',
    });

    // Add the feed
    await addFeed(`${mockServerUrl}/feeds/tech-news/rss`, 'Tech News', page);

    // Navigate to app
    await waitForPageLoad(page, workerUrl);
    await page.waitForTimeout(1000);

    // Find the article
    const articleCard = page.locator('.article-card', { hasText: 'Article with Multiple Links' });
    await expect(articleCard).toBeVisible();

    // Check both links are present
    const articleLink = articleCard.locator('.article-excerpt a[href="https://example.com/article"]');
    const discussionLink = articleCard.locator('.article-excerpt a[href="https://example.com/discussion"]');

    await expect(articleLink).toBeVisible();
    await expect(articleLink).toHaveText('full article');

    await expect(discussionLink).toBeVisible();
    await expect(discussionLink).toHaveText('discussion');

    console.log('✓ Multiple HTML links in description are all rendered');
  });
});

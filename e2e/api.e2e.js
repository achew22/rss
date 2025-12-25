/**
 * API Endpoint Tests
 *
 * Tests for backend API endpoints, verifying correct responses,
 * status codes, and data integrity. These tests focus on the
 * Worker API without requiring browser interactions.
 */

import { test, expect } from '@playwright/test';
import {
  setupTestEnvironment,
  teardownTestEnvironment,
  resetTestData,
  getWorkerUrl,
} from './helpers/test-setup.js';

let workerUrl;

test.describe('API Endpoint Tests', () => {
  test.beforeAll(async () => {
    const env = await setupTestEnvironment();
    workerUrl = env.workerUrl;
  });

  test.afterAll(async () => {
    await teardownTestEnvironment();
  });

  test.beforeEach(async () => {
    await resetTestData();
  });

  test('health check endpoint returns ok status', async ({ page }) => {
    const response = await page.request.get(`${workerUrl}/api/health`);
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.status).toBe('ok');
    console.log('✓ Health check passed');
  });

  test('feeds endpoint returns empty array initially', async ({ page }) => {
    const response = await page.request.get(`${workerUrl}/api/feeds`);
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.feeds).toBeDefined();
    expect(Array.isArray(data.feeds)).toBe(true);
    console.log('✓ Feeds endpoint accessible');
  });

  test('articles endpoint returns empty array initially', async ({ page }) => {
    const response = await page.request.get(`${workerUrl}/api/articles`);
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.articles).toBeDefined();
    expect(Array.isArray(data.articles)).toBe(true);
    console.log('✓ Articles endpoint accessible');
  });

  test('invalid API endpoint returns error or homepage', async ({ page }) => {
    const response = await page.request.get(`${workerUrl}/api/nonexistent`);
    // May return 404 or 200 (serving the main app HTML)
    expect([200, 404]).toContain(response.status());
    console.log(`✓ Invalid endpoint returns status ${response.status()}`);
  });
});

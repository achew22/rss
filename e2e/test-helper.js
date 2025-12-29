/**
 * E2E Test Helper
 *
 * This module provides utilities for e2e testing:
 * - Spinning up the RSS Worker using wrangler's unstable_dev
 * - Managing the mock RSS server
 * - Triggering cron jobs
 * - Test utilities
 */

import { unstable_dev } from 'wrangler';
import { createMockRssServer } from './mock-rss-server.js';

let worker = null;
let mockServer = null;

/**
 * Start the RSS Worker using Miniflare via wrangler's unstable_dev
 * @param {Object} options - Configuration options
 * @returns {Promise<Object>} Worker instance with fetch and scheduled methods
 */
export async function startWorker(options = {}) {
  const {
    port = 8787,
    persist = false,
  } = options;

  worker = await unstable_dev('src/index.js', {
    experimental: {
      disableExperimentalWarning: true,
    },
    local: true,
    persist,
    port,
  });

  return worker;
}

/**
 * Stop the RSS Worker
 */
export async function stopWorker() {
  if (worker) {
    await worker.stop();
    worker = null;
  }
}

/**
 * Start the mock RSS server
 * @param {number} port - Port to run the server on
 */
export async function startMockServer(port = 3001) {
  mockServer = createMockRssServer(port);
  await mockServer.start();
  return mockServer;
}

/**
 * Stop the mock RSS server
 */
export async function stopMockServer() {
  if (mockServer) {
    await mockServer.stop();
    mockServer = null;
  }
}

/**
 * Get the mock server instance
 */
export function getMockServer() {
  return mockServer;
}

/**
 * Get the worker instance
 */
export function getWorker() {
  return worker;
}

/**
 * Trigger the cron job on the worker
 * This simulates what happens when the scheduled trigger runs
 * Uses the /api/refresh endpoint which performs the same feed refresh
 * @param {Page} page - Optional Playwright page object for request context
 */
export async function triggerCron(page = null) {
  if (page) {
    return refreshAllFeeds(page);
  }

  if (!worker) {
    throw new Error('Worker not started. Call startWorker() first.');
  }

  // Use the API endpoint to refresh feeds (same as cron does)
  const response = await workerFetch('/api/refresh', { method: 'POST' });
  return response.json();
}

/**
 * Make a fetch request to the worker
 */
export async function workerFetch(path, options = {}) {
  // Use worker.fetch if available (for direct testing), otherwise use HTTP fetch
  if (worker) {
    const response = await worker.fetch(path, options);
    return response;
  }

  // Fallback to HTTP fetch using the worker URL from environment
  const workerUrl = process.env.E2E_WORKER_URL || 'http://localhost:8787';
  const url = path.startsWith('http') ? path : `${workerUrl}${path}`;
  const response = await fetch(url, options);
  return response;
}

/**
 * Get the worker URL for browser navigation
 */
export function getWorkerUrl() {
  if (!worker) {
    throw new Error('Worker not started. Call startWorker() first.');
  }
  // The worker.address provides the actual address
  return `http://${worker.address}`;
}

/**
 * Wait for a condition to be true
 */
export async function waitFor(conditionFn, timeout = 5000, interval = 100) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    if (await conditionFn()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw new Error('Timeout waiting for condition');
}

/**
 * Add a feed to the worker via API
 * @param {string} url - Feed URL
 * @param {string} name - Feed name
 * @param {Page} page - Optional Playwright page object for request context
 */
export async function addFeed(url, name, page = null) {
  if (page) {
    const workerUrl = process.env.E2E_WORKER_URL || 'http://localhost:8787';
    const response = await page.request.post(`${workerUrl}/api/feeds`, {
      data: { url, name },
    });
    return response.json();
  }

  const response = await workerFetch('/api/feeds', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url, name }),
  });
  return response.json();
}

/**
 * Get all feeds from the worker
 * @param {Page} page - Optional Playwright page object for request context
 */
export async function getFeeds(page = null) {
  if (page) {
    const workerUrl = process.env.E2E_WORKER_URL || 'http://localhost:8787';
    const response = await page.request.get(`${workerUrl}/api/feeds`);
    return response.json();
  }

  const response = await workerFetch('/api/feeds');
  return response.json();
}

/**
 * Get all articles from the worker
 * @param {string|null} feedId - Optional feed ID filter
 * @param {boolean} starredOnly - Only starred articles
 * @param {Page} page - Optional Playwright page object for request context
 */
export async function getArticles(feedId = null, starredOnly = false, page = null) {
  let path = '/api/articles';
  const params = new URLSearchParams();
  if (feedId) params.set('feedId', feedId);
  if (starredOnly) params.set('starred', 'true');
  if (params.toString()) path += `?${params.toString()}`;

  if (page) {
    const workerUrl = process.env.E2E_WORKER_URL || 'http://localhost:8787';
    const response = await page.request.get(`${workerUrl}${path}`);
    return response.json();
  }

  const response = await workerFetch(path);
  return response.json();
}

/**
 * Refresh all feeds via API
 * @param {Page} page - Optional Playwright page object for request context
 */
export async function refreshAllFeeds(page = null) {
  if (page) {
    const workerUrl = process.env.E2E_WORKER_URL || 'http://localhost:8787';
    const response = await page.request.post(`${workerUrl}/api/refresh`);
    return response.json();
  }

  const response = await workerFetch('/api/refresh', {
    method: 'POST',
  });
  return response.json();
}

/**
 * Delete a feed by ID
 * @param {string} feedId - Feed ID to delete
 * @param {Page} page - Optional Playwright page object for request context
 */
export async function deleteFeed(feedId, page = null) {
  if (page) {
    const workerUrl = process.env.E2E_WORKER_URL || 'http://localhost:8787';
    const response = await page.request.delete(`${workerUrl}/api/feeds/${feedId}`);
    return response.json();
  }

  const response = await workerFetch(`/api/feeds/${feedId}`, {
    method: 'DELETE',
  });
  return response.json();
}

/**
 * Toggle star status on an article
 * @param {string} articleId - Article ID
 * @param {Page} page - Optional Playwright page object for request context
 */
export async function toggleStar(articleId, page = null) {
  if (page) {
    const workerUrl = process.env.E2E_WORKER_URL || 'http://localhost:8787';
    const response = await page.request.post(`${workerUrl}/api/articles/${articleId}/star`);
    return response.json();
  }

  const response = await workerFetch(`/api/articles/${articleId}/star`, {
    method: 'POST',
  });
  return response.json();
}

export default {
  startWorker,
  stopWorker,
  startMockServer,
  stopMockServer,
  getMockServer,
  getWorker,
  triggerCron,
  workerFetch,
  getWorkerUrl,
  waitFor,
  addFeed,
  getFeeds,
  getArticles,
  refreshAllFeeds,
  deleteFeed,
  toggleStar,
};

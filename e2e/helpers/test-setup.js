/**
 * Shared Test Setup
 *
 * Provides common setup and teardown logic for all e2e tests.
 * This ensures consistent test environment across all test files.
 *
 * Note: The actual servers are started/stopped by global-setup.js and global-teardown.js.
 * This module just provides access to the URLs and reset functionality.
 */

import { getMockServer } from '../test-helper.js';

/**
 * Get test environment URLs
 * Call this in test.beforeAll() in each test file
 *
 * The servers are started by global-setup.js before any tests run.
 */
export async function setupTestEnvironment() {
  const workerUrl = process.env.E2E_WORKER_URL || 'http://localhost:8787';
  const mockServerUrl = process.env.E2E_MOCK_SERVER_URL || 'http://localhost:3001';

  return { workerUrl, mockServerUrl };
}

/**
 * Teardown is now handled by global-teardown.js
 * This is a no-op for backwards compatibility
 */
export async function teardownTestEnvironment() {
  // No-op: teardown is handled by global-teardown.js
}

/**
 * Reset test data between tests
 * Call this in test.beforeEach() if needed
 */
export async function resetTestData() {
  const mockServer = getMockServer();
  if (mockServer) {
    mockServer.reset();
  }
}

/**
 * Get the worker URL
 */
export function getWorkerUrl() {
  return process.env.E2E_WORKER_URL || 'http://localhost:8787';
}

/**
 * Get the mock server URL
 */
export function getMockServerUrl() {
  return process.env.E2E_MOCK_SERVER_URL || 'http://localhost:3001';
}

export default {
  setupTestEnvironment,
  teardownTestEnvironment,
  resetTestData,
  getWorkerUrl,
  getMockServerUrl,
};

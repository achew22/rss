/**
 * Shared E2E Test Setup
 *
 * This module provides reusable setup and teardown functions for E2E tests.
 * Each test file should import and use these functions in their beforeAll/afterAll hooks.
 */

import {
  startWorker,
  stopWorker,
  startMockServer,
  stopMockServer,
  getMockServer,
} from './test-helper.js';

/**
 * Initialize the test environment
 * Starts the mock RSS server and the RSS Worker
 */
export async function setupTestEnvironment() {
  console.log('Starting test setup...');

  // Start the mock RSS server first
  const mockServer = await startMockServer(3001);
  console.log(`Mock RSS server started at ${mockServer.getUrl()}`);

  // Start the worker
  console.log('Starting RSS Worker...');
  await startWorker({ port: 8787 });
  console.log(`RSS Worker started at http://localhost:8787`);

  // Give servers time to fully initialize
  await new Promise(resolve => setTimeout(resolve, 2000));
  console.log('Test setup complete');
}

/**
 * Cleanup the test environment
 * Stops the worker and mock server
 */
export async function teardownTestEnvironment() {
  console.log('Cleaning up...');
  await stopWorker();
  await stopMockServer();
  console.log('Servers stopped');
}

/**
 * Reset state between tests
 * Resets the mock server to its initial state
 */
export async function resetBetweenTests() {
  const mockServer = getMockServer();
  if (mockServer) {
    mockServer.reset();
  }
}

/**
 * Playwright Global Setup
 *
 * This file runs once before all tests start.
 * It starts the worker and mock server that will be shared across all test files.
 */

import { startWorker, startMockServer } from './test-helper.js';

export default async function globalSetup() {
  console.log('Global Setup: Starting servers...');

  // Start the mock RSS server
  const mockServer = await startMockServer(3001);
  const mockServerUrl = mockServer.getUrl();
  console.log(`Mock RSS server started at ${mockServerUrl}`);

  // Start the worker
  const worker = await startWorker({ port: 8787 });
  const workerUrl = `http://localhost:8787`;
  console.log(`RSS Worker started at ${workerUrl}`);

  // Give servers time to fully initialize
  await new Promise(resolve => setTimeout(resolve, 2000));
  console.log('Global Setup: Servers ready');

  // Store URLs in process.env for tests to access
  process.env.E2E_WORKER_URL = workerUrl;
  process.env.E2E_MOCK_SERVER_URL = mockServerUrl;
}

/**
 * Playwright Global Teardown
 *
 * This file runs once after all tests complete.
 * It stops the worker and mock server.
 */

import { stopWorker, stopMockServer } from './test-helper.js';

export default async function globalTeardown() {
  console.log('Global Teardown: Stopping servers...');
  await stopWorker();
  await stopMockServer();
  console.log('Global Teardown: Servers stopped');
}

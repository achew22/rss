import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for E2E tests
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  // Look for test files in the e2e directory
  testDir: './e2e',

  // Match test files
  testMatch: '**/*.e2e.js',

  // Run tests in parallel
  fullyParallel: false,

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,

  // Retry on CI only
  retries: process.env.CI ? 2 : 0,

  // Opt out of parallel tests on CI - we need sequential for worker management
  workers: 1,

  // Reporter to use
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
  ],

  // Shared settings for all the projects below
  use: {
    // Base URL to use in actions like `await page.goto('/')`
    baseURL: 'http://localhost:8787',

    // Collect trace when retrying the failed test
    trace: 'on-first-retry',

    // Take screenshots on failure
    screenshot: 'on',

    // Video on first retry
    video: 'on-first-retry',
  },

  // Configure projects for major browsers
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Output folder for screenshots and other artifacts
  outputDir: './e2e/test-results',

  // Global timeout for each test
  timeout: 60000,

  // Timeout for expect() assertions
  expect: {
    timeout: 10000,
  },

  // Folder for test artifacts such as screenshots, videos, traces
  snapshotDir: './e2e/snapshots',
});

# Claude Code Instructions

This file contains instructions for Claude Code when working on this repository.

## Project Overview

This is an RSS Reader application built on Cloudflare Workers. It includes:

- **Backend**: Cloudflare Worker that serves API endpoints and handles RSS/Atom feed parsing
- **Frontend**: Vanilla JavaScript SPA served as static assets
- **Storage**: Cloudflare KV for persisting feeds, articles, and starred items
- **Cron**: Automatic feed refresh every 15 minutes

## Development Commands

```bash
# Start local development server
npm run dev

# Run unit tests
npm test

# Run integration tests (against deployed URL)
npm run test:integration

# Run E2E tests with Playwright
npm run test:e2e

# Run E2E tests in headed mode (visible browser)
npm run test:e2e:headed

# Run E2E tests with UI
npm run test:e2e:ui

# Deploy to Cloudflare
npm run deploy
```

## Testing

### Unit Tests
Located in `src/*.test.js`, run with Vitest using the Cloudflare Workers pool.

### Integration Tests
Located in `src/integration.test.js`, run against the deployed worker.

### E2E Tests
Located in `e2e/*.e2e.js`, run with Playwright. These tests:
1. Spin up a fresh RSS Worker using Miniflare for each test (via wrangler's unstable_dev)
2. Spin up a mock RSS feed server with sample feeds (shared across all tests)
3. Test the full application flow in a real browser
4. Take screenshots demonstrating functionality

**Test Isolation:**
- Each test gets a fresh Miniflare instance with clean KV storage (started in `beforeEach()`)
- This ensures complete test isolation without needing to manually clear data
- The worker is stopped after each test in `afterEach()`
- The mock RSS server is shared across all tests and reset between tests

**E2E Screenshots Workflow:**
- Screenshots are automatically generated when E2E tests run
- **CI generates canonical screenshots**: After successful E2E tests, GitHub Actions commits updated screenshots
- **Local development**: You can run `npm run test:e2e` locally to verify tests pass, but screenshots may differ slightly due to environment differences
- **Best practice**: Let CI generate and commit screenshots for consistency. If you need to update screenshots, ensure E2E tests pass in CI.

E2E test artifacts (screenshots, reports) are uploaded as GitHub Actions artifacts.

## Pull Request Workflow

### IMPORTANT: Run Tests Locally Before Pushing

Before pushing any changes:

1. **Run unit tests locally** and ensure they pass:
   ```bash
   npm test
   ```

2. **Optionally run E2E tests locally** to verify browser functionality:
   ```bash
   npm run test:e2e
   ```
   Note: E2E tests may fail in certain environments (e.g., restricted proxies). If E2E tests fail locally but unit tests pass, push your changes and verify E2E tests pass in CI.

3. **Do NOT push if unit tests are failing locally** - Fix the issues first

4. **The task is NOT complete if local unit tests fail**

### IMPORTANT: Monitor CI Checks After Pushing

After pushing a PR or commits to a branch:

1. **Watch the CI checks** - Do not consider the task complete until all checks pass
2. **Use GitHub CLI to monitor status**:
   ```bash
   # Check PR status and CI results
   gh pr view --json statusCheckRollup

   # List workflow runs for the current branch
   gh run list --branch <branch-name>

   # View specific run details
   gh run view <run-id>

   # View run logs if there are failures
   gh run view <run-id> --log-failed
   ```

3. **If checks fail**:
   - Investigate the failure using `gh run view <run-id> --log-failed`
   - Fix the issues in your code
   - Commit and push the fixes
   - Wait for the new CI run to complete
   - Repeat until all checks pass

4. **The task is NOT complete if any CI checks are failing**

### Using Cloudflare CLI

You have access to the Cloudflare API via the `CLOUDFLARE_API_TOKEN` environment variable. You can use wrangler commands to:

```bash
# View deployment logs
wrangler tail

# Check worker status
wrangler whoami
```

## Code Style

- No frameworks on the frontend (vanilla JS)
- No external dependencies in the worker (uses native Cloudflare APIs)
- Use ESM modules
- Follow existing patterns in the codebase

## New Feature Requirements

**IMPORTANT: All new features must include E2E tests.**

When adding a new feature:
1. Implement the feature in both backend and frontend code
2. Add comprehensive E2E tests in `e2e/rss-app.e2e.js` that demonstrate the feature working
3. Tests should include screenshots showing the feature in action
4. Tests should verify both UI behavior and data persistence where applicable

This ensures that new features are properly tested and documented through executable examples.

## Key Files

- `src/index.js` - Main Worker entry point with API routes
- `public/js/app.js` - Frontend SPA
- `public/css/style.css` - Styling
- `wrangler.toml` - Cloudflare Workers configuration
- `e2e/` - E2E tests and helpers
  - `mock-rss-server.js` - Mock RSS feed server for testing
  - `test-helper.js` - Helper functions for E2E tests
  - `rss-app.e2e.js` - Playwright test file

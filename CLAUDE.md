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
1. Spin up the RSS Worker using Miniflare (via wrangler's unstable_dev)
2. Spin up a mock RSS feed server with sample feeds
3. Test the full application flow in a real browser
4. Take screenshots demonstrating functionality

E2E test artifacts (screenshots, reports) are uploaded as GitHub Actions artifacts.

## Pull Request Workflow

### IMPORTANT: Run Tests Locally Before Pushing

Before pushing any changes:

1. **Run unit tests locally** and ensure they pass:
   ```bash
   npm test
   ```

2. **Do NOT push if tests are failing locally** - Fix the issues first

3. **The task is NOT complete if local tests fail**

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

## Key Files

- `src/index.js` - Main Worker entry point with API routes
- `public/js/app.js` - Frontend SPA
- `public/css/style.css` - Styling
- `wrangler.toml` - Cloudflare Workers configuration
- `e2e/` - E2E tests and helpers
  - `mock-rss-server.js` - Mock RSS feed server for testing
  - `test-helper.js` - Helper functions for E2E tests
  - `rss-app.e2e.js` - Playwright test file

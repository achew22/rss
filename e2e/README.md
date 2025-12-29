# E2E Tests

End-to-end tests for the RSS Reader application using Playwright.

## Structure

The e2e tests are organized into logical subsystems and user behaviors:

### Test Files

- **`api.e2e.js`** - API endpoint tests
  - Health check endpoint
  - Feeds API validation
  - Articles API validation
  - Error handling

- **`feed-management.e2e.js`** - Feed subscription and management
  - Adding RSS feeds
  - Adding Atom feeds
  - Viewing feed lists
  - Managing multiple subscriptions

- **`ui-navigation.e2e.js`** - UI and navigation
  - Homepage rendering
  - Desktop layout
  - Mobile responsive design
  - Mobile hamburger menu
  - Navigation between views

- **`feed-refresh.e2e.js`** - Feed refresh and cron functionality
  - Cron job execution
  - Manual feed refresh
  - Multiple feed refresh
  - Article persistence

### Helper Modules

#### `helpers/test-setup.js`
Shared setup and teardown logic for all tests:
- `setupTestEnvironment()` - Starts worker and mock server
- `teardownTestEnvironment()` - Stops servers
- `resetTestData()` - Clears test data between tests

#### `helpers/page-helpers.js`
Page object patterns and UI interaction utilities:
- Navigation helpers (routes, links)
- Screenshot utilities
- Viewport management (mobile, desktop)
- Element visibility and interaction helpers

#### `test-helper.js`
Worker and API interaction utilities:
- Worker lifecycle management
- Mock server management
- API operations (feeds, articles, refresh)
- Cron triggering

#### `mock-rss-server.js`
Mock RSS/Atom feed server for testing:
- Serves sample RSS and Atom feeds
- Dynamic article injection
- Multiple feed support

## Running Tests

```bash
# Run all e2e tests
npm run test:e2e

# Run in headed mode (visible browser)
npm run test:e2e:headed

# Run with Playwright UI
npm run test:e2e:ui

# Run in debug mode
npm run test:e2e:debug

# Run specific test file
npx playwright test api.e2e.js
npx playwright test feed-management.e2e.js
npx playwright test ui-navigation.e2e.js
npx playwright test feed-refresh.e2e.js
```

## Test Architecture

### Setup/Teardown Flow

1. **Global Setup** (per test file)
   - `setupTestEnvironment()` starts worker and mock server
   - Shared across all tests in the file

2. **Per-Test Reset**
   - `resetTestData()` clears dynamic data
   - Ensures test isolation

3. **Global Teardown**
   - `teardownTestEnvironment()` stops servers
   - Cleanup after all tests complete

### Test Organization

Tests are organized by **functionality** and **user behavior**:
- **API tests** focus on backend endpoints
- **Feed management tests** focus on CRUD operations
- **UI tests** focus on frontend rendering and interaction
- **Refresh tests** focus on background jobs and updates

This structure makes tests:
- **Easier to find** - grouped by feature area
- **Easier to maintain** - related tests are together
- **Easier to run** - can run specific subsystems
- **Easier to debug** - isolated concerns

## Adding New Tests

1. **Choose the appropriate test file** based on what you're testing
2. **Use helpers** from `helpers/` for common operations
3. **Follow existing patterns** for consistency
4. **Add screenshots** for visual verification when appropriate

Example:
```javascript
import { test, expect } from '@playwright/test';
import { setupTestEnvironment, teardownTestEnvironment, getWorkerUrl } from './helpers/test-setup.js';
import { takeScreenshot } from './helpers/page-helpers.js';

test.describe('My Feature Tests', () => {
  let workerUrl;

  test.beforeAll(async () => {
    const env = await setupTestEnvironment();
    workerUrl = env.workerUrl;
  });

  test.afterAll(async () => {
    await teardownTestEnvironment();
  });

  test('my test', async ({ page }) => {
    await page.goto(workerUrl);
    await takeScreenshot(page, 'my-feature-test');
    // ... test assertions
  });
});
```

## Screenshots

Screenshots are saved to `e2e/screenshots/` with descriptive names:
- Format: `[category]-[number]-[description].png`
- Examples:
  - `ui-01-homepage.png`
  - `feed-management-02-atom-feed.png`
  - `feed-refresh-01-after-cron.png`

## CI/CD Integration

Tests run automatically in GitHub Actions:
- Screenshots and test results are uploaded as artifacts
- Tests run sequentially (not parallel) due to shared worker instance
- Retries are enabled on CI for flaky test resilience

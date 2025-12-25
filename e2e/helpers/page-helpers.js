/**
 * Page Helpers
 *
 * Provides reusable page object patterns and common UI interactions
 * for Playwright tests. This follows the Page Object Model pattern
 * to make tests more maintainable and readable.
 */

/**
 * Navigate to a specific route in the RSS app
 * @param {Page} page - Playwright page object
 * @param {string} route - Route to navigate to (e.g., '#/feeds', '#/starred')
 * @param {string} workerUrl - Base URL of the worker
 */
export async function navigateToRoute(page, route, workerUrl) {
  await page.goto(`${workerUrl}/${route}`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(500);
}

/**
 * Click a navigation link and wait for the page to update
 * @param {Page} page - Playwright page object
 * @param {string} href - The href value of the link (e.g., '#/feeds')
 */
export async function clickNavLink(page, href) {
  await page.click(`a[href="${href}"]`);
  await page.waitForTimeout(1000);
}

/**
 * Take a screenshot with consistent naming
 * @param {Page} page - Playwright page object
 * @param {string} name - Name for the screenshot (without extension)
 * @param {Object} options - Screenshot options
 */
export async function takeScreenshot(page, name, options = {}) {
  const defaultOptions = {
    path: `e2e/screenshots/${name}.png`,
    fullPage: true,
  };
  await page.screenshot({ ...defaultOptions, ...options });
  console.log(`Screenshot: ${name}.png`);
}

/**
 * Set viewport to mobile size
 * @param {Page} page - Playwright page object
 * @param {Object} size - Viewport size (default: iPhone SE)
 */
export async function setMobileViewport(page, size = { width: 375, height: 667 }) {
  await page.setViewportSize(size);
}

/**
 * Set viewport to desktop size
 * @param {Page} page - Playwright page object
 * @param {Object} size - Viewport size
 */
export async function setDesktopViewport(page, size = { width: 1280, height: 720 }) {
  await page.setViewportSize(size);
}

/**
 * Toggle the mobile hamburger menu
 * @param {Page} page - Playwright page object
 */
export async function toggleMobileMenu(page) {
  const hamburger = page.locator('.hamburger-btn');
  if (await hamburger.count() > 0) {
    await hamburger.click();
    await page.waitForTimeout(300);
    return true;
  }
  return false;
}

/**
 * Wait for the page to be fully loaded
 * @param {Page} page - Playwright page object
 * @param {string} workerUrl - Base URL of the worker
 */
export async function waitForPageLoad(page, workerUrl) {
  await page.goto(workerUrl, { waitUntil: 'networkidle', timeout: 30000 });

  // Wait for key elements to be visible
  const h1 = page.locator('h1');
  await h1.waitFor({ state: 'visible', timeout: 10000 });
}

/**
 * Check if an element is visible on the page
 * @param {Page} page - Playwright page object
 * @param {string} selector - CSS selector
 * @returns {Promise<boolean>}
 */
export async function isElementVisible(page, selector) {
  const element = page.locator(selector);
  try {
    await element.waitFor({ state: 'visible', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get text content from an element
 * @param {Page} page - Playwright page object
 * @param {string} selector - CSS selector
 * @returns {Promise<string>}
 */
export async function getElementText(page, selector) {
  return await page.locator(selector).textContent();
}

/**
 * Count elements matching a selector
 * @param {Page} page - Playwright page object
 * @param {string} selector - CSS selector
 * @returns {Promise<number>}
 */
export async function countElements(page, selector) {
  return await page.locator(selector).count();
}

/**
 * Wait for a specific number of elements
 * @param {Page} page - Playwright page object
 * @param {string} selector - CSS selector
 * @param {number} count - Expected count
 * @param {number} timeout - Timeout in milliseconds
 */
export async function waitForElementCount(page, selector, count, timeout = 5000) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    const currentCount = await countElements(page, selector);
    if (currentCount === count) {
      return true;
    }
    await page.waitForTimeout(100);
  }
  throw new Error(`Timeout waiting for ${count} elements matching ${selector}`);
}

export default {
  navigateToRoute,
  clickNavLink,
  takeScreenshot,
  setMobileViewport,
  setDesktopViewport,
  toggleMobileMenu,
  waitForPageLoad,
  isElementVisible,
  getElementText,
  countElements,
  waitForElementCount,
};

/**
 * Storage abstraction layer for RSS Reader
 *
 * This module provides a clean CRUD interface over Cloudflare KV,
 * encapsulating all index maintenance and key structure complexity.
 *
 * All operations are designed for a GET-optimized architecture:
 * - No LIST operations (uses tracked "feeds" registry)
 * - Hierarchical keys (articles nested under feeds)
 * - Object-wrapped values (for future extensibility)
 * - Per-user data isolation
 */

const DEFAULT_USER_ID = "default";

/**
 * Fake KV implementation for testing
 * Uses a simple dictionary to mock KV operations
 */
export class FakeKV {
  constructor() {
    this.store = new Map();
  }

  async get(key) {
    return this.store.get(key) || null;
  }

  async put(key, value) {
    this.store.set(key, value);
  }

  async delete(key) {
    this.store.delete(key);
  }

  async list({ prefix = "" } = {}) {
    const keys = Array.from(this.store.keys())
      .filter(key => key.startsWith(prefix))
      .map(name => ({ name }));
    return { keys };
  }

  // Helper for testing
  clear() {
    this.store.clear();
  }

  // Helper for testing - get raw value
  getRaw(key) {
    return this.store.get(key);
  }
}

/**
 * Storage layer for RSS Reader
 * Provides CRUD operations and encapsulates index maintenance
 */
export class Storage {
  constructor(kv) {
    this.kv = kv;
  }

  // ============================================================================
  // FEEDS OPERATIONS
  // ============================================================================

  /**
   * Get all feeds metadata
   * @returns {Promise<Array>} Array of feed objects
   */
  async getFeeds() {
    const data = await this.kv.get("feeds");
    if (!data) return [];
    return JSON.parse(data);
  }

  /**
   * Add a new feed
   * @param {Object} feed - Feed object {id, name, url}
   * @returns {Promise<void>}
   */
  async addFeed(feed) {
    // Add to feeds registry
    const feeds = await this.getFeeds();
    feeds.push({
      id: feed.id,
      name: feed.name,
      url: feed.url,
      lastFetched: feed.lastFetched || null,
    });
    await this.kv.put("feeds", JSON.stringify(feeds));

    // Create feed index
    await this.kv.put(
      `feed:${feed.id}`,
      JSON.stringify({
        id: feed.id,
        name: feed.name,
        url: feed.url,
        lastFetched: feed.lastFetched || null,
        articles: [],
      })
    );
  }

  /**
   * Remove a feed and all its articles
   * @param {string} feedId - Feed ID to remove
   * @returns {Promise<void>}
   */
  async removeFeed(feedId) {
    // Remove from feeds registry
    const feeds = await this.getFeeds();
    const updatedFeeds = feeds.filter(f => f.id !== feedId);
    await this.kv.put("feeds", JSON.stringify(updatedFeeds));

    // Get feed index to find all articles
    const feedIndex = await this.getFeedIndex(feedId);
    if (feedIndex) {
      // Delete all articles
      for (const article of feedIndex.articles) {
        await this.kv.delete(`feed:${feedId}:article:${article.id}`);
      }
    }

    // Delete feed index
    await this.kv.delete(`feed:${feedId}`);
  }

  /**
   * Update feed metadata (lastFetched, etc.)
   * @param {string} feedId - Feed ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<void>}
   */
  async updateFeedMetadata(feedId, updates) {
    // Update in feeds registry
    const feeds = await this.getFeeds();
    const feed = feeds.find(f => f.id === feedId);
    if (feed) {
      Object.assign(feed, updates);
      await this.kv.put("feeds", JSON.stringify(feeds));
    }

    // Update in feed index
    const feedIndex = await this.getFeedIndex(feedId);
    if (feedIndex) {
      Object.assign(feedIndex, updates);
      await this.kv.put(`feed:${feedId}`, JSON.stringify(feedIndex));
    }
  }

  // ============================================================================
  // FEED INDEX OPERATIONS
  // ============================================================================

  /**
   * Get feed index (metadata + article references)
   * @param {string} feedId - Feed ID
   * @returns {Promise<Object|null>} Feed index or null
   */
  async getFeedIndex(feedId) {
    const data = await this.kv.get(`feed:${feedId}`);
    if (!data) return null;
    return JSON.parse(data);
  }

  /**
   * Add article reference to feed index
   * @param {string} feedId - Feed ID
   * @param {Object} articleRef - {id, timestamp}
   * @returns {Promise<void>}
   */
  async addArticleToFeedIndex(feedId, articleRef) {
    const feedIndex = await this.getFeedIndex(feedId);
    if (!feedIndex) {
      throw new Error(`Feed ${feedId} not found`);
    }

    // Check if article already exists
    if (feedIndex.articles.some(a => a.id === articleRef.id)) {
      return; // Already exists, skip
    }

    // Add to articles array and sort by timestamp DESC (newest first)
    feedIndex.articles.push({
      id: articleRef.id,
      timestamp: articleRef.timestamp,
    });
    feedIndex.articles.sort((a, b) => b.timestamp - a.timestamp);

    await this.kv.put(`feed:${feedId}`, JSON.stringify(feedIndex));
  }

  // ============================================================================
  // ARTICLE OPERATIONS
  // ============================================================================

  /**
   * Save an article (creates or updates)
   * Automatically maintains feed index
   * @param {Object} article - Full article object
   * @returns {Promise<void>}
   */
  async saveArticle(article) {
    // Save article
    await this.kv.put(
      `feed:${article.feedId}:article:${article.id}`,
      JSON.stringify(article)
    );

    // Update feed index
    await this.addArticleToFeedIndex(article.feedId, {
      id: article.id,
      timestamp: article.timestamp,
    });
  }

  /**
   * Get a single article by ID
   * @param {string} feedId - Feed ID
   * @param {string} articleId - Article ID
   * @returns {Promise<Object|null>} Article or null
   */
  async getArticle(feedId, articleId) {
    const data = await this.kv.get(`feed:${feedId}:article:${articleId}`);
    if (!data) return null;
    return JSON.parse(data);
  }

  /**
   * Get multiple articles by IDs (batch operation)
   * @param {Array<{feedId: string, articleId: string}>} refs - Array of article references
   * @returns {Promise<Array>} Array of articles (nulls filtered out)
   */
  async getArticles(refs) {
    const promises = refs.map(ref =>
      this.getArticle(ref.feedId, ref.articleId)
    );
    const articles = await Promise.all(promises);
    return articles.filter(a => a !== null);
  }

  /**
   * Check if an article exists
   * @param {string} feedId - Feed ID
   * @param {string} articleId - Article ID
   * @returns {Promise<boolean>}
   */
  async articleExists(feedId, articleId) {
    const article = await this.getArticle(feedId, articleId);
    return article !== null;
  }

  /**
   * Get articles for a feed with pagination
   * @param {string} feedId - Feed ID
   * @param {number} limit - Max articles to return
   * @param {number} offset - Offset for pagination
   * @returns {Promise<Array>} Array of articles
   */
  async getFeedArticles(feedId, limit = 50, offset = 0) {
    const feedIndex = await this.getFeedIndex(feedId);
    if (!feedIndex) return [];

    const articleRefs = feedIndex.articles.slice(offset, offset + limit);
    const refs = articleRefs.map(ref => ({
      feedId,
      articleId: ref.id,
    }));

    return this.getArticles(refs);
  }

  // ============================================================================
  // USER SUBSCRIPTION OPERATIONS
  // ============================================================================

  /**
   * Get user subscriptions
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Subscriptions object {feeds: [...]}
   */
  async getUserSubscriptions(userId = DEFAULT_USER_ID) {
    const data = await this.kv.get(`user:${userId}:subscriptions`);
    if (!data) return { feeds: [] };
    return JSON.parse(data);
  }

  /**
   * Save user subscriptions
   * @param {Object} subscriptions - Subscriptions object
   * @param {string} userId - User ID
   * @returns {Promise<void>}
   */
  async saveUserSubscriptions(subscriptions, userId = DEFAULT_USER_ID) {
    await this.kv.put(
      `user:${userId}:subscriptions`,
      JSON.stringify(subscriptions)
    );
  }

  /**
   * Add a subscription for a user
   * @param {string} feedId - Feed ID to subscribe to
   * @param {string} userId - User ID
   * @returns {Promise<void>}
   */
  async addUserSubscription(feedId, userId = DEFAULT_USER_ID) {
    const subs = await this.getUserSubscriptions(userId);

    // Check if already subscribed
    if (subs.feeds.some(f => f.feedId === feedId)) {
      return; // Already subscribed
    }

    subs.feeds.push({
      feedId,
      caughtUpToTimestamp: 0,
      manuallyReadBefore: [],
    });

    await this.saveUserSubscriptions(subs, userId);
  }

  /**
   * Remove a subscription for a user
   * @param {string} feedId - Feed ID to unsubscribe from
   * @param {string} userId - User ID
   * @returns {Promise<void>}
   */
  async removeUserSubscription(feedId, userId = DEFAULT_USER_ID) {
    const subs = await this.getUserSubscriptions(userId);
    subs.feeds = subs.feeds.filter(f => f.feedId !== feedId);
    await this.saveUserSubscriptions(subs, userId);
  }

  /**
   * Update subscription watermark (caught up to timestamp)
   * @param {string} feedId - Feed ID
   * @param {number} timestamp - Watermark timestamp
   * @param {string} userId - User ID
   * @returns {Promise<void>}
   */
  async updateSubscriptionWatermark(feedId, timestamp, userId = DEFAULT_USER_ID) {
    const subs = await this.getUserSubscriptions(userId);
    const sub = subs.feeds.find(f => f.feedId === feedId);
    if (sub) {
      sub.caughtUpToTimestamp = timestamp;
      await this.saveUserSubscriptions(subs, userId);
    }
  }

  /**
   * Add article to manually read before list
   * @param {string} feedId - Feed ID
   * @param {string} articleId - Article ID
   * @param {string} userId - User ID
   * @returns {Promise<void>}
   */
  async addManuallyReadBefore(feedId, articleId, userId = DEFAULT_USER_ID) {
    const subs = await this.getUserSubscriptions(userId);
    const sub = subs.feeds.find(f => f.feedId === feedId);
    if (sub && !sub.manuallyReadBefore.includes(articleId)) {
      sub.manuallyReadBefore.push(articleId);
      await this.saveUserSubscriptions(subs, userId);
    }
  }

  /**
   * Remove article from manually read before list
   * @param {string} feedId - Feed ID
   * @param {string} articleId - Article ID
   * @param {string} userId - User ID
   * @returns {Promise<void>}
   */
  async removeManuallyReadBefore(feedId, articleId, userId = DEFAULT_USER_ID) {
    const subs = await this.getUserSubscriptions(userId);
    const sub = subs.feeds.find(f => f.feedId === feedId);
    if (sub) {
      sub.manuallyReadBefore = sub.manuallyReadBefore.filter(id => id !== articleId);
      await this.saveUserSubscriptions(subs, userId);
    }
  }

  // ============================================================================
  // USER STARRED OPERATIONS
  // ============================================================================

  /**
   * Get user starred articles
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Starred object {articles: [...]}
   */
  async getUserStarred(userId = DEFAULT_USER_ID) {
    const data = await this.kv.get(`user:${userId}:starred`);
    if (!data) return { articles: [] };
    return JSON.parse(data);
  }

  /**
   * Add article to starred
   * @param {string} articleId - Article ID
   * @param {string} userId - User ID
   * @returns {Promise<void>}
   */
  async addStarredArticle(articleId, userId = DEFAULT_USER_ID) {
    const starred = await this.getUserStarred(userId);
    if (!starred.articles.includes(articleId)) {
      starred.articles.push(articleId);
      await this.kv.put(`user:${userId}:starred`, JSON.stringify(starred));
    }
  }

  /**
   * Remove article from starred
   * @param {string} articleId - Article ID
   * @param {string} userId - User ID
   * @returns {Promise<void>}
   */
  async removeStarredArticle(articleId, userId = DEFAULT_USER_ID) {
    const starred = await this.getUserStarred(userId);
    starred.articles = starred.articles.filter(id => id !== articleId);
    await this.kv.put(`user:${userId}:starred`, JSON.stringify(starred));
  }

  /**
   * Check if article is starred
   * @param {string} articleId - Article ID
   * @param {string} userId - User ID
   * @returns {Promise<boolean>}
   */
  async isArticleStarred(articleId, userId = DEFAULT_USER_ID) {
    const starred = await this.getUserStarred(userId);
    return starred.articles.includes(articleId);
  }

  // ============================================================================
  // USER READ OPERATIONS (Hybrid: Manual List)
  // ============================================================================

  /**
   * Get user read articles
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Read object {articles: [...]}
   */
  async getUserRead(userId = DEFAULT_USER_ID) {
    const data = await this.kv.get(`user:${userId}:read`);
    if (!data) return { articles: [] };
    return JSON.parse(data);
  }

  /**
   * Add article to read list
   * @param {string} articleId - Article ID
   * @param {string} userId - User ID
   * @returns {Promise<void>}
   */
  async addReadArticle(articleId, userId = DEFAULT_USER_ID) {
    const read = await this.getUserRead(userId);
    if (!read.articles.includes(articleId)) {
      read.articles.push(articleId);
      await this.kv.put(`user:${userId}:read`, JSON.stringify(read));
    }
  }

  /**
   * Remove article from read list
   * @param {string} articleId - Article ID
   * @param {string} userId - User ID
   * @returns {Promise<void>}
   */
  async removeReadArticle(articleId, userId = DEFAULT_USER_ID) {
    const read = await this.getUserRead(userId);
    read.articles = read.articles.filter(id => id !== articleId);
    await this.kv.put(`user:${userId}:read`, JSON.stringify(read));
  }

  /**
   * Check if article is read
   * @param {string} articleId - Article ID
   * @param {string} userId - User ID
   * @returns {Promise<boolean>}
   */
  async isArticleRead(articleId, userId = DEFAULT_USER_ID) {
    const read = await this.getUserRead(userId);
    return read.articles.includes(articleId);
  }

  // ============================================================================
  // HELPER OPERATIONS
  // ============================================================================

  /**
   * Clear all data (for testing)
   * @returns {Promise<void>}
   */
  async clearAll() {
    if (this.kv.clear) {
      this.kv.clear();
    } else {
      // For real KV, delete all keys
      const allKeys = await this.kv.list();
      for (const key of allKeys.keys) {
        await this.kv.delete(key.name);
      }
    }
  }
}

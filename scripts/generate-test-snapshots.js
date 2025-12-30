#!/usr/bin/env node
/**
 * Generate KV snapshots for each test case
 *
 * This script recreates the KV state from each test case and saves it as JSON.
 * It runs outside the Cloudflare Workers test environment, allowing filesystem access.
 */

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

// Import our Storage and FakeKV classes
class FakeKV {
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
      .filter((key) => key.startsWith(prefix))
      .map((name) => ({ name }));
    return { keys };
  }
  clear() {
    this.store.clear();
  }
}

class Storage {
  constructor(kv) {
    this.kv = kv;
  }
  async getFeeds() {
    const data = await this.kv.get("feeds");
    if (!data) return [];
    return JSON.parse(data);
  }
  async addFeed(feed) {
    const feeds = await this.getFeeds();
    feeds.push({
      id: feed.id,
      name: feed.name,
      url: feed.url,
      lastFetched: feed.lastFetched || null,
    });
    await this.kv.put("feeds", JSON.stringify(feeds));
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
  async getFeedIndex(feedId) {
    const data = await this.kv.get(`feed:${feedId}`);
    if (!data) return null;
    return JSON.parse(data);
  }
  async saveArticle(article) {
    await this.kv.put(
      `feed:${article.feedId}:article:${article.id}`,
      JSON.stringify(article)
    );
    const feedIndex = await this.getFeedIndex(article.feedId);
    if (feedIndex && !feedIndex.articles.some((a) => a.id === article.id)) {
      feedIndex.articles.push({
        id: article.id,
        timestamp: article.timestamp,
      });
      feedIndex.articles.sort((a, b) => b.timestamp - a.timestamp);
      await this.kv.put(`feed:${article.feedId}`, JSON.stringify(feedIndex));
    }
  }
  async addUserSubscription(feedId, userId = "default") {
    const data = await this.kv.get(`user:${userId}:subscriptions`);
    const subs = data ? JSON.parse(data) : { feeds: [] };
    if (!subs.feeds.some((f) => f.feedId === feedId)) {
      subs.feeds.push({
        feedId,
        caughtUpToTimestamp: 0,
        manuallyReadBefore: [],
      });
      await this.kv.put(`user:${userId}:subscriptions`, JSON.stringify(subs));
    }
  }
  async addStarredArticle(articleId, userId = "default") {
    const data = await this.kv.get(`user:${userId}:starred`);
    const starred = data ? JSON.parse(data) : { articles: [] };
    if (!starred.articles.includes(articleId)) {
      starred.articles.push(articleId);
      await this.kv.put(`user:${userId}:starred`, JSON.stringify(starred));
    }
  }
  async addReadArticle(articleId, userId = "default") {
    const data = await this.kv.get(`user:${userId}:read`);
    const read = data ? JSON.parse(data) : { articles: [] };
    if (!read.articles.includes(articleId)) {
      read.articles.push(articleId);
      await this.kv.put(`user:${userId}:read`, JSON.stringify(read));
    }
  }
}

// Ensure testdata directory exists
const testdataDir = "testdata";
if (!existsSync(testdataDir)) {
  mkdirSync(testdataDir, { recursive: true });
}

function saveSnapshot(name, kv) {
  const kvData = {};
  for (const [key, value] of kv.store.entries()) {
    try {
      kvData[key] = JSON.parse(value);
    } catch {
      kvData[key] = value;
    }
  }
  const filename = join(testdataDir, `${name}.json`);
  writeFileSync(filename, JSON.stringify(kvData, null, 2));
  console.log(`✓ Created ${filename}`);
}

// Generate snapshots for representative test cases
async function generateSnapshots() {
  console.log("Generating KV snapshots...\n");

  // 1. Empty KV
  {
    const kv = new FakeKV();
    saveSnapshot("01-empty-kv", kv);
  }

  // 2. Single feed added
  {
    const kv = new FakeKV();
    const storage = new Storage(kv);
    await storage.addFeed({
      id: "feed-1",
      name: "Test Feed",
      url: "https://example.com/feed",
    });
    saveSnapshot("02-single-feed-added", kv);
  }

  // 3. Feed with articles
  {
    const kv = new FakeKV();
    const storage = new Storage(kv);
    await storage.addFeed({
      id: "feed-1",
      name: "Tech News",
      url: "https://technews.com/feed",
    });
    await storage.saveArticle({
      id: "article-1",
      feedId: "feed-1",
      title: "Breaking News",
      excerpt: "Something happened",
      link: "https://technews.com/breaking",
      source: "Tech News",
      sourceUrl: "https://technews.com/feed",
      timestamp: 3000,
    });
    await storage.saveArticle({
      id: "article-2",
      feedId: "feed-1",
      title: "Old News",
      excerpt: "Something old",
      link: "https://technews.com/old",
      source: "Tech News",
      sourceUrl: "https://technews.com/feed",
      timestamp: 1000,
    });
    saveSnapshot("03-feed-with-articles", kv);
  }

  // 4. Complete workflow with user interactions
  {
    const kv = new FakeKV();
    const storage = new Storage(kv);
    await storage.addFeed({
      id: "feed-1",
      name: "Tech News",
      url: "https://technews.com/feed",
    });
    await storage.addUserSubscription("feed-1", "user-1");
    await storage.saveArticle({
      id: "article-1",
      feedId: "feed-1",
      title: "Breaking News",
      excerpt: "Something happened",
      link: "https://technews.com/breaking",
      source: "Tech News",
      sourceUrl: "https://technews.com/feed",
      timestamp: 2000,
    });
    await storage.saveArticle({
      id: "article-2",
      feedId: "feed-1",
      title: "Old News",
      excerpt: "Something old",
      link: "https://technews.com/old",
      source: "Tech News",
      sourceUrl: "https://technews.com/feed",
      timestamp: 1000,
    });
    await storage.addStarredArticle("article-1", "user-1");
    await storage.addReadArticle("article-2", "user-1");
    saveSnapshot("04-complete-workflow-with-user-interactions", kv);
  }

  // 5. Multiple feeds and users
  {
    const kv = new FakeKV();
    const storage = new Storage(kv);
    await storage.addFeed({
      id: "feed-1",
      name: "Feed 1",
      url: "https://feed1.com",
    });
    await storage.addFeed({
      id: "feed-2",
      name: "Feed 2",
      url: "https://feed2.com",
    });
    await storage.addUserSubscription("feed-1", "user-1");
    await storage.addUserSubscription("feed-1", "user-2");
    await storage.addUserSubscription("feed-2", "user-2");
    await storage.saveArticle({
      id: "article-1",
      feedId: "feed-1",
      title: "Article from Feed 1",
      excerpt: "Content",
      link: "https://feed1.com/article1",
      source: "Feed 1",
      sourceUrl: "https://feed1.com",
      timestamp: 1000,
    });
    await storage.saveArticle({
      id: "article-2",
      feedId: "feed-2",
      title: "Article from Feed 2",
      excerpt: "Content",
      link: "https://feed2.com/article2",
      source: "Feed 2",
      sourceUrl: "https://feed2.com",
      timestamp: 2000,
    });
    await storage.addStarredArticle("article-1", "user-1");
    await storage.addStarredArticle("article-2", "user-2");
    saveSnapshot("05-multiple-feeds-and-users", kv);
  }

  console.log(`\n✓ Generated ${5} KV snapshots in testdata/`);
}

generateSnapshots().catch(console.error);

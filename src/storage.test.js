import { describe, it, expect, beforeEach } from "vitest";
import { Storage, FakeKV } from "./storage.js";

describe("FakeKV", () => {
  let kv;

  beforeEach(() => {
    kv = new FakeKV();
  });

  it("should store and retrieve values", async () => {
    await kv.put("key1", "value1");
    const result = await kv.get("key1");
    expect(result).toBe("value1");
  });

  it("should return null for non-existent keys", async () => {
    const result = await kv.get("non-existent");
    expect(result).toBeNull();
  });

  it("should delete keys", async () => {
    await kv.put("key1", "value1");
    await kv.delete("key1");
    const result = await kv.get("key1");
    expect(result).toBeNull();
  });

  it("should list keys with prefix", async () => {
    await kv.put("feed:1", "data1");
    await kv.put("feed:2", "data2");
    await kv.put("user:1", "data3");

    const result = await kv.list({ prefix: "feed:" });
    expect(result.keys).toHaveLength(2);
    expect(result.keys.map(k => k.name)).toEqual(["feed:1", "feed:2"]);
  });

  it("should clear all data", () => {
    kv.put("key1", "value1");
    kv.put("key2", "value2");
    kv.clear();
    expect(kv.getRaw("key1")).toBeUndefined();
    expect(kv.getRaw("key2")).toBeUndefined();
  });
});

describe("Storage - Feeds Operations", () => {
  let storage;
  let kv;

  beforeEach(() => {
    kv = new FakeKV();
    storage = new Storage(kv);
  });

  it("should return empty array when no feeds exist", async () => {
    const feeds = await storage.getFeeds();
    expect(feeds).toEqual([]);
  });

  it("should add a feed", async () => {
    await storage.addFeed({
      id: "feed-1",
      name: "Test Feed",
      url: "https://example.com/feed",
    });

    const feeds = await storage.getFeeds();
    expect(feeds).toHaveLength(1);
    expect(feeds[0]).toMatchObject({
      id: "feed-1",
      name: "Test Feed",
      url: "https://example.com/feed",
      lastFetched: null,
    });
  });

  it("should create feed index when adding feed", async () => {
    await storage.addFeed({
      id: "feed-1",
      name: "Test Feed",
      url: "https://example.com/feed",
    });

    const feedIndex = await storage.getFeedIndex("feed-1");
    expect(feedIndex).toMatchObject({
      id: "feed-1",
      name: "Test Feed",
      url: "https://example.com/feed",
      lastFetched: null,
      articles: [],
    });
  });

  it("should add multiple feeds", async () => {
    await storage.addFeed({
      id: "feed-1",
      name: "Feed 1",
      url: "https://example.com/feed1",
    });
    await storage.addFeed({
      id: "feed-2",
      name: "Feed 2",
      url: "https://example.com/feed2",
    });

    const feeds = await storage.getFeeds();
    expect(feeds).toHaveLength(2);
    expect(feeds.map(f => f.id)).toEqual(["feed-1", "feed-2"]);
  });

  it("should remove a feed", async () => {
    await storage.addFeed({
      id: "feed-1",
      name: "Test Feed",
      url: "https://example.com/feed",
    });

    await storage.removeFeed("feed-1");

    const feeds = await storage.getFeeds();
    expect(feeds).toHaveLength(0);

    const feedIndex = await storage.getFeedIndex("feed-1");
    expect(feedIndex).toBeNull();
  });

  it("should remove feed and all its articles", async () => {
    // Add feed
    await storage.addFeed({
      id: "feed-1",
      name: "Test Feed",
      url: "https://example.com/feed",
    });

    // Add articles
    await storage.saveArticle({
      id: "article-1",
      feedId: "feed-1",
      title: "Article 1",
      timestamp: 1000,
    });
    await storage.saveArticle({
      id: "article-2",
      feedId: "feed-1",
      title: "Article 2",
      timestamp: 2000,
    });

    // Remove feed
    await storage.removeFeed("feed-1");

    // Verify articles are deleted
    const article1 = await storage.getArticle("feed-1", "article-1");
    const article2 = await storage.getArticle("feed-1", "article-2");
    expect(article1).toBeNull();
    expect(article2).toBeNull();
  });

  it("should update feed metadata", async () => {
    await storage.addFeed({
      id: "feed-1",
      name: "Test Feed",
      url: "https://example.com/feed",
    });

    await storage.updateFeedMetadata("feed-1", {
      lastFetched: 123456789,
      name: "Updated Feed Name",
    });

    const feeds = await storage.getFeeds();
    expect(feeds[0]).toMatchObject({
      id: "feed-1",
      name: "Updated Feed Name",
      lastFetched: 123456789,
    });

    const feedIndex = await storage.getFeedIndex("feed-1");
    expect(feedIndex).toMatchObject({
      id: "feed-1",
      name: "Updated Feed Name",
      lastFetched: 123456789,
    });
  });
});

describe("Storage - Article Operations", () => {
  let storage;
  let kv;

  beforeEach(async () => {
    kv = new FakeKV();
    storage = new Storage(kv);

    // Setup: Add a feed
    await storage.addFeed({
      id: "feed-1",
      name: "Test Feed",
      url: "https://example.com/feed",
    });
  });

  it("should save an article", async () => {
    await storage.saveArticle({
      id: "article-1",
      feedId: "feed-1",
      title: "Test Article",
      excerpt: "Test excerpt",
      link: "https://example.com/article",
      source: "Test Feed",
      sourceUrl: "https://example.com/feed",
      timestamp: 1000,
    });

    const article = await storage.getArticle("feed-1", "article-1");
    expect(article).toMatchObject({
      id: "article-1",
      feedId: "feed-1",
      title: "Test Article",
      timestamp: 1000,
    });
  });

  it("should update feed index when saving article", async () => {
    await storage.saveArticle({
      id: "article-1",
      feedId: "feed-1",
      title: "Test Article",
      timestamp: 1000,
    });

    const feedIndex = await storage.getFeedIndex("feed-1");
    expect(feedIndex.articles).toHaveLength(1);
    expect(feedIndex.articles[0]).toMatchObject({
      id: "article-1",
      timestamp: 1000,
    });
  });

  it("should sort articles by timestamp DESC (newest first)", async () => {
    await storage.saveArticle({
      id: "article-1",
      feedId: "feed-1",
      title: "Old Article",
      timestamp: 1000,
    });
    await storage.saveArticle({
      id: "article-2",
      feedId: "feed-1",
      title: "New Article",
      timestamp: 3000,
    });
    await storage.saveArticle({
      id: "article-3",
      feedId: "feed-1",
      title: "Middle Article",
      timestamp: 2000,
    });

    const feedIndex = await storage.getFeedIndex("feed-1");
    expect(feedIndex.articles.map(a => a.id)).toEqual([
      "article-2",
      "article-3",
      "article-1",
    ]);
    expect(feedIndex.articles.map(a => a.timestamp)).toEqual([3000, 2000, 1000]);
  });

  it("should not duplicate articles in feed index", async () => {
    await storage.saveArticle({
      id: "article-1",
      feedId: "feed-1",
      title: "Test Article",
      timestamp: 1000,
    });

    // Save same article again
    await storage.saveArticle({
      id: "article-1",
      feedId: "feed-1",
      title: "Test Article Updated",
      timestamp: 1000,
    });

    const feedIndex = await storage.getFeedIndex("feed-1");
    expect(feedIndex.articles).toHaveLength(1);
  });

  it("should return null for non-existent article", async () => {
    const article = await storage.getArticle("feed-1", "non-existent");
    expect(article).toBeNull();
  });

  it("should get multiple articles by IDs", async () => {
    await storage.saveArticle({
      id: "article-1",
      feedId: "feed-1",
      title: "Article 1",
      timestamp: 1000,
    });
    await storage.saveArticle({
      id: "article-2",
      feedId: "feed-1",
      title: "Article 2",
      timestamp: 2000,
    });

    const articles = await storage.getArticles([
      { feedId: "feed-1", articleId: "article-1" },
      { feedId: "feed-1", articleId: "article-2" },
    ]);

    expect(articles).toHaveLength(2);
    expect(articles.map(a => a.id)).toEqual(["article-1", "article-2"]);
  });

  it("should filter out null articles when batch fetching", async () => {
    await storage.saveArticle({
      id: "article-1",
      feedId: "feed-1",
      title: "Article 1",
      timestamp: 1000,
    });

    const articles = await storage.getArticles([
      { feedId: "feed-1", articleId: "article-1" },
      { feedId: "feed-1", articleId: "non-existent" },
    ]);

    expect(articles).toHaveLength(1);
    expect(articles[0].id).toBe("article-1");
  });

  it("should check if article exists", async () => {
    await storage.saveArticle({
      id: "article-1",
      feedId: "feed-1",
      title: "Test Article",
      timestamp: 1000,
    });

    const exists = await storage.articleExists("feed-1", "article-1");
    const notExists = await storage.articleExists("feed-1", "non-existent");

    expect(exists).toBe(true);
    expect(notExists).toBe(false);
  });

  it("should get feed articles with pagination", async () => {
    // Add 10 articles
    for (let i = 0; i < 10; i++) {
      await storage.saveArticle({
        id: `article-${i}`,
        feedId: "feed-1",
        title: `Article ${i}`,
        timestamp: i * 1000,
      });
    }

    // Get first 5
    const page1 = await storage.getFeedArticles("feed-1", 5, 0);
    expect(page1).toHaveLength(5);

    // Get next 5
    const page2 = await storage.getFeedArticles("feed-1", 5, 5);
    expect(page2).toHaveLength(5);

    // Verify they're different
    expect(page1[0].id).not.toBe(page2[0].id);
  });

  it("should return empty array for non-existent feed articles", async () => {
    const articles = await storage.getFeedArticles("non-existent");
    expect(articles).toEqual([]);
  });
});

describe("Storage - User Subscription Operations", () => {
  let storage;
  let kv;

  beforeEach(async () => {
    kv = new FakeKV();
    storage = new Storage(kv);

    // Setup: Add a feed
    await storage.addFeed({
      id: "feed-1",
      name: "Test Feed",
      url: "https://example.com/feed",
    });
  });

  it("should return empty subscriptions for new user", async () => {
    const subs = await storage.getUserSubscriptions("user-1");
    expect(subs).toEqual({ feeds: [] });
  });

  it("should add user subscription", async () => {
    await storage.addUserSubscription("feed-1", "user-1");

    const subs = await storage.getUserSubscriptions("user-1");
    expect(subs.feeds).toHaveLength(1);
    expect(subs.feeds[0]).toMatchObject({
      feedId: "feed-1",
      caughtUpToTimestamp: 0,
      manuallyReadBefore: [],
    });
  });

  it("should not duplicate subscriptions", async () => {
    await storage.addUserSubscription("feed-1", "user-1");
    await storage.addUserSubscription("feed-1", "user-1");

    const subs = await storage.getUserSubscriptions("user-1");
    expect(subs.feeds).toHaveLength(1);
  });

  it("should add multiple subscriptions", async () => {
    await storage.addFeed({
      id: "feed-2",
      name: "Feed 2",
      url: "https://example.com/feed2",
    });

    await storage.addUserSubscription("feed-1", "user-1");
    await storage.addUserSubscription("feed-2", "user-1");

    const subs = await storage.getUserSubscriptions("user-1");
    expect(subs.feeds).toHaveLength(2);
    expect(subs.feeds.map(f => f.feedId)).toEqual(["feed-1", "feed-2"]);
  });

  it("should remove user subscription", async () => {
    await storage.addUserSubscription("feed-1", "user-1");
    await storage.removeUserSubscription("feed-1", "user-1");

    const subs = await storage.getUserSubscriptions("user-1");
    expect(subs.feeds).toHaveLength(0);
  });

  it("should update subscription watermark", async () => {
    await storage.addUserSubscription("feed-1", "user-1");
    await storage.updateSubscriptionWatermark("feed-1", 5000, "user-1");

    const subs = await storage.getUserSubscriptions("user-1");
    expect(subs.feeds[0].caughtUpToTimestamp).toBe(5000);
  });

  it("should add to manually read before list", async () => {
    await storage.addUserSubscription("feed-1", "user-1");
    await storage.addManuallyReadBefore("feed-1", "article-1", "user-1");
    await storage.addManuallyReadBefore("feed-1", "article-2", "user-1");

    const subs = await storage.getUserSubscriptions("user-1");
    expect(subs.feeds[0].manuallyReadBefore).toEqual(["article-1", "article-2"]);
  });

  it("should not duplicate in manually read before list", async () => {
    await storage.addUserSubscription("feed-1", "user-1");
    await storage.addManuallyReadBefore("feed-1", "article-1", "user-1");
    await storage.addManuallyReadBefore("feed-1", "article-1", "user-1");

    const subs = await storage.getUserSubscriptions("user-1");
    expect(subs.feeds[0].manuallyReadBefore).toEqual(["article-1"]);
  });

  it("should remove from manually read before list", async () => {
    await storage.addUserSubscription("feed-1", "user-1");
    await storage.addManuallyReadBefore("feed-1", "article-1", "user-1");
    await storage.addManuallyReadBefore("feed-1", "article-2", "user-1");
    await storage.removeManuallyReadBefore("feed-1", "article-1", "user-1");

    const subs = await storage.getUserSubscriptions("user-1");
    expect(subs.feeds[0].manuallyReadBefore).toEqual(["article-2"]);
  });

  it("should use default user ID when not specified", async () => {
    await storage.addUserSubscription("feed-1");

    const subs = await storage.getUserSubscriptions();
    expect(subs.feeds).toHaveLength(1);
  });
});

describe("Storage - User Starred Operations", () => {
  let storage;
  let kv;

  beforeEach(() => {
    kv = new FakeKV();
    storage = new Storage(kv);
  });

  it("should return empty starred for new user", async () => {
    const starred = await storage.getUserStarred("user-1");
    expect(starred).toEqual({ articles: [] });
  });

  it("should add starred article", async () => {
    await storage.addStarredArticle("article-1", "user-1");

    const starred = await storage.getUserStarred("user-1");
    expect(starred.articles).toEqual(["article-1"]);
  });

  it("should not duplicate starred articles", async () => {
    await storage.addStarredArticle("article-1", "user-1");
    await storage.addStarredArticle("article-1", "user-1");

    const starred = await storage.getUserStarred("user-1");
    expect(starred.articles).toEqual(["article-1"]);
  });

  it("should add multiple starred articles", async () => {
    await storage.addStarredArticle("article-1", "user-1");
    await storage.addStarredArticle("article-2", "user-1");

    const starred = await storage.getUserStarred("user-1");
    expect(starred.articles).toEqual(["article-1", "article-2"]);
  });

  it("should remove starred article", async () => {
    await storage.addStarredArticle("article-1", "user-1");
    await storage.addStarredArticle("article-2", "user-1");
    await storage.removeStarredArticle("article-1", "user-1");

    const starred = await storage.getUserStarred("user-1");
    expect(starred.articles).toEqual(["article-2"]);
  });

  it("should check if article is starred", async () => {
    await storage.addStarredArticle("article-1", "user-1");

    const isStarred = await storage.isArticleStarred("article-1", "user-1");
    const isNotStarred = await storage.isArticleStarred("article-2", "user-1");

    expect(isStarred).toBe(true);
    expect(isNotStarred).toBe(false);
  });

  it("should use default user ID when not specified", async () => {
    await storage.addStarredArticle("article-1");

    const starred = await storage.getUserStarred();
    expect(starred.articles).toEqual(["article-1"]);
  });
});

describe("Storage - User Read Operations", () => {
  let storage;
  let kv;

  beforeEach(() => {
    kv = new FakeKV();
    storage = new Storage(kv);
  });

  it("should return empty read for new user", async () => {
    const read = await storage.getUserRead("user-1");
    expect(read).toEqual({ articles: [] });
  });

  it("should add read article", async () => {
    await storage.addReadArticle("article-1", "user-1");

    const read = await storage.getUserRead("user-1");
    expect(read.articles).toEqual(["article-1"]);
  });

  it("should not duplicate read articles", async () => {
    await storage.addReadArticle("article-1", "user-1");
    await storage.addReadArticle("article-1", "user-1");

    const read = await storage.getUserRead("user-1");
    expect(read.articles).toEqual(["article-1"]);
  });

  it("should add multiple read articles", async () => {
    await storage.addReadArticle("article-1", "user-1");
    await storage.addReadArticle("article-2", "user-1");

    const read = await storage.getUserRead("user-1");
    expect(read.articles).toEqual(["article-1", "article-2"]);
  });

  it("should remove read article", async () => {
    await storage.addReadArticle("article-1", "user-1");
    await storage.addReadArticle("article-2", "user-1");
    await storage.removeReadArticle("article-1", "user-1");

    const read = await storage.getUserRead("user-1");
    expect(read.articles).toEqual(["article-2"]);
  });

  it("should check if article is read", async () => {
    await storage.addReadArticle("article-1", "user-1");

    const isRead = await storage.isArticleRead("article-1", "user-1");
    const isNotRead = await storage.isArticleRead("article-2", "user-1");

    expect(isRead).toBe(true);
    expect(isNotRead).toBe(false);
  });

  it("should use default user ID when not specified", async () => {
    await storage.addReadArticle("article-1");

    const read = await storage.getUserRead();
    expect(read.articles).toEqual(["article-1"]);
  });
});

describe("Storage - Integration Tests", () => {
  let storage;
  let kv;

  beforeEach(() => {
    kv = new FakeKV();
    storage = new Storage(kv);
  });

  it("should handle complete workflow: add feed, articles, and user interactions", async () => {
    // Add feed
    await storage.addFeed({
      id: "feed-1",
      name: "Tech News",
      url: "https://technews.com/feed",
    });

    // Add user subscription
    await storage.addUserSubscription("feed-1", "user-1");

    // Add articles
    await storage.saveArticle({
      id: "article-1",
      feedId: "feed-1",
      title: "Breaking News",
      excerpt: "Something happened",
      link: "https://technews.com/breaking",
      source: "Tech News",
      sourceUrl: "https://technews.com/feed",
      timestamp: 1000,
    });

    await storage.saveArticle({
      id: "article-2",
      feedId: "feed-1",
      title: "Old News",
      excerpt: "Something old",
      link: "https://technews.com/old",
      source: "Tech News",
      sourceUrl: "https://technews.com/feed",
      timestamp: 500,
    });

    // User stars an article
    await storage.addStarredArticle("article-1", "user-1");

    // User reads an article
    await storage.addReadArticle("article-2", "user-1");

    // Verify everything
    const feeds = await storage.getFeeds();
    expect(feeds).toHaveLength(1);

    const feedArticles = await storage.getFeedArticles("feed-1");
    expect(feedArticles).toHaveLength(2);
    expect(feedArticles[0].id).toBe("article-1"); // Newest first

    const starred = await storage.getUserStarred("user-1");
    expect(starred.articles).toEqual(["article-1"]);

    const read = await storage.getUserRead("user-1");
    expect(read.articles).toEqual(["article-2"]);

    const subs = await storage.getUserSubscriptions("user-1");
    expect(subs.feeds[0].feedId).toBe("feed-1");
  });

  it("should handle multiple feeds and users", async () => {
    // Add two feeds
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

    // User 1 subscribes to feed 1
    await storage.addUserSubscription("feed-1", "user-1");

    // User 2 subscribes to both
    await storage.addUserSubscription("feed-1", "user-2");
    await storage.addUserSubscription("feed-2", "user-2");

    // Add articles to each feed
    await storage.saveArticle({
      id: "article-1",
      feedId: "feed-1",
      title: "Article from Feed 1",
      timestamp: 1000,
    });

    await storage.saveArticle({
      id: "article-2",
      feedId: "feed-2",
      title: "Article from Feed 2",
      timestamp: 2000,
    });

    // Verify subscriptions
    const user1Subs = await storage.getUserSubscriptions("user-1");
    expect(user1Subs.feeds).toHaveLength(1);

    const user2Subs = await storage.getUserSubscriptions("user-2");
    expect(user2Subs.feeds).toHaveLength(2);

    // Verify articles
    const feed1Articles = await storage.getFeedArticles("feed-1");
    expect(feed1Articles).toHaveLength(1);

    const feed2Articles = await storage.getFeedArticles("feed-2");
    expect(feed2Articles).toHaveLength(1);
  });

  it("should maintain data isolation between users", async () => {
    await storage.addFeed({
      id: "feed-1",
      name: "Feed",
      url: "https://feed.com",
    });

    await storage.saveArticle({
      id: "article-1",
      feedId: "feed-1",
      title: "Article",
      timestamp: 1000,
    });

    // User 1 actions
    await storage.addStarredArticle("article-1", "user-1");
    await storage.addReadArticle("article-1", "user-1");

    // User 2 has different preferences
    const user2Starred = await storage.getUserStarred("user-2");
    const user2Read = await storage.getUserRead("user-2");

    expect(user2Starred.articles).toEqual([]);
    expect(user2Read.articles).toEqual([]);
  });

  it("should handle removing feed with subscriptions and interactions", async () => {
    // Setup
    await storage.addFeed({
      id: "feed-1",
      name: "Feed",
      url: "https://feed.com",
    });

    await storage.addUserSubscription("feed-1", "user-1");

    await storage.saveArticle({
      id: "article-1",
      feedId: "feed-1",
      title: "Article",
      timestamp: 1000,
    });

    await storage.addStarredArticle("article-1", "user-1");
    await storage.addReadArticle("article-1", "user-1");

    // Remove feed
    await storage.removeFeed("feed-1");

    // Verify feed is gone
    const feeds = await storage.getFeeds();
    expect(feeds).toHaveLength(0);

    const feedIndex = await storage.getFeedIndex("feed-1");
    expect(feedIndex).toBeNull();

    const article = await storage.getArticle("feed-1", "article-1");
    expect(article).toBeNull();

    // User subscription, starred, and read still exist (orphaned)
    // This is acceptable - cleanup can happen separately
    const subs = await storage.getUserSubscriptions("user-1");
    expect(subs.feeds[0].feedId).toBe("feed-1"); // Still there

    const starred = await storage.getUserStarred("user-1");
    expect(starred.articles).toEqual(["article-1"]); // Still there
  });

  it("should clear all data", async () => {
    await storage.addFeed({
      id: "feed-1",
      name: "Feed",
      url: "https://feed.com",
    });

    await storage.saveArticle({
      id: "article-1",
      feedId: "feed-1",
      title: "Article",
      timestamp: 1000,
    });

    await storage.addUserSubscription("feed-1", "user-1");
    await storage.addStarredArticle("article-1", "user-1");

    await storage.clearAll();

    const feeds = await storage.getFeeds();
    const subs = await storage.getUserSubscriptions("user-1");
    const starred = await storage.getUserStarred("user-1");

    expect(feeds).toEqual([]);
    expect(subs).toEqual({ feeds: [] });
    expect(starred).toEqual({ articles: [] });
  });
});

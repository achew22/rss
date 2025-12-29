/**
 * RSS Reader Cloudflare Worker Backend
 *
 * This worker serves the RSS Reader SPA and handles API routes.
 * It fetches and parses RSS feeds, stores subscriptions and articles in KV,
 * and manages user state (starred articles).
 */

// KV Keys
const FEEDS_KEY = "feeds"; // Global registry of all feeds
const DEFAULT_USER_ID = "default"; // Single user for now

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Handle API routes
    if (path.startsWith("/api/")) {
      return handleApiRequest(request, url, env, ctx);
    }

    // For non-API routes that aren't static assets, this will be called
    // Return 404 for unknown routes (static assets are handled by Wrangler)
    return new Response("Not Found", { status: 404 });
  },

  /**
   * Scheduled handler for cron triggers
   * Automatically refreshes all feeds on a schedule
   */
  async scheduled(event, env, ctx) {
    console.log(`Cron triggered at ${new Date().toISOString()}`);
    const results = await refreshAllFeeds(env);
    console.log("Feed refresh results:", JSON.stringify(results));
  },
};

/**
 * Handle API requests
 */
async function handleApiRequest(request, url, env, ctx) {
  const path = url.pathname;
  const method = request.method;

  // Set CORS headers for API responses
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  // Handle preflight requests
  if (method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Health check
    if (path === "/api/health") {
      return jsonResponse(
        { status: "ok", timestamp: new Date().toISOString() },
        corsHeaders
      );
    }

    // Feed endpoints
    if (path === "/api/feeds") {
      if (method === "GET") {
        return await handleGetFeeds(env, corsHeaders);
      }
      if (method === "POST") {
        return await handleAddFeed(request, env, corsHeaders);
      }
    }

    // Delete feed
    const feedDeleteMatch = path.match(/^\/api\/feeds\/([^/]+)$/);
    if (feedDeleteMatch && method === "DELETE") {
      return await handleDeleteFeed(feedDeleteMatch[1], env, corsHeaders);
    }

    // Refresh specific feed
    const feedRefreshMatch = path.match(/^\/api\/feeds\/([^/]+)\/refresh$/);
    if (feedRefreshMatch && method === "POST") {
      return await handleRefreshFeed(feedRefreshMatch[1], env, corsHeaders);
    }

    // Article endpoints
    if (path === "/api/articles" && method === "GET") {
      return await handleGetArticles(url, env, corsHeaders);
    }

    // Star/unstar article
    const starMatch = path.match(/^\/api\/articles\/([^/]+)\/star$/);
    if (starMatch && method === "POST") {
      return await handleToggleStar(starMatch[1], env, corsHeaders);
    }

    // Mark article as read/unread
    const readMatch = path.match(/^\/api\/articles\/([^/]+)\/read$/);
    if (readMatch && method === "POST") {
      return await handleToggleRead(readMatch[1], env, corsHeaders);
    }

    // Refresh all feeds
    if (path === "/api/refresh" && method === "POST") {
      return await handleRefreshAll(env, corsHeaders);
    }

    // Default API response
    return jsonResponse(
      {
        message: "RSS Reader API",
        version: "1.0.0",
        endpoints: [
          "GET /api/health",
          "GET /api/feeds",
          "POST /api/feeds",
          "DELETE /api/feeds/:id",
          "POST /api/feeds/:id/refresh",
          "GET /api/articles",
          "POST /api/articles/:id/star",
          "POST /api/articles/:id/read",
          "POST /api/refresh",
        ],
      },
      corsHeaders
    );
  } catch (error) {
    console.error("API Error:", error);
    return jsonResponse(
      { error: "Internal server error", message: error.message },
      corsHeaders,
      500
    );
  }
}

/**
 * Get all feeds (user's subscribed feeds)
 */
async function handleGetFeeds(env, corsHeaders) {
  const userSubs = await getUserSubscriptions(env);
  const feeds = await getFeeds(env);

  // Get only feeds user is subscribed to
  const subscribedFeedIds = new Set(userSubs.feeds.map((sub) => sub.feedId));
  const subscribedFeeds = feeds.filter((feed) => subscribedFeedIds.has(feed.id));

  // Fetch feed indexes in parallel to get article counts
  const feedIndexes = await Promise.all(
    subscribedFeeds.map((feed) => getFeed(env, feed.id))
  );

  // Calculate article counts per feed
  const feedsWithCounts = subscribedFeeds.map((feed, index) => ({
    ...feed,
    count: feedIndexes[index]?.articles?.length || 0,
  }));

  return jsonResponse({ feeds: feedsWithCounts }, corsHeaders);
}

/**
 * Add a new feed
 */
async function handleAddFeed(request, env, corsHeaders) {
  const body = await request.json();
  const { url, name } = body;

  if (!url) {
    return jsonResponse({ error: "URL is required" }, corsHeaders, 400);
  }

  // Validate URL
  let feedUrl;
  try {
    feedUrl = new URL(url);
  } catch {
    return jsonResponse({ error: "Invalid URL" }, corsHeaders, 400);
  }

  // Check if feed already exists
  const feeds = await getFeeds(env);
  if (feeds.some((f) => f.url === url)) {
    return jsonResponse({ error: "Feed already exists" }, corsHeaders, 409);
  }

  // Fetch and parse the feed to validate it
  let parsedFeed;
  try {
    parsedFeed = await fetchAndParseFeed(url);
  } catch (error) {
    return jsonResponse(
      { error: "Failed to fetch feed", message: error.message },
      corsHeaders,
      400
    );
  }

  // Create new feed entry
  const newFeedId = generateId();
  const newFeed = {
    id: newFeedId,
    name: name || parsedFeed.title || feedUrl.hostname,
    url: url,
    lastFetched: new Date().toISOString(),
  };

  // Save feed to global registry
  feeds.push(newFeed);
  await saveFeeds(env, feeds);

  // Add to user's subscriptions with watermark at 0 (all articles unread)
  const userSubs = await getUserSubscriptions(env);
  userSubs.feeds.push({
    feedId: newFeedId,
    caughtUpToTimestamp: 0,
    manuallyReadBefore: [],
  });
  await saveUserSubscriptions(env, userSubs);

  // Create articles from the feed
  const newArticles = parsedFeed.items.map((item) => ({
    id: generateId(),
    feedId: newFeedId,
    title: item.title || "Untitled",
    excerpt: item.description || item.content || "",
    link: item.link || "",
    source: newFeed.name,
    sourceUrl: url,
    timestamp: new Date(item.pubDate || new Date()).getTime(),
  }));

  // Save individual articles
  await saveArticles(env, newArticles);

  // Create feed index with article references (sorted DESC by timestamp)
  const feedIndex = {
    id: newFeedId,
    name: newFeed.name,
    url: newFeed.url,
    lastFetched: newFeed.lastFetched,
    articles: newArticles
      .map((a) => ({ id: a.id, timestamp: a.timestamp }))
      .sort((a, b) => b.timestamp - a.timestamp), // Newest first
  };
  await saveFeed(env, feedIndex);

  // Return the new articles directly so the frontend can display them immediately
  const articlesWithStarred = newArticles.map((a) => ({
    ...a,
    date: new Date(a.timestamp).toISOString(), // Convert timestamp back to ISO for frontend
    starred: false,
    read: false,
  }));

  return jsonResponse(
    {
      feed: { ...newFeed, count: newArticles.length },
      articlesAdded: newArticles.length,
      articles: articlesWithStarred,
    },
    corsHeaders,
    201
  );
}

/**
 * Delete a feed
 */
async function handleDeleteFeed(feedId, env, corsHeaders) {
  const feeds = await getFeeds(env);
  const feedIndex = feeds.findIndex((f) => f.id === feedId);

  if (feedIndex === -1) {
    return jsonResponse({ error: "Feed not found" }, corsHeaders, 404);
  }

  // Get feed index to find all article IDs
  const feed = await getFeed(env, feedId);
  const articleIds = feed?.articles?.map((a) => a.id) || [];

  // Delete individual articles (nested under feed)
  await deleteArticlesForFeed(env, feedId, articleIds);

  // Delete feed index
  if (env.RSS_STORE) {
    await env.RSS_STORE.delete(`feed:${feedId}`);
  }

  // Remove feed from global registry
  feeds.splice(feedIndex, 1);
  await saveFeeds(env, feeds);

  // Remove from user's subscriptions
  const userSubs = await getUserSubscriptions(env);
  userSubs.feeds = userSubs.feeds.filter((sub) => sub.feedId !== feedId);
  await saveUserSubscriptions(env, userSubs);

  // Remove starred status for deleted articles
  const articleIdsSet = new Set(articleIds);
  const starred = await getUserStarred(env);
  const remainingStarred = starred.articles.filter(
    (id) => !articleIdsSet.has(id)
  );
  await saveUserStarred(env, { articles: remainingStarred });

  return jsonResponse({ success: true }, corsHeaders);
}

/**
 * Refresh a specific feed
 */
async function handleRefreshFeed(feedId, env, corsHeaders) {
  const feeds = await getFeeds(env);
  const feedMeta = feeds.find((f) => f.id === feedId);

  if (!feedMeta) {
    return jsonResponse({ error: "Feed not found" }, corsHeaders, 404);
  }

  try {
    const parsedFeed = await fetchAndParseFeed(feedMeta.url);
    const feedIndex = await getFeed(env, feedId);

    if (!feedIndex) {
      return jsonResponse({ error: "Feed index not found" }, corsHeaders, 404);
    }

    // Get existing article links to avoid duplicates
    const existingArticleData = await getArticles(
      env,
      feedIndex.articles.map((a) => ({ feedId: feedId, articleId: a.id }))
    );
    const existingLinks = new Set(existingArticleData.map((a) => a.link));

    // Create new articles
    const newArticles = parsedFeed.items
      .filter((item) => item.link && !existingLinks.has(item.link))
      .map((item) => ({
        id: generateId(),
        feedId: feedId,
        title: item.title || "Untitled",
        excerpt: item.description || item.content || "",
        link: item.link || "",
        source: feedMeta.name,
        sourceUrl: feedMeta.url,
        timestamp: new Date(item.pubDate || new Date()).getTime(),
      }));

    if (newArticles.length > 0) {
      // Save individual articles
      await saveArticles(env, newArticles);

      // Update feed index by prepending new article references
      feedIndex.articles.unshift(
        ...newArticles.map((a) => ({ id: a.id, timestamp: a.timestamp }))
      );
      // Keep sorted DESC by timestamp
      feedIndex.articles.sort((a, b) => b.timestamp - a.timestamp);
      feedIndex.lastFetched = new Date().toISOString();
      await saveFeed(env, feedIndex);
    }

    // Update feed metadata's lastFetched
    feedMeta.lastFetched = new Date().toISOString();
    await saveFeeds(env, feeds);

    return jsonResponse(
      {
        success: true,
        newArticles: newArticles.length,
      },
      corsHeaders
    );
  } catch (error) {
    return jsonResponse(
      { error: "Failed to refresh feed", message: error.message },
      corsHeaders,
      500
    );
  }
}

/**
 * Core function to refresh all feeds
 * Used by both the API endpoint and scheduled cron handler
 */
async function refreshAllFeeds(env) {
  const feeds = await getFeeds(env);
  const results = [];

  for (const feedMeta of feeds) {
    try {
      const parsedFeed = await fetchAndParseFeed(feedMeta.url);
      const feedIndex = await getFeed(env, feedMeta.id);

      if (!feedIndex) {
        results.push({
          feedId: feedMeta.id,
          name: feedMeta.name,
          error: "Feed index not found",
        });
        continue;
      }

      // Get existing article links to avoid duplicates
      const existingArticleData = await getArticles(
        env,
        feedIndex.articles.map((a) => ({
          feedId: feedMeta.id,
          articleId: a.id,
        }))
      );
      const existingLinks = new Set(existingArticleData.map((a) => a.link));

      const newArticles = parsedFeed.items
        .filter((item) => item.link && !existingLinks.has(item.link))
        .map((item) => ({
          id: generateId(),
          feedId: feedMeta.id,
          title: item.title || "Untitled",
          excerpt: item.description || item.content || "",
          link: item.link || "",
          source: feedMeta.name,
          sourceUrl: feedMeta.url,
          timestamp: new Date(item.pubDate || new Date()).getTime(),
        }));

      if (newArticles.length > 0) {
        // Save individual articles
        await saveArticles(env, newArticles);

        // Update feed index
        feedIndex.articles.unshift(
          ...newArticles.map((a) => ({ id: a.id, timestamp: a.timestamp }))
        );
        feedIndex.articles.sort((a, b) => b.timestamp - a.timestamp);
        feedIndex.lastFetched = new Date().toISOString();
        await saveFeed(env, feedIndex);
      }

      feedMeta.lastFetched = new Date().toISOString();
      results.push({
        feedId: feedMeta.id,
        name: feedMeta.name,
        newArticles: newArticles.length,
      });
    } catch (error) {
      results.push({
        feedId: feedMeta.id,
        name: feedMeta.name,
        error: error.message,
      });
    }
  }

  await saveFeeds(env, feeds);

  return results;
}

/**
 * Refresh all feeds (API handler)
 */
async function handleRefreshAll(env, corsHeaders) {
  const results = await refreshAllFeeds(env);
  return jsonResponse({ results }, corsHeaders);
}

/**
 * Get all articles
 */
async function handleGetArticles(url, env, corsHeaders) {
  const userSubs = await getUserSubscriptions(env);
  const starred = await getUserStarred(env);
  const starredSet = new Set(starred.articles);

  // Build subscription lookup map
  const subsMap = new Map();
  for (const sub of userSubs.feeds) {
    subsMap.set(sub.feedId, sub);
  }

  // Apply filters from query params
  const feedId = url.searchParams.get("feedId");
  const starredOnly = url.searchParams.get("starred") === "true";

  let feedIndexes;
  let articleRefs;

  if (starredOnly) {
    // For starred view, need to find which feeds these articles belong to
    // Build article refs by checking subscribed feeds
    const allFeedIndexes = await Promise.all(
      userSubs.feeds.map((sub) => getFeed(env, sub.feedId))
    );
    articleRefs = [];
    for (const feedIndex of allFeedIndexes) {
      if (!feedIndex) continue;
      for (const article of feedIndex.articles) {
        if (starred.articles.includes(article.id)) {
          articleRefs.push({
            feedId: feedIndex.id,
            articleId: article.id,
            timestamp: article.timestamp,
          });
        }
      }
    }
  } else if (feedId) {
    // Single feed view
    const feedIndex = await getFeed(env, feedId);
    if (!feedIndex || !feedIndex.articles) {
      return jsonResponse({ articles: [] }, corsHeaders);
    }
    // Get all article refs from this feed (already sorted newest first)
    articleRefs = feedIndex.articles.map((a) => ({
      feedId: feedId,
      articleId: a.id,
      timestamp: a.timestamp,
    }));
  } else {
    // All feeds view - use merge sort across subscribed feeds
    feedIndexes = await Promise.all(
      userSubs.feeds.map((sub) => getFeed(env, sub.feedId))
    );
    // Filter out any null feeds
    feedIndexes = feedIndexes.filter((f) => f !== null);

    // Merge sort to get article refs (newest first by default)
    // Limit to 1000 articles for performance
    const sortedArticles = mergeSortArticles(feedIndexes, true, 1000);

    // sortedArticles already has feedId, articleId, and we need timestamp
    articleRefs = sortedArticles.map((item) => ({
      feedId: item.feedId,
      articleId: item.articleId,
      timestamp: item.timestamp,
    }));
  }

  // Fetch the actual article data
  const articles = await getArticles(env, articleRefs);

  // Get manual read list
  let readData = null;
  if (env.RSS_STORE) {
    const data = await env.RSS_STORE.get(`user:default:read`);
    readData = data ? JSON.parse(data) : { articles: [] };
  } else {
    readData = { articles: [] };
  }
  const manualReadSet = new Set(readData.articles);

  // Add starred and read status to each article
  const articlesWithStatus = articles.map((a) => {
    const subscription = subsMap.get(a.feedId);
    // Article is read if: manually marked OR (watermark says it's read AND not in exceptions)
    const watermarkRead = isArticleRead(subscription, a.id, a.timestamp);
    const read = manualReadSet.has(a.id) || watermarkRead;

    return {
      ...a,
      date: new Date(a.timestamp).toISOString(), // Convert timestamp to ISO for frontend
      starred: starredSet.has(a.id),
      read: read,
    };
  });

  return jsonResponse({ articles: articlesWithStatus }, corsHeaders);
}

/**
 * Toggle star status for an article
 */
async function handleToggleStar(articleId, env, corsHeaders) {
  const starred = await getUserStarred(env);
  const starredSet = new Set(starred.articles);

  let isStarred;
  if (starredSet.has(articleId)) {
    starredSet.delete(articleId);
    isStarred = false;
  } else {
    starredSet.add(articleId);
    isStarred = true;
  }

  await saveUserStarred(env, { articles: Array.from(starredSet) });

  return jsonResponse({ articleId, starred: isStarred }, corsHeaders);
}

/**
 * Toggle read status for an article
 * For simplicity with watermark tracking, just toggle a simple read list
 * (Watermark will be used for bulk "mark all as read" operations)
 */
async function handleToggleRead(articleId, env, corsHeaders) {
  // For now, use a simple per-user read list similar to starred
  // TODO: Implement full watermark-based tracking
  const userSubs = await getUserSubscriptions(env);

  // Create a simple read tracking object if it doesn't exist
  let readData = null;
  if (env.RSS_STORE) {
    const data = await env.RSS_STORE.get(`user:default:read`);
    readData = data ? JSON.parse(data) : { articles: [] };
  } else {
    readData = { articles: [] };
  }

  const readSet = new Set(readData.articles);
  let isRead;

  if (readSet.has(articleId)) {
    readSet.delete(articleId);
    isRead = false;
  } else {
    readSet.add(articleId);
    isRead = true;
  }

  if (env.RSS_STORE) {
    await env.RSS_STORE.put(`user:default:read`, JSON.stringify({ articles: Array.from(readSet) }));
  }

  return jsonResponse({ articleId, read: isRead }, corsHeaders);
}

// ============================================================================
// RSS Feed Parsing
// ============================================================================

/**
 * Fetch and parse an RSS/Atom feed
 */
async function fetchAndParseFeed(feedUrl) {
  const response = await fetch(feedUrl, {
    headers: {
      "User-Agent": "RSS Reader Worker/1.0",
      Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch feed: ${response.status} ${response.statusText}`);
  }

  const xml = await response.text();
  return parseFeed(xml);
}

/**
 * Parse RSS or Atom XML into a normalized format
 */
function parseFeed(xml) {
  // Simple XML parser for RSS/Atom feeds
  // This handles the most common feed formats

  const isAtom = xml.includes("<feed") && xml.includes("xmlns=\"http://www.w3.org/2005/Atom\"");

  if (isAtom) {
    return parseAtomFeed(xml);
  } else {
    return parseRssFeed(xml);
  }
}

/**
 * Parse RSS 2.0 feed
 */
function parseRssFeed(xml) {
  const title = extractTag(xml, "title", "channel");
  const items = [];

  // Extract all <item> elements
  const itemMatches = xml.matchAll(/<item[^>]*>([\s\S]*?)<\/item>/gi);

  for (const match of itemMatches) {
    const itemXml = match[1];
    items.push({
      title: cleanHtml(extractTag(itemXml, "title")),
      description: cleanHtml(extractTag(itemXml, "description")),
      content: cleanHtml(
        extractTag(itemXml, "content:encoded") || extractTag(itemXml, "content")
      ),
      link: extractTag(itemXml, "link"),
      pubDate: parseDate(
        extractTag(itemXml, "pubDate") || extractTag(itemXml, "dc:date")
      ),
    });
  }

  return { title: cleanHtml(title), items };
}

/**
 * Parse Atom feed
 */
function parseAtomFeed(xml) {
  const title = extractTag(xml, "title", "feed");
  const items = [];

  // Extract all <entry> elements
  const entryMatches = xml.matchAll(/<entry[^>]*>([\s\S]*?)<\/entry>/gi);

  for (const match of entryMatches) {
    const entryXml = match[1];

    // Get link - Atom uses <link href="..."/> or <link>...</link>
    let link = "";
    const linkHrefMatch = entryXml.match(/<link[^>]*href=["']([^"']*)["'][^>]*\/>/i);
    const linkAltMatch = entryXml.match(
      /<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']*)["'][^>]*\/?>/i
    );
    if (linkAltMatch) {
      link = linkAltMatch[1];
    } else if (linkHrefMatch) {
      link = linkHrefMatch[1];
    }

    items.push({
      title: cleanHtml(extractTag(entryXml, "title")),
      description: cleanHtml(extractTag(entryXml, "summary")),
      content: cleanHtml(extractTag(entryXml, "content")),
      link: link,
      pubDate: parseDate(
        extractTag(entryXml, "published") || extractTag(entryXml, "updated")
      ),
    });
  }

  return { title: cleanHtml(title), items };
}

/**
 * Extract content from an XML tag
 */
function extractTag(xml, tagName, parentTag = null) {
  let searchXml = xml;

  // If parentTag is specified, first find the parent
  if (parentTag) {
    const parentMatch = searchXml.match(
      new RegExp(`<${parentTag}[^>]*>([\\s\\S]*?)<\\/${parentTag}>`, "i")
    );
    if (parentMatch) {
      searchXml = parentMatch[1];
    }
  }

  // Handle CDATA sections
  const cdataMatch = searchXml.match(
    new RegExp(`<${tagName}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tagName}>`, "i")
  );
  if (cdataMatch) {
    return cdataMatch[1];
  }

  // Handle regular tags
  const match = searchXml.match(
    new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i")
  );
  return match ? match[1] : "";
}

/**
 * Clean HTML content and extract plain text
 */
function cleanHtml(html) {
  if (!html) return "";

  return html
    // Decode common HTML entities
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    // Remove HTML tags
    .replace(/<[^>]+>/g, "")
    // Normalize whitespace
    .replace(/\s+/g, " ")
    .trim()
    // Truncate to reasonable length for excerpt
    .slice(0, 500);
}

/**
 * Parse various date formats to ISO string
 */
function parseDate(dateStr) {
  if (!dateStr) return new Date().toISOString();

  try {
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date.toISOString();
    }
  } catch {
    // Fall through to return current date
  }

  return new Date().toISOString();
}

// ============================================================================
// Article Aggregation Helpers
// ============================================================================

/**
 * Merge sort articles from multiple feeds
 * @param {Array} feedIndexes - Array of feed objects with articles array
 * @param {boolean} newestFirst - If true, sort newest first; if false, oldest first
 * @param {number} limit - Maximum number of article refs to return
 * @returns {Array<Object>} - Array of {feedId, articleId} objects in sorted order
 */
function mergeSortArticles(feedIndexes, newestFirst = true, limit = 50) {
  const articleRefs = [];

  // Initialize pointers for each feed (all start at 0)
  const pointers = new Array(feedIndexes.length).fill(0);

  while (articleRefs.length < limit) {
    let selectedFeedIndex = -1;
    let selectedTimestamp = newestFirst ? -Infinity : Infinity;

    // Find the next article to include
    for (let i = 0; i < feedIndexes.length; i++) {
      const feed = feedIndexes[i];
      const pointer = pointers[i];

      // Skip if this feed is exhausted
      if (!feed.articles || pointer >= feed.articles.length) {
        continue;
      }

      const article = feed.articles[pointer];
      const timestamp = article.timestamp;

      // Select this article if it's newer (or older, depending on sort order)
      if (newestFirst) {
        if (timestamp > selectedTimestamp) {
          selectedTimestamp = timestamp;
          selectedFeedIndex = i;
        }
      } else {
        if (timestamp < selectedTimestamp) {
          selectedTimestamp = timestamp;
          selectedFeedIndex = i;
        }
      }
    }

    // If no article was selected, we've exhausted all feeds
    if (selectedFeedIndex === -1) {
      break;
    }

    // Add the selected article reference and advance its pointer
    const selectedFeed = feedIndexes[selectedFeedIndex];
    const selectedArticle =
      selectedFeed.articles[pointers[selectedFeedIndex]];
    articleRefs.push({
      feedId: selectedFeed.id,
      articleId: selectedArticle.id,
      timestamp: selectedArticle.timestamp,
    });
    pointers[selectedFeedIndex]++;
  }

  return articleRefs;
}

// ============================================================================
// KV Storage Helpers
// ============================================================================

/**
 * Get feed metadata list
 * Returns array of feed objects (without article indexes)
 */
async function getFeeds(env) {
  if (!env.RSS_STORE) {
    return [];
  }
  const data = await env.RSS_STORE.get(FEEDS_KEY);
  return data ? JSON.parse(data) : [];
}

/**
 * Save feed metadata list
 */
async function saveFeeds(env, feeds) {
  if (!env.RSS_STORE) {
    return;
  }
  await env.RSS_STORE.put(FEEDS_KEY, JSON.stringify(feeds));
}

/**
 * Get a single feed with its article index
 * Returns: { id, name, url, lastFetched, articles: [{id, timestamp}] }
 */
async function getFeed(env, feedId) {
  if (!env.RSS_STORE) {
    return null;
  }
  const data = await env.RSS_STORE.get(`feed:${feedId}`);
  return data ? JSON.parse(data) : null;
}

/**
 * Save a single feed with its article index
 */
async function saveFeed(env, feed) {
  if (!env.RSS_STORE) {
    return;
  }
  await env.RSS_STORE.put(`feed:${feed.id}`, JSON.stringify(feed));
}

/**
 * Get a single article by ID
 * Articles are nested under their feed: feed:{feedId}:article:{articleId}
 */
async function getArticle(env, feedId, articleId) {
  if (!env.RSS_STORE) {
    return null;
  }
  const data = await env.RSS_STORE.get(`feed:${feedId}:article:${articleId}`);
  return data ? JSON.parse(data) : null;
}

/**
 * Get multiple articles by IDs with their feed IDs (parallel batch fetch)
 * @param {Array} articleRefs - Array of {feedId, articleId} objects
 */
async function getArticles(env, articleRefs) {
  if (!env.RSS_STORE || !articleRefs || articleRefs.length === 0) {
    return [];
  }
  const articles = await Promise.all(
    articleRefs.map((ref) => getArticle(env, ref.feedId, ref.articleId))
  );
  return articles.filter((a) => a !== null);
}

/**
 * Save a single article
 * Nested under feed: feed:{feedId}:article:{articleId}
 */
async function saveArticle(env, article) {
  if (!env.RSS_STORE) {
    return;
  }
  await env.RSS_STORE.put(
    `feed:${article.feedId}:article:${article.id}`,
    JSON.stringify(article)
  );
}

/**
 * Save multiple articles (parallel batch write)
 */
async function saveArticles(env, articles) {
  if (!env.RSS_STORE || !articles || articles.length === 0) {
    return;
  }
  await Promise.all(articles.map((article) => saveArticle(env, article)));
}

/**
 * Delete a single article
 */
async function deleteArticle(env, feedId, articleId) {
  if (!env.RSS_STORE) {
    return;
  }
  await env.RSS_STORE.delete(`feed:${feedId}:article:${articleId}`);
}

/**
 * Delete all articles for a feed
 */
async function deleteArticlesForFeed(env, feedId, articleIds) {
  if (!env.RSS_STORE || !articleIds || articleIds.length === 0) {
    return;
  }
  await Promise.all(
    articleIds.map((articleId) => deleteArticle(env, feedId, articleId))
  );
}

/**
 * Get user subscriptions
 * Returns object: {
 *   feeds: [{
 *     feedId,
 *     caughtUpToTimestamp,
 *     manuallyReadBefore: [articleId, ...]
 *   }]
 * }
 */
async function getUserSubscriptions(env, userId = DEFAULT_USER_ID) {
  if (!env.RSS_STORE) {
    return { feeds: [] };
  }
  const data = await env.RSS_STORE.get(`user:${userId}:subscriptions`);
  return data ? JSON.parse(data) : { feeds: [] };
}

/**
 * Save user subscriptions
 */
async function saveUserSubscriptions(env, subscriptions, userId = DEFAULT_USER_ID) {
  if (!env.RSS_STORE) {
    return;
  }
  await env.RSS_STORE.put(`user:${userId}:subscriptions`, JSON.stringify(subscriptions));
}

/**
 * Get user starred articles
 * Returns object: {articles: [articleId, ...]}
 */
async function getUserStarred(env, userId = DEFAULT_USER_ID) {
  if (!env.RSS_STORE) {
    return { articles: [] };
  }
  const data = await env.RSS_STORE.get(`user:${userId}:starred`);
  return data ? JSON.parse(data) : { articles: [] };
}

/**
 * Save user starred articles
 */
async function saveUserStarred(env, starred, userId = DEFAULT_USER_ID) {
  if (!env.RSS_STORE) {
    return;
  }
  await env.RSS_STORE.put(`user:${userId}:starred`, JSON.stringify(starred));
}

/**
 * Check if an article is read based on user's watermark + exceptions
 * @param {Object} subscription - User's subscription for this feed
 * @param {string} articleId - Article ID to check
 * @param {number} articleTimestamp - Article timestamp
 * @returns {boolean} - True if article is read
 */
function isArticleRead(subscription, articleId, articleTimestamp) {
  if (!subscription) return false;

  // Article is read if it's before the watermark AND not in the exceptions list
  if (articleTimestamp < subscription.caughtUpToTimestamp) {
    return !subscription.manuallyReadBefore.includes(articleId);
  }

  return false;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a unique ID
 */
function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Helper to create JSON responses
 */
function jsonResponse(data, headers = {}, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });
}

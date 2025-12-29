/**
 * RSS Reader Cloudflare Worker Backend
 *
 * This worker serves the RSS Reader SPA and handles API routes.
 * It fetches and parses RSS feeds, stores subscriptions and articles in KV,
 * and manages user state (starred articles).
 */

// KV Keys
const FEEDS_KEY = "feeds";
const ARTICLES_KEY = "articles";
const STARRED_KEY = "starred";
const READ_KEY = "read";

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
 * Get all feeds
 */
async function handleGetFeeds(env, corsHeaders) {
  const feeds = await getFeeds(env);

  // Fetch feed indexes in parallel to get article counts
  const feedIndexes = await Promise.all(
    feeds.map((feed) => getFeed(env, feed.id))
  );

  // Calculate article counts per feed
  const feedsWithCounts = feeds.map((feed, index) => ({
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

  // Save feed metadata
  feeds.push(newFeed);
  await saveFeeds(env, feeds);

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

  // Delete individual articles
  await deleteArticles(env, articleIds);

  // Delete feed index
  if (env.RSS_STORE) {
    await env.RSS_STORE.delete(`feed:${feedId}`);
  }

  // Remove feed metadata
  feeds.splice(feedIndex, 1);
  await saveFeeds(env, feeds);

  // Remove starred status for deleted articles
  const articleIdsSet = new Set(articleIds);
  const starred = await getStarred(env);
  const remainingStarred = starred.filter((id) => !articleIdsSet.has(id));
  await saveStarred(env, remainingStarred);

  // Remove read status for deleted articles
  const read = await getRead(env);
  const remainingRead = read.filter((id) => !articleIdsSet.has(id));
  await saveRead(env, remainingRead);

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
      feedIndex.articles.map((a) => a.id)
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
        feedIndex.articles.map((a) => a.id)
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
  const feeds = await getFeeds(env);
  const starred = await getStarred(env);
  const starredSet = new Set(starred);
  const read = await getRead(env);
  const readSet = new Set(read);

  // Apply filters from query params
  const feedId = url.searchParams.get("feedId");
  const starredOnly = url.searchParams.get("starred") === "true";

  let feedIndexes;
  let articleIds;

  if (starredOnly) {
    // For starred view, just fetch the starred articles directly
    articleIds = starred;
  } else if (feedId) {
    // Single feed view
    const feedIndex = await getFeed(env, feedId);
    if (!feedIndex || !feedIndex.articles) {
      return jsonResponse({ articles: [] }, corsHeaders);
    }
    // Get all article IDs from this feed (already sorted newest first)
    articleIds = feedIndex.articles.map((a) => a.id);
  } else {
    // All feeds view - use merge sort
    feedIndexes = await Promise.all(
      feeds.map((feed) => getFeed(env, feed.id))
    );
    // Filter out any null feeds
    feedIndexes = feedIndexes.filter((f) => f !== null);

    // Merge sort to get article IDs (newest first by default)
    // Limit to 1000 articles for performance
    articleIds = mergeSortArticles(feedIndexes, true, 1000);
  }

  // Fetch the actual article data
  const articles = await getArticles(env, articleIds);

  // Add starred and read status to each article
  const articlesWithStatus = articles.map((a) => ({
    ...a,
    date: new Date(a.timestamp).toISOString(), // Convert timestamp to ISO for frontend
    starred: starredSet.has(a.id),
    read: readSet.has(a.id),
  }));

  return jsonResponse({ articles: articlesWithStatus }, corsHeaders);
}

/**
 * Toggle star status for an article
 */
async function handleToggleStar(articleId, env, corsHeaders) {
  const starred = await getStarred(env);
  const starredSet = new Set(starred);

  let isStarred;
  if (starredSet.has(articleId)) {
    starredSet.delete(articleId);
    isStarred = false;
  } else {
    starredSet.add(articleId);
    isStarred = true;
  }

  await saveStarred(env, Array.from(starredSet));

  return jsonResponse({ articleId, starred: isStarred }, corsHeaders);
}

/**
 * Toggle read status for an article
 */
async function handleToggleRead(articleId, env, corsHeaders) {
  const read = await getRead(env);
  const readSet = new Set(read);

  let isRead;
  if (readSet.has(articleId)) {
    readSet.delete(articleId);
    isRead = false;
  } else {
    readSet.add(articleId);
    isRead = true;
  }

  await saveRead(env, Array.from(readSet));

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
 * @param {number} limit - Maximum number of article IDs to return
 * @returns {Array<string>} - Array of article IDs in sorted order
 */
function mergeSortArticles(feedIndexes, newestFirst = true, limit = 50) {
  const articleIds = [];

  // Initialize pointers for each feed (all start at 0)
  const pointers = new Array(feedIndexes.length).fill(0);

  while (articleIds.length < limit) {
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

    // Add the selected article and advance its pointer
    const selectedArticle = feedIndexes[selectedFeedIndex].articles[pointers[selectedFeedIndex]];
    articleIds.push(selectedArticle.id);
    pointers[selectedFeedIndex]++;
  }

  return articleIds;
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
 * Get all feed IDs using LIST operation
 * Used primarily by cron jobs
 */
async function listAllFeedIds(env) {
  if (!env.RSS_STORE) {
    return [];
  }
  const result = await env.RSS_STORE.list({ prefix: "feed:" });
  return result.keys.map((key) => key.name.replace("feed:", ""));
}

/**
 * Get a single article by ID
 */
async function getArticle(env, articleId) {
  if (!env.RSS_STORE) {
    return null;
  }
  const data = await env.RSS_STORE.get(`article:${articleId}`);
  return data ? JSON.parse(data) : null;
}

/**
 * Get multiple articles by IDs (parallel batch fetch)
 */
async function getArticles(env, articleIds) {
  if (!env.RSS_STORE || !articleIds || articleIds.length === 0) {
    return [];
  }
  const articles = await Promise.all(
    articleIds.map((id) => getArticle(env, id))
  );
  return articles.filter((a) => a !== null);
}

/**
 * Save a single article
 */
async function saveArticle(env, article) {
  if (!env.RSS_STORE) {
    return;
  }
  await env.RSS_STORE.put(`article:${article.id}`, JSON.stringify(article));
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
async function deleteArticle(env, articleId) {
  if (!env.RSS_STORE) {
    return;
  }
  await env.RSS_STORE.delete(`article:${articleId}`);
}

/**
 * Delete multiple articles (parallel batch delete)
 */
async function deleteArticles(env, articleIds) {
  if (!env.RSS_STORE || !articleIds || articleIds.length === 0) {
    return;
  }
  await Promise.all(articleIds.map((id) => deleteArticle(env, id)));
}

async function getStarred(env) {
  if (!env.RSS_STORE) {
    return [];
  }
  const data = await env.RSS_STORE.get(STARRED_KEY);
  return data ? JSON.parse(data) : [];
}

async function saveStarred(env, starred) {
  if (!env.RSS_STORE) {
    return;
  }
  await env.RSS_STORE.put(STARRED_KEY, JSON.stringify(starred));
}

async function getRead(env) {
  if (!env.RSS_STORE) {
    return [];
  }
  const data = await env.RSS_STORE.get(READ_KEY);
  return data ? JSON.parse(data) : [];
}

async function saveRead(env, read) {
  if (!env.RSS_STORE) {
    return;
  }
  await env.RSS_STORE.put(READ_KEY, JSON.stringify(read));
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

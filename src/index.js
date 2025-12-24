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
  const articles = await getArticles(env);

  // Calculate article counts per feed
  const feedsWithCounts = feeds.map((feed) => ({
    ...feed,
    count: articles.filter((a) => a.feedId === feed.id).length,
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
  const newFeed = {
    id: generateId(),
    name: name || parsedFeed.title || feedUrl.hostname,
    url: url,
    lastFetched: new Date().toISOString(),
  };

  // Save feed
  feeds.push(newFeed);
  await saveFeeds(env, feeds);

  // Save articles from the feed
  const articles = await getArticles(env);
  const newArticles = parsedFeed.items.map((item) => ({
    id: generateId(),
    feedId: newFeed.id,
    title: item.title || "Untitled",
    excerpt: item.description || item.content || "",
    link: item.link || "",
    source: newFeed.name,
    sourceUrl: url,
    date: item.pubDate || new Date().toISOString(),
    read: false,
  }));

  await saveArticles(env, [...articles, ...newArticles]);

  return jsonResponse(
    {
      feed: { ...newFeed, count: newArticles.length },
      articlesAdded: newArticles.length,
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

  // Remove feed
  feeds.splice(feedIndex, 1);
  await saveFeeds(env, feeds);

  // Remove articles from this feed
  const articles = await getArticles(env);
  const remainingArticles = articles.filter((a) => a.feedId !== feedId);
  await saveArticles(env, remainingArticles);

  // Remove starred status for deleted articles
  const starred = await getStarred(env);
  const articleIdsToRemove = new Set(
    articles.filter((a) => a.feedId === feedId).map((a) => a.id)
  );
  const remainingStarred = starred.filter((id) => !articleIdsToRemove.has(id));
  await saveStarred(env, remainingStarred);

  return jsonResponse({ success: true }, corsHeaders);
}

/**
 * Refresh a specific feed
 */
async function handleRefreshFeed(feedId, env, corsHeaders) {
  const feeds = await getFeeds(env);
  const feed = feeds.find((f) => f.id === feedId);

  if (!feed) {
    return jsonResponse({ error: "Feed not found" }, corsHeaders, 404);
  }

  try {
    const parsedFeed = await fetchAndParseFeed(feed.url);
    const articles = await getArticles(env);

    // Get existing article links for this feed to avoid duplicates
    const existingLinks = new Set(
      articles.filter((a) => a.feedId === feedId).map((a) => a.link)
    );

    // Add new articles
    const newArticles = parsedFeed.items
      .filter((item) => item.link && !existingLinks.has(item.link))
      .map((item) => ({
        id: generateId(),
        feedId: feed.id,
        title: item.title || "Untitled",
        excerpt: item.description || item.content || "",
        link: item.link || "",
        source: feed.name,
        sourceUrl: feed.url,
        date: item.pubDate || new Date().toISOString(),
        read: false,
      }));

    if (newArticles.length > 0) {
      await saveArticles(env, [...articles, ...newArticles]);
    }

    // Update feed's lastFetched
    feed.lastFetched = new Date().toISOString();
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
 * Refresh all feeds
 */
async function handleRefreshAll(env, corsHeaders) {
  const feeds = await getFeeds(env);
  const results = [];

  for (const feed of feeds) {
    try {
      const parsedFeed = await fetchAndParseFeed(feed.url);
      const articles = await getArticles(env);

      const existingLinks = new Set(
        articles.filter((a) => a.feedId === feed.id).map((a) => a.link)
      );

      const newArticles = parsedFeed.items
        .filter((item) => item.link && !existingLinks.has(item.link))
        .map((item) => ({
          id: generateId(),
          feedId: feed.id,
          title: item.title || "Untitled",
          excerpt: item.description || item.content || "",
          link: item.link || "",
          source: feed.name,
          sourceUrl: feed.url,
          date: item.pubDate || new Date().toISOString(),
          read: false,
        }));

      if (newArticles.length > 0) {
        await saveArticles(env, [...articles, ...newArticles]);
      }

      feed.lastFetched = new Date().toISOString();
      results.push({ feedId: feed.id, name: feed.name, newArticles: newArticles.length });
    } catch (error) {
      results.push({ feedId: feed.id, name: feed.name, error: error.message });
    }
  }

  await saveFeeds(env, feeds);

  return jsonResponse({ results }, corsHeaders);
}

/**
 * Get all articles
 */
async function handleGetArticles(url, env, corsHeaders) {
  const articles = await getArticles(env);
  const starred = await getStarred(env);
  const starredSet = new Set(starred);

  // Apply filters from query params
  const feedId = url.searchParams.get("feedId");
  const starredOnly = url.searchParams.get("starred") === "true";

  let filteredArticles = articles;

  if (feedId) {
    filteredArticles = filteredArticles.filter((a) => a.feedId === feedId);
  }

  if (starredOnly) {
    filteredArticles = filteredArticles.filter((a) => starredSet.has(a.id));
  }

  // Add starred status to each article
  const articlesWithStarred = filteredArticles.map((a) => ({
    ...a,
    starred: starredSet.has(a.id),
  }));

  // Sort by date, newest first
  articlesWithStarred.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  return jsonResponse({ articles: articlesWithStarred }, corsHeaders);
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
// KV Storage Helpers
// ============================================================================

async function getFeeds(env) {
  if (!env.RSS_STORE) {
    return [];
  }
  const data = await env.RSS_STORE.get(FEEDS_KEY);
  return data ? JSON.parse(data) : [];
}

async function saveFeeds(env, feeds) {
  if (!env.RSS_STORE) {
    // KV not configured - data won't persist but operation succeeds
    return;
  }
  await env.RSS_STORE.put(FEEDS_KEY, JSON.stringify(feeds));
}

async function getArticles(env) {
  if (!env.RSS_STORE) {
    return [];
  }
  const data = await env.RSS_STORE.get(ARTICLES_KEY);
  return data ? JSON.parse(data) : [];
}

async function saveArticles(env, articles) {
  if (!env.RSS_STORE) {
    // KV not configured - data won't persist but operation succeeds
    return;
  }
  await env.RSS_STORE.put(ARTICLES_KEY, JSON.stringify(articles));
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
    // KV not configured - data won't persist but operation succeeds
    return;
  }
  await env.RSS_STORE.put(STARRED_KEY, JSON.stringify(starred));
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

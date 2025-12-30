/**
 * RSS Reader Cloudflare Worker Backend
 *
 * This worker serves the RSS Reader SPA and handles API routes.
 * It fetches and parses RSS feeds, stores subscriptions and articles in KV,
 * and manages user state (starred articles).
 */

import { Storage } from "./storage.js";

/**
 * Get or create storage instance from env
 */
function getStorage(env) {
  if (!env.RSS_STORE) {
    throw new Error("RSS_STORE not available");
  }
  return new Storage(env.RSS_STORE);
}

/**
 * Get user ID from request
 * In production, extracts from Cloudflare Zero Trust headers
 * Falls back to "default" for local development
 */
function getUserId(request) {
  // Try to get user email from Cloudflare Access headers
  const userEmail = request.headers.get("Cf-Access-Authenticated-User-Email");
  if (userEmail) {
    // Use email as user ID (could be hashed or mapped to internal ID)
    return userEmail;
  }

  // Fallback to default for local development
  return "default";
}

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
        return await handleGetFeeds(request, env, corsHeaders);
      }
      if (method === "POST") {
        return await handleAddFeed(request, env, corsHeaders);
      }
    }

    // Delete feed
    const feedDeleteMatch = path.match(/^\/api\/feeds\/([^/]+)$/);
    if (feedDeleteMatch && method === "DELETE") {
      return await handleDeleteFeed(request, feedDeleteMatch[1], env, corsHeaders);
    }

    // Refresh specific feed
    const feedRefreshMatch = path.match(/^\/api\/feeds\/([^/]+)\/refresh$/);
    if (feedRefreshMatch && method === "POST") {
      return await handleRefreshFeed(request, feedRefreshMatch[1], env, corsHeaders);
    }

    // Article endpoints
    if (path === "/api/articles" && method === "GET") {
      return await handleGetArticles(request, url, env, corsHeaders);
    }

    // Star/unstar article
    const starMatch = path.match(/^\/api\/articles\/([^/]+)\/star$/);
    if (starMatch && method === "POST") {
      return await handleToggleStar(request, starMatch[1], env, corsHeaders);
    }

    // Mark article as read/unread
    const readMatch = path.match(/^\/api\/articles\/([^/]+)\/read$/);
    if (readMatch && method === "POST") {
      return await handleToggleRead(request, readMatch[1], env, corsHeaders);
    }

    // Refresh all feeds
    if (path === "/api/refresh" && method === "POST") {
      return await handleRefreshAll(request, env, corsHeaders);
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
async function handleGetFeeds(request, env, corsHeaders) {
  const storage = getStorage(env);
  const userId = getUserId(request);
  const userSubs = await storage.getUserSubscriptions(userId);
  const feeds = await storage.getFeeds();

  // Get only feeds user is subscribed to
  const subscribedFeedIds = new Set(userSubs.feeds.map((sub) => sub.feedId));
  const subscribedFeeds = feeds.filter((feed) => subscribedFeedIds.has(feed.id));

  // Fetch feed indexes in parallel to get article counts
  const feedIndexes = await Promise.all(
    subscribedFeeds.map((feed) => storage.getFeedIndex(feed.id))
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
  const storage = getStorage(env);
  const userId = getUserId(request);
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

  // Generate feed ID from normalized URL hash
  const newFeedId = await generateFeedId(url);

  // Check if feed already exists (by ID, since ID is derived from URL)
  const feeds = await storage.getFeeds();
  if (feeds.some((f) => f.id === newFeedId)) {
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
    id: newFeedId,
    name: name || parsedFeed.title || feedUrl.hostname,
    url: url,
    lastFetched: new Date().toISOString(),
  };

  // Add feed (creates both global registry entry and feed index)
  await storage.addFeed(newFeed);

  // Add to user's subscriptions with watermark at 0 (all articles unread)
  await storage.addUserSubscription(newFeedId, userId);

  // Create articles from the feed
  const newArticles = parsedFeed.items.map((item) => ({
    id: generateId(),
    feedId: newFeedId,
    title: item.title || "Untitled",
    excerpt: item.description || item.content || "",
    link: item.link || "",
    commentsUrl: item.commentsUrl || "",
    source: newFeed.name,
    sourceUrl: url,
    timestamp: new Date(item.pubDate || new Date()).getTime(),
  }));

  // Save individual articles (automatically updates feed index)
  for (const article of newArticles) {
    await storage.saveArticle(article);
  }

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
async function handleDeleteFeed(request, feedId, env, corsHeaders) {
  const storage = getStorage(env);
  const userId = getUserId(request);
  const feeds = await storage.getFeeds();
  const feed = feeds.find((f) => f.id === feedId);

  if (!feed) {
    return jsonResponse({ error: "Feed not found" }, corsHeaders, 404);
  }

  // Get feed index to find all article IDs
  const feedIndex = await storage.getFeedIndex(feedId);
  const articleIds = feedIndex?.articles?.map((a) => a.id) || [];

  // Remove feed (deletes feed, feed index, and all articles)
  await storage.removeFeed(feedId);

  // Remove from user's subscriptions
  await storage.removeUserSubscription(feedId, userId);

  // Remove starred status for deleted articles
  const articleIdsSet = new Set(articleIds);
  const starred = await storage.getUserStarred(userId);
  const remainingStarred = starred.articles.filter(
    (id) => !articleIdsSet.has(id)
  );
  if (env.RSS_STORE) {
    await env.RSS_STORE.put(
      `user:${userId}:starred`,
      JSON.stringify({ articles: remainingStarred })
    );
  }

  return jsonResponse({ success: true }, corsHeaders);
}

/**
 * Refresh a specific feed
 */
async function handleRefreshFeed(request, feedId, env, corsHeaders) {
  const storage = getStorage(env);
  const feeds = await storage.getFeeds();
  const feedMeta = feeds.find((f) => f.id === feedId);

  if (!feedMeta) {
    return jsonResponse({ error: "Feed not found" }, corsHeaders, 404);
  }

  try {
    const parsedFeed = await fetchAndParseFeed(feedMeta.url);
    const feedIndex = await storage.getFeedIndex(feedId);

    if (!feedIndex) {
      return jsonResponse({ error: "Feed index not found" }, corsHeaders, 404);
    }

    // Get existing article links to avoid duplicates
    const articleRefs = feedIndex.articles.map((a) => ({
      feedId: feedId,
      articleId: a.id,
    }));
    const existingArticleData = await storage.getArticles(articleRefs);
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
        commentsUrl: item.commentsUrl || "",
        source: feedMeta.name,
        sourceUrl: feedMeta.url,
        timestamp: new Date(item.pubDate || new Date()).getTime(),
      }));

    if (newArticles.length > 0) {
      // Save individual articles (automatically updates feed index)
      for (const article of newArticles) {
        await storage.saveArticle(article);
      }
    }

    // Update feed metadata's lastFetched
    await storage.updateFeedMetadata(feedId, {
      lastFetched: new Date().toISOString(),
    });

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
  const storage = getStorage(env);
  const feeds = await storage.getFeeds();
  const results = [];

  for (const feedMeta of feeds) {
    try {
      const parsedFeed = await fetchAndParseFeed(feedMeta.url);
      const feedIndex = await storage.getFeedIndex(feedMeta.id);

      if (!feedIndex) {
        results.push({
          feedId: feedMeta.id,
          name: feedMeta.name,
          error: "Feed index not found",
        });
        continue;
      }

      // Get existing article links to avoid duplicates
      const articleRefs = feedIndex.articles.map((a) => ({
        feedId: feedMeta.id,
        articleId: a.id,
      }));
      const existingArticleData = await storage.getArticles(articleRefs);
      const existingLinks = new Set(existingArticleData.map((a) => a.link));

      const newArticles = parsedFeed.items
        .filter((item) => item.link && !existingLinks.has(item.link))
        .map((item) => ({
          id: generateId(),
          feedId: feedMeta.id,
          title: item.title || "Untitled",
          excerpt: item.description || item.content || "",
          link: item.link || "",
          commentsUrl: item.commentsUrl || "",
          source: feedMeta.name,
          sourceUrl: feedMeta.url,
          timestamp: new Date(item.pubDate || new Date()).getTime(),
        }));

      if (newArticles.length > 0) {
        // Save individual articles (automatically updates feed index)
        for (const article of newArticles) {
          await storage.saveArticle(article);
        }

        // Update feed metadata's lastFetched
        await storage.updateFeedMetadata(feedMeta.id, {
          lastFetched: new Date().toISOString(),
        });
      }

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

  return results;
}

/**
 * Refresh all feeds (API handler)
 */
async function handleRefreshAll(request, env, corsHeaders) {
  const results = await refreshAllFeeds(env);
  return jsonResponse({ results }, corsHeaders);
}

/**
 * Get all articles
 */
async function handleGetArticles(request, url, env, corsHeaders) {
  const storage = getStorage(env);
  const userId = getUserId(request);
  const userSubs = await storage.getUserSubscriptions(userId);
  const starred = await storage.getUserStarred(userId);
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
      userSubs.feeds.map((sub) => storage.getFeedIndex(sub.feedId))
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
    const feedIndex = await storage.getFeedIndex(feedId);
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
      userSubs.feeds.map((sub) => storage.getFeedIndex(sub.feedId))
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
  const articles = await storage.getArticles(articleRefs);

  // Get manual read list
  const readData = await storage.getUserRead(userId);
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
async function handleToggleStar(request, articleId, env, corsHeaders) {
  const storage = getStorage(env);
  const userId = getUserId(request);
  const isStarred = await storage.isArticleStarred(articleId, userId);

  if (isStarred) {
    await storage.removeStarredArticle(articleId, userId);
  } else {
    await storage.addStarredArticle(articleId, userId);
  }

  return jsonResponse({ articleId, starred: !isStarred }, corsHeaders);
}

/**
 * Toggle read status for an article
 * For simplicity with watermark tracking, just toggle a simple read list
 * (Watermark will be used for bulk "mark all as read" operations)
 */
async function handleToggleRead(request, articleId, env, corsHeaders) {
  const storage = getStorage(env);
  const userId = getUserId(request);
  const isRead = await storage.isArticleRead(articleId, userId);

  if (isRead) {
    await storage.removeReadArticle(articleId, userId);
  } else {
    await storage.addReadArticle(articleId, userId);
  }

  return jsonResponse({ articleId, read: !isRead }, corsHeaders);
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
    // Extract comments URL (e.g., Hacker News uses <comments> tag)
    const commentsUrl = extractTag(itemXml, "comments");

    items.push({
      title: cleanHtml(extractTag(itemXml, "title")),
      // Use cleanHtml for description (plain text excerpt)
      // Links in description are handled separately via commentsUrl
      description: cleanHtml(extractTag(itemXml, "description")),
      content: cleanHtml(
        extractTag(itemXml, "content:encoded") || extractTag(itemXml, "content")
      ),
      link: extractTag(itemXml, "link"),
      commentsUrl: commentsUrl || "",
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
      commentsUrl: "", // Atom feeds typically don't have a separate comments URL
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
 * Sanitize HTML using OWASP-style whitelist approach
 * Only allows safe tags and attributes, strips everything else
 */
function sanitizeHtml(html) {
  if (!html) return "";

  // Decode HTML entities first
  let decoded = html
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");

  // Whitelist of allowed tags (OWASP recommendation: minimal set)
  const allowedTags = new Set([
    "a",
    "p",
    "br",
    "b",
    "strong",
    "i",
    "em",
    "ul",
    "ol",
    "li",
    "blockquote",
    "code",
    "pre",
  ]);

  // Whitelist of allowed attributes per tag
  const allowedAttributes = {
    a: ["href", "title"],
  };

  // Process HTML: parse tags and filter
  let result = "";
  let lastIndex = 0;

  // Match all HTML tags (opening, closing, self-closing)
  const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9]*)\s*([^>]*)?\/?>/g;
  let match;

  while ((match = tagRegex.exec(decoded)) !== null) {
    // Add text before this tag
    result += escapeHtmlText(decoded.slice(lastIndex, match.index));
    lastIndex = match.index + match[0].length;

    const fullMatch = match[0];
    const tagName = match[1].toLowerCase();
    const attributesStr = match[2] || "";
    const isClosing = fullMatch.startsWith("</");
    const isSelfClosing = fullMatch.endsWith("/>") || tagName === "br";

    if (!allowedTags.has(tagName)) {
      // Tag not allowed, skip it entirely
      continue;
    }

    if (isClosing) {
      result += `</${tagName}>`;
    } else {
      // Parse and filter attributes
      const safeAttrs = parseAndFilterAttributes(
        attributesStr,
        tagName,
        allowedAttributes
      );

      if (isSelfClosing || tagName === "br") {
        result += `<${tagName}${safeAttrs} />`;
      } else {
        result += `<${tagName}${safeAttrs}>`;
      }
    }
  }

  // Add any remaining text after the last tag
  result += escapeHtmlText(decoded.slice(lastIndex));

  // Normalize whitespace and truncate
  return result.replace(/\s+/g, " ").trim().slice(0, 1000);
}

/**
 * Escape HTML special characters in text content
 */
function escapeHtmlText(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Parse attributes string and filter to only allowed attributes with safe values
 */
function parseAndFilterAttributes(attrStr, tagName, allowedAttributes) {
  if (!attrStr || !allowedAttributes[tagName]) {
    return "";
  }

  const allowed = allowedAttributes[tagName];
  const result = [];

  // Match attribute patterns: name="value" or name='value' or name=value
  const attrRegex = /([a-zA-Z][a-zA-Z0-9-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let match;

  while ((match = attrRegex.exec(attrStr)) !== null) {
    const attrName = match[1].toLowerCase();
    const attrValue = match[2] ?? match[3] ?? match[4] ?? "";

    if (!allowed.includes(attrName)) {
      continue;
    }

    // Special validation for href attribute (OWASP: prevent javascript: and data: URLs)
    if (attrName === "href") {
      const safeUrl = validateUrl(attrValue);
      if (safeUrl) {
        result.push(`${attrName}="${escapeHtmlText(safeUrl)}"`);
      }
    } else {
      result.push(`${attrName}="${escapeHtmlText(attrValue)}"`);
    }
  }

  return result.length > 0 ? " " + result.join(" ") : "";
}

/**
 * Validate URL is safe (OWASP: only allow http/https protocols)
 */
function validateUrl(url) {
  if (!url) return null;

  // Trim and check for dangerous protocols
  const trimmed = url.trim().toLowerCase();

  // Block javascript:, data:, vbscript:, and other dangerous protocols
  if (
    trimmed.startsWith("javascript:") ||
    trimmed.startsWith("data:") ||
    trimmed.startsWith("vbscript:") ||
    trimmed.startsWith("file:")
  ) {
    return null;
  }

  // Allow http, https, and relative URLs
  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("#") ||
    (!trimmed.includes(":") && !trimmed.startsWith("//"))
  ) {
    return url.trim();
  }

  return null;
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
// Helper Functions
// ============================================================================

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
 * Generate a unique ID (for articles)
 */
function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Normalize a URL for consistent hashing
 * - Lowercases hostname
 * - Removes trailing slashes from path
 * - Sorts query parameters
 * - Removes default ports
 */
function normalizeUrl(urlString) {
  const url = new URL(urlString);

  // Lowercase hostname
  url.hostname = url.hostname.toLowerCase();

  // Remove default ports
  if (
    (url.protocol === "http:" && url.port === "80") ||
    (url.protocol === "https:" && url.port === "443")
  ) {
    url.port = "";
  }

  // Remove trailing slash from path (unless it's just "/")
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
  }

  // Sort query parameters for consistency
  const params = new URLSearchParams(url.search);
  const sortedParams = new URLSearchParams([...params.entries()].sort());
  url.search = sortedParams.toString();

  return url.toString();
}

/**
 * Generate a feed ID by hashing the normalized URL
 * Returns a hex string (first 16 chars of SHA-256 hash)
 */
async function generateFeedId(feedUrl) {
  const normalized = normalizeUrl(feedUrl);
  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  // Use first 16 characters (64 bits) for a reasonable ID length
  return hashHex.slice(0, 16);
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

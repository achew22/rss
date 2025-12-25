/**
 * Mock RSS Feed Server
 *
 * This module creates a simple HTTP server that serves mock RSS feeds
 * for end-to-end testing. Each feed can be configured with custom articles.
 */

import http from 'http';

/**
 * Sample RSS feed data
 */
const feeds = {
  'tech-news': {
    title: 'Tech News Daily',
    description: 'Latest technology news and updates',
    articles: [
      {
        title: 'Breaking: New JavaScript Framework Released',
        description: 'A revolutionary new JavaScript framework promises to change web development forever.',
        link: '/articles/js-framework',
        pubDate: new Date(Date.now() - 1000 * 60 * 60).toUTCString(), // 1 hour ago
      },
      {
        title: 'Cloud Computing Trends for 2025',
        description: 'Experts predict major shifts in cloud infrastructure and edge computing.',
        link: '/articles/cloud-trends',
        pubDate: new Date(Date.now() - 1000 * 60 * 60 * 2).toUTCString(), // 2 hours ago
      },
      {
        title: 'AI Advances in Software Development',
        description: 'How artificial intelligence is transforming the way we write code.',
        link: '/articles/ai-dev',
        pubDate: new Date(Date.now() - 1000 * 60 * 60 * 24).toUTCString(), // 1 day ago
      },
    ],
  },
  'web-dev': {
    title: 'Web Development Weekly',
    description: 'Tips, tricks, and tutorials for web developers',
    articles: [
      {
        title: 'CSS Grid vs Flexbox: When to Use Each',
        description: 'A comprehensive guide to choosing the right layout system.',
        link: '/articles/css-layouts',
        pubDate: new Date(Date.now() - 1000 * 60 * 30).toUTCString(), // 30 minutes ago
      },
      {
        title: 'Building Accessible Web Applications',
        description: 'Best practices for creating inclusive user experiences.',
        link: '/articles/accessibility',
        pubDate: new Date(Date.now() - 1000 * 60 * 60 * 5).toUTCString(), // 5 hours ago
      },
    ],
  },
  'cloudflare': {
    title: 'Cloudflare Updates',
    description: 'News from Cloudflare',
    articles: [
      {
        title: 'Workers Now Support WebSockets',
        description: 'Cloudflare Workers can now handle WebSocket connections.',
        link: '/articles/websockets',
        pubDate: new Date(Date.now() - 1000 * 60 * 15).toUTCString(), // 15 minutes ago
      },
      {
        title: 'KV Storage Performance Improvements',
        description: 'New optimizations reduce latency by 50%.',
        link: '/articles/kv-perf',
        pubDate: new Date(Date.now() - 1000 * 60 * 60 * 3).toUTCString(), // 3 hours ago
      },
      {
        title: 'Introducing Durable Objects',
        description: 'Stateful serverless with Durable Objects.',
        link: '/articles/durable-objects',
        pubDate: new Date(Date.now() - 1000 * 60 * 60 * 48).toUTCString(), // 2 days ago
      },
    ],
  },
};

// Dynamic articles that can be added during tests
const dynamicArticles = {};

/**
 * Generate RSS 2.0 XML for a feed
 */
function generateRssFeed(feedId, baseUrl) {
  const feed = feeds[feedId];
  if (!feed) {
    return null;
  }

  const allArticles = [
    ...feed.articles,
    ...(dynamicArticles[feedId] || []),
  ];

  const items = allArticles
    .map(
      (article) => `
    <item>
      <title>${escapeXml(article.title)}</title>
      <description><![CDATA[${article.description}]]></description>
      <link>${baseUrl}${article.link}</link>
      <pubDate>${article.pubDate}</pubDate>
      <guid>${baseUrl}${article.link}</guid>
    </item>`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(feed.title)}</title>
    <description>${escapeXml(feed.description)}</description>
    <link>${baseUrl}</link>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    ${items}
  </channel>
</rss>`;
}

/**
 * Generate Atom XML for a feed
 */
function generateAtomFeed(feedId, baseUrl) {
  const feed = feeds[feedId];
  if (!feed) {
    return null;
  }

  const allArticles = [
    ...feed.articles,
    ...(dynamicArticles[feedId] || []),
  ];

  const entries = allArticles
    .map(
      (article) => `
  <entry>
    <title>${escapeXml(article.title)}</title>
    <summary>${escapeXml(article.description)}</summary>
    <link rel="alternate" href="${baseUrl}${article.link}"/>
    <id>${baseUrl}${article.link}</id>
    <published>${new Date(article.pubDate).toISOString()}</published>
    <updated>${new Date(article.pubDate).toISOString()}</updated>
  </entry>`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${escapeXml(feed.title)}</title>
  <subtitle>${escapeXml(feed.description)}</subtitle>
  <link rel="self" href="${baseUrl}/feeds/${feedId}/atom"/>
  <link rel="alternate" href="${baseUrl}"/>
  <id>${baseUrl}/feeds/${feedId}</id>
  <updated>${new Date().toISOString()}</updated>
  ${entries}
</feed>`;
}

/**
 * Escape special XML characters
 */
function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Create and start the mock RSS server
 */
export function createMockRssServer(port = 3001) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    const baseUrl = `http://localhost:${port}`;

    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Route: GET /feeds - List available feeds
    if (url.pathname === '/feeds' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          feeds: Object.keys(feeds).map((id) => ({
            id,
            title: feeds[id].title,
            rssUrl: `${baseUrl}/feeds/${id}/rss`,
            atomUrl: `${baseUrl}/feeds/${id}/atom`,
          })),
        })
      );
      return;
    }

    // Route: GET /feeds/:id/rss - Get RSS feed
    const rssMatch = url.pathname.match(/^\/feeds\/([^/]+)\/rss$/);
    if (rssMatch && req.method === 'GET') {
      const feedId = rssMatch[1];
      const xml = generateRssFeed(feedId, baseUrl);
      if (xml) {
        res.writeHead(200, { 'Content-Type': 'application/rss+xml' });
        res.end(xml);
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Feed not found' }));
      }
      return;
    }

    // Route: GET /feeds/:id/atom - Get Atom feed
    const atomMatch = url.pathname.match(/^\/feeds\/([^/]+)\/atom$/);
    if (atomMatch && req.method === 'GET') {
      const feedId = atomMatch[1];
      const xml = generateAtomFeed(feedId, baseUrl);
      if (xml) {
        res.writeHead(200, { 'Content-Type': 'application/atom+xml' });
        res.end(xml);
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Feed not found' }));
      }
      return;
    }

    // Route: POST /feeds/:id/articles - Add a new article dynamically
    const addArticleMatch = url.pathname.match(/^\/feeds\/([^/]+)\/articles$/);
    if (addArticleMatch && req.method === 'POST') {
      const feedId = addArticleMatch[1];
      if (!feeds[feedId]) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Feed not found' }));
        return;
      }

      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          const article = JSON.parse(body);
          if (!dynamicArticles[feedId]) {
            dynamicArticles[feedId] = [];
          }
          const newArticle = {
            title: article.title || 'New Article',
            description: article.description || 'Article content',
            link: article.link || `/articles/${Date.now()}`,
            pubDate: new Date().toUTCString(),
          };
          dynamicArticles[feedId].push(newArticle);
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, article: newArticle }));
        } catch (error) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
      });
      return;
    }

    // Route: DELETE /feeds/:id/articles - Clear dynamic articles
    const clearArticlesMatch = url.pathname.match(/^\/feeds\/([^/]+)\/articles$/);
    if (clearArticlesMatch && req.method === 'DELETE') {
      const feedId = clearArticlesMatch[1];
      dynamicArticles[feedId] = [];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
      return;
    }

    // Route: POST /reset - Reset all dynamic articles
    if (url.pathname === '/reset' && req.method === 'POST') {
      Object.keys(dynamicArticles).forEach((key) => {
        dynamicArticles[key] = [];
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
      return;
    }

    // Default: 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  return {
    start: () =>
      new Promise((resolve) => {
        server.listen(port, () => {
          console.log(`Mock RSS server running on http://localhost:${port}`);
          resolve();
        });
      }),
    stop: () =>
      new Promise((resolve) => {
        server.close(() => {
          console.log('Mock RSS server stopped');
          resolve();
        });
      }),
    reset: () => {
      Object.keys(dynamicArticles).forEach((key) => {
        dynamicArticles[key] = [];
      });
    },
    addArticle: (feedId, article) => {
      if (!dynamicArticles[feedId]) {
        dynamicArticles[feedId] = [];
      }
      dynamicArticles[feedId].push({
        title: article.title || 'New Article',
        description: article.description || 'Article content',
        link: article.link || `/articles/${Date.now()}`,
        pubDate: new Date().toUTCString(),
      });
    },
    getUrl: () => `http://localhost:${port}`,
    getFeeds: () => feeds,
  };
}

export default createMockRssServer;

import { describe, it, expect, beforeEach } from "vitest";
import { SELF, env } from "cloudflare:test";

describe("RSS Reader Worker", () => {
  // Clear KV storage before each test
  beforeEach(async () => {
    if (env.RSS_STORE) {
      await env.RSS_STORE.delete("feeds");
      await env.RSS_STORE.delete("articles");
      await env.RSS_STORE.delete("starred");
    }
  });

  describe("API Routes", () => {
    it("responds with API info at /api/", async () => {
      const response = await SELF.fetch("https://example.com/api/");
      expect(response.status).toBe(200);

      const contentType = response.headers.get("Content-Type");
      expect(contentType).toBe("application/json");

      const json = await response.json();
      expect(json.message).toBe("RSS Reader API");
      expect(json.version).toBe("1.0.0");
      expect(json.endpoints).toBeDefined();
      expect(Array.isArray(json.endpoints)).toBe(true);
      expect(json.endpoints).toContain("GET /api/health");
      expect(json.endpoints).toContain("GET /api/feeds");
      expect(json.endpoints).toContain("POST /api/feeds");
      expect(json.endpoints).toContain("DELETE /api/feeds/:id");
      expect(json.endpoints).toContain("GET /api/articles");
      expect(json.endpoints).toContain("POST /api/articles/:id/star");
    });

    it("responds to health check", async () => {
      const response = await SELF.fetch("https://example.com/api/health");
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.status).toBe("ok");
      expect(json.timestamp).toBeDefined();
      // Verify timestamp is valid ISO format
      expect(() => new Date(json.timestamp)).not.toThrow();
    });

    it("responds to GET /api/feeds with empty array initially", async () => {
      const response = await SELF.fetch("https://example.com/api/feeds");
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.feeds).toBeDefined();
      expect(Array.isArray(json.feeds)).toBe(true);
      expect(json.feeds.length).toBe(0);
    });

    it("responds to GET /api/articles with empty array initially", async () => {
      const response = await SELF.fetch("https://example.com/api/articles");
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.articles).toBeDefined();
      expect(Array.isArray(json.articles)).toBe(true);
      expect(json.articles.length).toBe(0);
    });

    it("includes CORS headers in API responses", async () => {
      const response = await SELF.fetch("https://example.com/api/health");

      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
      expect(response.headers.get("Access-Control-Allow-Methods")).toContain(
        "GET"
      );
    });

    it("handles OPTIONS preflight requests", async () => {
      const response = await SELF.fetch("https://example.com/api/health", {
        method: "OPTIONS",
      });

      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
      expect(response.headers.get("Access-Control-Allow-Methods")).toContain(
        "GET"
      );
    });
  });

  describe("Feed Management API", () => {
    it("rejects POST /api/feeds without URL", async () => {
      const response = await SELF.fetch("https://example.com/api/feeds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe("URL is required");
    });

    it("rejects POST /api/feeds with invalid URL", async () => {
      const response = await SELF.fetch("https://example.com/api/feeds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "not-a-valid-url" }),
      });

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe("Invalid URL");
    });

    it("returns 404 when deleting non-existent feed", async () => {
      const response = await SELF.fetch(
        "https://example.com/api/feeds/nonexistent-id",
        {
          method: "DELETE",
        }
      );

      expect(response.status).toBe(404);
      const json = await response.json();
      expect(json.error).toBe("Feed not found");
    });

    it("returns 404 when refreshing non-existent feed", async () => {
      const response = await SELF.fetch(
        "https://example.com/api/feeds/nonexistent-id/refresh",
        {
          method: "POST",
        }
      );

      expect(response.status).toBe(404);
      const json = await response.json();
      expect(json.error).toBe("Feed not found");
    });
  });

  describe("Article Starring API", () => {
    it("can toggle star on an article", async () => {
      // Star an article
      const response1 = await SELF.fetch(
        "https://example.com/api/articles/test-article-123/star",
        {
          method: "POST",
        }
      );

      expect(response1.status).toBe(200);
      const json1 = await response1.json();
      expect(json1.articleId).toBe("test-article-123");
      expect(json1.starred).toBe(true);

      // Unstar the same article
      const response2 = await SELF.fetch(
        "https://example.com/api/articles/test-article-123/star",
        {
          method: "POST",
        }
      );

      expect(response2.status).toBe(200);
      const json2 = await response2.json();
      expect(json2.articleId).toBe("test-article-123");
      expect(json2.starred).toBe(false);
    });
  });

  describe("Refresh All API", () => {
    it("responds to POST /api/refresh with empty results when no feeds", async () => {
      const response = await SELF.fetch("https://example.com/api/refresh", {
        method: "POST",
      });

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.results).toBeDefined();
      expect(Array.isArray(json.results)).toBe(true);
      expect(json.results.length).toBe(0);
    });
  });

  describe("Article Filtering", () => {
    it("supports feedId query parameter", async () => {
      const response = await SELF.fetch(
        "https://example.com/api/articles?feedId=test-feed"
      );
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.articles).toBeDefined();
      expect(Array.isArray(json.articles)).toBe(true);
    });

    it("supports starred query parameter", async () => {
      const response = await SELF.fetch(
        "https://example.com/api/articles?starred=true"
      );
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.articles).toBeDefined();
      expect(Array.isArray(json.articles)).toBe(true);
    });
  });

  describe("Static Assets", () => {
    it("serves index.html at root path", async () => {
      const response = await SELF.fetch("https://example.com/");
      expect(response.status).toBe(200);

      const contentType = response.headers.get("Content-Type");
      expect(contentType).toContain("text/html");

      const html = await response.text();
      expect(html).toContain("RSS Reader");
    });

    it("serves CSS files", async () => {
      const response = await SELF.fetch("https://example.com/css/style.css");
      expect(response.status).toBe(200);

      const contentType = response.headers.get("Content-Type");
      expect(contentType).toContain("text/css");
    });

    it("serves JS files", async () => {
      const response = await SELF.fetch("https://example.com/js/app.js");
      expect(response.status).toBe(200);

      const contentType = response.headers.get("Content-Type");
      expect(contentType).toContain("javascript");
    });

    it("returns 404 for non-existent static assets", async () => {
      const response = await SELF.fetch(
        "https://example.com/nonexistent-file.txt"
      );
      expect(response.status).toBe(404);
    });
  });
});

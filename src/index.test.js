import { describe, it, expect } from "vitest";
import { SELF } from "cloudflare:test";

describe("RSS Reader Worker", () => {
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

    it("responds to GET /api/feeds", async () => {
      const response = await SELF.fetch("https://example.com/api/feeds");
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.feeds).toBeDefined();
      expect(Array.isArray(json.feeds)).toBe(true);
    });

    it("responds to GET /api/articles", async () => {
      const response = await SELF.fetch("https://example.com/api/articles");
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.articles).toBeDefined();
      expect(Array.isArray(json.articles)).toBe(true);
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

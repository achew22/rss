import { describe, it, expect } from "vitest";
import { SELF } from "cloudflare:test";

describe("Hello World Worker", () => {
  it("responds with JSON containing message, path, and timestamp", async () => {
    const response = await SELF.fetch("https://example.com/");
    expect(response.status).toBe(200);

    const contentType = response.headers.get("Content-Type");
    expect(contentType).toBe("application/json");

    const json = await response.json();
    expect(json.message).toBe("Hello World!");
    expect(json.path).toBe("/");
    expect(json.timestamp).toBeDefined();
    // Verify timestamp is valid ISO format
    expect(() => new Date(json.timestamp)).not.toThrow();
  });

  it("includes the correct path in response", async () => {
    const response = await SELF.fetch("https://example.com/test/path");
    const json = await response.json();
    expect(json.path).toBe("/test/path");
  });

  it("handles root path correctly", async () => {
    const response = await SELF.fetch("https://example.com/");
    const json = await response.json();
    expect(json.path).toBe("/");
  });

  it("returns valid JSON for any path", async () => {
    const paths = ["/", "/api", "/api/v1/users", "/hello-world"];

    for (const path of paths) {
      const response = await SELF.fetch(`https://example.com${path}`);
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.message).toBe("Hello World!");
      expect(json.path).toBe(path);
    }
  });
});

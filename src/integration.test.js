import { describe, it, expect } from "vitest";

const DEPLOYED_URL = "https://rss.achew22.com";

describe("Integration: Deployed Worker", () => {
  it("serves the SPA frontend at root", async () => {
    const response = await fetch(DEPLOYED_URL);
    expect(response.status).toBe(200);

    const contentType = response.headers.get("Content-Type");
    expect(contentType).toContain("text/html");

    const html = await response.text();
    expect(html).toContain("RSS Reader");
    expect(html).toContain('<div id="app">');
  });

  it("serves static CSS files", async () => {
    const response = await fetch(`${DEPLOYED_URL}/css/style.css`);
    expect(response.status).toBe(200);

    const contentType = response.headers.get("Content-Type");
    expect(contentType).toContain("text/css");
  });

  it("serves static JS files", async () => {
    const response = await fetch(`${DEPLOYED_URL}/js/app.js`);
    expect(response.status).toBe(200);

    const contentType = response.headers.get("Content-Type");
    expect(contentType).toContain("javascript");
  });

  it("responds to API health check", async () => {
    const response = await fetch(`${DEPLOYED_URL}/api/health`);
    expect(response.status).toBe(200);

    const contentType = response.headers.get("Content-Type");
    expect(contentType).toBe("application/json");

    const json = await response.json();
    expect(json.status).toBe("ok");
    expect(json.timestamp).toBeDefined();
  });

  it("responds to API info endpoint", async () => {
    const response = await fetch(`${DEPLOYED_URL}/api/`);
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.message).toBe("RSS Reader API");
    expect(json.version).toBe("1.0.0");
  });
});

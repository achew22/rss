import { describe, it, expect } from "vitest";

const DEPLOYED_URL = "https://rss.andrew-allen-personal.workers.dev";

describe("Integration: Deployed Worker", () => {
  it("responds with correct JSON structure from deployed endpoint", async () => {
    const response = await fetch(DEPLOYED_URL);
    expect(response.status).toBe(200);

    const contentType = response.headers.get("Content-Type");
    expect(contentType).toBe("application/json");

    const json = await response.json();
    expect(json.message).toBe("Hello World!");
    expect(json.path).toBe("/");
    expect(json.timestamp).toBeDefined();
  });

  it("handles paths correctly on deployed endpoint", async () => {
    const response = await fetch(`${DEPLOYED_URL}/test`);
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.path).toBe("/test");
  });
});

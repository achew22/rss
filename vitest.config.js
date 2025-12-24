import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    exclude: ["**/integration.test.js", "**/node_modules/**"],
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: {
          // Provide a mock KV namespace for testing
          kvNamespaces: ["RSS_STORE"],
        },
      },
    },
  },
});

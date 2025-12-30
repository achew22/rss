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
          // Set AUTH_MODE to 'local' for testing (bypasses Google OAuth)
          bindings: {
            AUTH_MODE: "local",
          },
        },
      },
    },
  },
});

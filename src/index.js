/**
 * RSS Reader Cloudflare Worker
 *
 * This worker serves the RSS Reader SPA and handles API routes.
 * Static assets are served by Wrangler's assets binding.
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Handle API routes
    if (path.startsWith("/api/")) {
      return handleApiRequest(request, url, env);
    }

    // For non-API routes that aren't static assets, this will be called
    // Return 404 for unknown routes (static assets are handled by Wrangler)
    return new Response("Not Found", { status: 404 });
  },
};

/**
 * Handle API requests
 */
async function handleApiRequest(request, url, env) {
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

  // API routes
  if (path === "/api/health") {
    return jsonResponse({ status: "ok", timestamp: new Date().toISOString() }, corsHeaders);
  }

  if (path === "/api/feeds" && method === "GET") {
    // TODO: Implement feed listing from storage
    return jsonResponse({ feeds: [], message: "Feed storage not yet implemented" }, corsHeaders);
  }

  if (path === "/api/feeds" && method === "POST") {
    // TODO: Implement feed creation
    return jsonResponse({ message: "Feed creation not yet implemented" }, corsHeaders, 501);
  }

  if (path === "/api/articles" && method === "GET") {
    // TODO: Implement article listing
    return jsonResponse({ articles: [], message: "Article storage not yet implemented" }, corsHeaders);
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
        "GET /api/articles",
      ],
    },
    corsHeaders
  );
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

/**
 * Hello World Cloudflare Worker
 *
 * This worker responds with a simple "Hello World" message.
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Return a simple Hello World response
    return new Response(
      JSON.stringify({
        message: "Hello World!",
        path: url.pathname,
        timestamp: new Date().toISOString(),
      }),
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  },
};

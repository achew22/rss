/**
 * Auth Router - The SINGLE entry point for all requests
 *
 * This router enforces authentication checks in a way that's impossible to bypass:
 * 1. All requests go through handleRequest()
 * 2. Public routes are explicitly whitelisted
 * 3. Protected routes REQUIRE a valid user
 * 4. User object is only passed to handlers AFTER validation
 *
 * This design makes it structurally impossible to access protected resources
 * without authentication.
 */

/**
 * Check if a path is a public route (no auth required)
 */
function isPublicRoute(pathname) {
  const publicRoutes = [
    '/login',
    '/landing',
    // Static assets are handled by Wrangler and don't go through this router
  ];
  return publicRoutes.includes(pathname);
}

/**
 * Check if a path is an auth route (login/logout/callback)
 */
function isAuthRoute(pathname) {
  const authRoutes = [
    '/auth/login',
    '/auth/callback',
    '/auth/logout'
  ];
  return authRoutes.includes(pathname);
}

/**
 * Serve the landing page for non-authenticated users
 */
function serveLandingPage() {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RSS Reader - Stay Updated</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      max-width: 800px;
      background: white;
      border-radius: 16px;
      padding: 60px 40px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      text-align: center;
    }
    h1 {
      font-size: 3em;
      margin-bottom: 20px;
      color: #667eea;
      font-weight: 700;
    }
    .tagline {
      font-size: 1.3em;
      color: #666;
      margin-bottom: 40px;
    }
    .features {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 30px;
      margin: 40px 0;
      text-align: left;
    }
    .feature {
      padding: 20px;
    }
    .feature-icon {
      font-size: 2.5em;
      margin-bottom: 10px;
    }
    .feature h3 {
      font-size: 1.2em;
      margin-bottom: 10px;
      color: #333;
    }
    .feature p {
      color: #666;
      font-size: 0.95em;
    }
    .cta {
      margin-top: 40px;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 16px 40px;
      font-size: 1.1em;
      font-weight: 600;
      text-decoration: none;
      background: white;
      color: #667eea;
      border: 2px solid #667eea;
      border-radius: 50px;
      cursor: pointer;
      transition: all 0.3s ease;
      box-shadow: 0 4px 15px rgba(102, 126, 234, 0.2);
    }
    .btn:hover {
      background: #667eea;
      color: white;
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
    }
    .google-icon {
      width: 20px;
      height: 20px;
    }
    footer {
      margin-top: 40px;
      color: #999;
      font-size: 0.9em;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>RSS Reader</h1>
    <p class="tagline">Your personal news aggregator. Simple, fast, and distraction-free.</p>

    <div class="features">
      <div class="feature">
        <div class="feature-icon">📡</div>
        <h3>Subscribe to Feeds</h3>
        <p>Add your favorite blogs, news sites, and podcasts in one place.</p>
      </div>
      <div class="feature">
        <div class="feature-icon">⚡</div>
        <h3>Auto-Updates</h3>
        <p>Fresh content delivered every 15 minutes automatically.</p>
      </div>
      <div class="feature">
        <div class="feature-icon">⭐</div>
        <h3>Star & Organize</h3>
        <p>Save your favorite articles and keep track of what you've read.</p>
      </div>
    </div>

    <div class="cta">
      <a href="/auth/login" class="btn">
        <svg class="google-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        Log in with Google
      </a>
    </div>

    <footer>
      <p>Free and open source. Your data stays private.</p>
    </footer>
  </div>
</body>
</html>
  `.trim();

  return new Response(html, {
    headers: { 'Content-Type': 'text/html;charset=UTF-8' }
  });
}

/**
 * Handle auth routes (login, logout, callback)
 */
export async function handleAuthRoute(request, url, authProvider) {
  const pathname = url.pathname;

  if (pathname === '/auth/login') {
    return await authProvider.initiateLogin(request);
  }

  if (pathname === '/auth/callback') {
    return await authProvider.handleCallback(request);
  }

  if (pathname === '/auth/logout') {
    return await authProvider.logout(request);
  }

  return new Response('Not Found', { status: 404 });
}

/**
 * Handle public routes (landing page)
 */
export function handlePublicRoute(request, url) {
  const pathname = url.pathname;

  if (pathname === '/login' || pathname === '/landing') {
    return serveLandingPage();
  }

  return new Response('Not Found', { status: 404 });
}

/**
 * Redirect to login page
 */
function redirectToLogin(returnUrl) {
  return new Response(null, {
    status: 302,
    headers: {
      'Location': '/login'
    }
  });
}

/**
 * Main request handler - THE SINGLE ENTRY POINT
 *
 * This function MUST be used for all requests.
 * It enforces authentication in a way that cannot be bypassed.
 */
export async function handleRequest(request, env, ctx, authProvider, protectedHandler) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // 0. Handle CORS preflight for API routes (must come before auth)
  if (request.method === 'OPTIONS' && pathname.startsWith('/api/')) {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    });
  }

  // 1. Handle public routes (no auth required)
  if (isPublicRoute(pathname)) {
    return handlePublicRoute(request, url);
  }

  // 2. Handle auth routes (login, logout, callback)
  if (isAuthRoute(pathname)) {
    return handleAuthRoute(request, url, authProvider);
  }

  // 3. All other routes are PROTECTED - check auth
  const user = await authProvider.getCurrentUser(request);

  // If not authenticated, check if this is the root route
  // Root route should show landing page if not authenticated
  if (!user) {
    if (pathname === '/') {
      return serveLandingPage();
    }
    // For all other protected routes, redirect to login
    return redirectToLogin(pathname);
  }

  // 4. User is authenticated - pass to protected handler
  // The protected handler receives the validated user object
  return await protectedHandler(request, env, ctx, user);
}

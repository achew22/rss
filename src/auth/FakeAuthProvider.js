/**
 * FakeAuthProvider - In-memory auth provider for testing
 *
 * This provider simulates authentication without external dependencies.
 * Perfect for unit tests, integration tests, and local development.
 */
import { AuthProvider } from './AuthProvider.js';

export class FakeAuthProvider extends AuthProvider {
  constructor() {
    super();
    // In-memory session store: Map<sessionId, user>
    this.sessions = new Map();
    // Fake user database: Map<userId, user>
    this.users = new Map();

    // Add some default test users
    this.addUser({
      id: 'test-user-1',
      email: 'alice@example.com',
      name: 'Alice Test'
    });
    this.addUser({
      id: 'test-user-2',
      email: 'bob@example.com',
      name: 'Bob Test'
    });
  }

  /**
   * Add a user to the fake database
   */
  addUser(user) {
    this.users.set(user.id, user);
    return user;
  }

  /**
   * Create a session for a user (returns session ID)
   */
  createSession(userId) {
    const user = this.users.get(userId);
    if (!user) {
      throw new Error(`User ${userId} not found`);
    }
    const sessionId = `fake-session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    this.sessions.set(sessionId, user);
    return sessionId;
  }

  /**
   * Delete a session
   */
  deleteSession(sessionId) {
    this.sessions.delete(sessionId);
  }

  /**
   * Get session ID from request cookies
   */
  getSessionIdFromRequest(request) {
    const cookieHeader = request.headers.get('Cookie');
    if (!cookieHeader) return null;

    const cookies = cookieHeader.split(';').map(c => c.trim());
    for (const cookie of cookies) {
      const [name, value] = cookie.split('=');
      if (name === 'session') {
        return value;
      }
    }
    return null;
  }

  async getCurrentUser(request) {
    const sessionId = this.getSessionIdFromRequest(request);
    if (!sessionId) return null;

    const user = this.sessions.get(sessionId);
    return user || null;
  }

  async initiateLogin(request) {
    // Return a simple login form HTML
    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Fake Login</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      max-width: 400px;
      margin: 100px auto;
      padding: 20px;
    }
    h1 { color: #333; }
    form { margin-top: 20px; }
    label { display: block; margin: 10px 0 5px; }
    select, button {
      width: 100%;
      padding: 10px;
      font-size: 16px;
      margin: 10px 0;
    }
    button {
      background: #007bff;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }
    button:hover { background: #0056b3; }
    .note {
      margin-top: 20px;
      padding: 10px;
      background: #fff3cd;
      border: 1px solid #ffc107;
      border-radius: 4px;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <h1>Fake Login (Testing Only)</h1>
  <form method="POST" action="/auth/callback">
    <label for="user">Select a test user:</label>
    <select id="user" name="userId" required>
      ${Array.from(this.users.values()).map(user =>
        `<option value="${user.id}">${user.name} (${user.email})</option>`
      ).join('')}
    </select>
    <button type="submit">Login</button>
  </form>
  <div class="note">
    <strong>Note:</strong> This is a fake auth provider for testing.
    In production, use GoogleOAuthProvider instead.
  </div>
</body>
</html>
    `.trim();

    return new Response(html, {
      headers: { 'Content-Type': 'text/html' }
    });
  }

  async handleCallback(request) {
    // Extract userId from form submission or query params
    let userId;

    if (request.method === 'POST') {
      const formData = await request.formData();
      userId = formData.get('userId');
    } else {
      const url = new URL(request.url);
      userId = url.searchParams.get('userId');
    }

    if (!userId || !this.users.has(userId)) {
      return new Response('Invalid user', { status: 400 });
    }

    // Create a session
    const sessionId = this.createSession(userId);

    // Set cookie and redirect to app
    return new Response(null, {
      status: 302,
      headers: {
        'Location': '/',
        'Set-Cookie': `session=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`
      }
    });
  }

  async logout(request) {
    const sessionId = this.getSessionIdFromRequest(request);
    if (sessionId) {
      this.deleteSession(sessionId);
    }

    // Clear cookie and redirect to login
    return new Response(null, {
      status: 302,
      headers: {
        'Location': '/login',
        'Set-Cookie': 'session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'
      }
    });
  }
}

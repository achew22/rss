/**
 * GoogleOAuthProvider - Production Google OAuth implementation
 *
 * Implements Google OAuth 2.0 flow for authentication.
 * Requires environment variables:
 * - GOOGLE_CLIENT_ID
 * - GOOGLE_CLIENT_SECRET
 * - APP_URL (e.g., https://rss.achew22.com)
 */
import { AuthProvider } from './AuthProvider.js';

export class GoogleOAuthProvider extends AuthProvider {
  constructor(env) {
    super();
    this.clientId = env.GOOGLE_CLIENT_ID;
    this.clientSecret = env.GOOGLE_CLIENT_SECRET;
    this.appUrl = env.APP_URL || 'http://localhost:8787';
    this.sessionStore = env.RSS_STORE; // Use KV for session storage

    if (!this.clientId || !this.clientSecret) {
      throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set');
    }
  }

  /**
   * Get the OAuth callback URL
   */
  getCallbackUrl() {
    return `${this.appUrl}/auth/callback`;
  }

  /**
   * Get session from KV store
   */
  async getSession(sessionId) {
    if (!this.sessionStore) return null;
    const data = await this.sessionStore.get(`session:${sessionId}`);
    return data ? JSON.parse(data) : null;
  }

  /**
   * Save session to KV store
   */
  async saveSession(sessionId, user) {
    if (!this.sessionStore) return;
    // Sessions expire in 30 days
    await this.sessionStore.put(
      `session:${sessionId}`,
      JSON.stringify(user),
      { expirationTtl: 30 * 24 * 60 * 60 }
    );
  }

  /**
   * Delete session from KV store
   */
  async deleteSession(sessionId) {
    if (!this.sessionStore) return;
    await this.sessionStore.delete(`session:${sessionId}`);
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

    const user = await this.getSession(sessionId);
    return user;
  }

  async initiateLogin(request) {
    // Generate a random state parameter for CSRF protection
    const state = crypto.randomUUID();

    // Store state in KV with 10 minute expiration
    if (this.sessionStore) {
      await this.sessionStore.put(`oauth_state:${state}`, 'pending', {
        expirationTtl: 600
      });
    }

    // Build Google OAuth URL
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.getCallbackUrl(),
      response_type: 'code',
      scope: 'openid email profile',
      state: state,
      access_type: 'online',
      prompt: 'select_account'
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

    return new Response(null, {
      status: 302,
      headers: { 'Location': authUrl }
    });
  }

  async handleCallback(request) {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');

    if (!code || !state) {
      return new Response('Missing code or state parameter', { status: 400 });
    }

    // Verify state to prevent CSRF
    if (this.sessionStore) {
      const storedState = await this.sessionStore.get(`oauth_state:${state}`);
      if (!storedState) {
        return new Response('Invalid state parameter', { status: 400 });
      }
      // Delete used state
      await this.sessionStore.delete(`oauth_state:${state}`);
    }

    // Exchange code for access token
    let tokenResponse;
    try {
      tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          code: code,
          client_id: this.clientId,
          client_secret: this.clientSecret,
          redirect_uri: this.getCallbackUrl(),
          grant_type: 'authorization_code'
        }).toString()
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error('Token exchange failed:', errorText);
        return new Response('Failed to exchange code for token', { status: 500 });
      }
    } catch (error) {
      console.error('Token exchange error:', error);
      return new Response('Failed to exchange code for token', { status: 500 });
    }

    const tokens = await tokenResponse.json();

    // Get user info from Google
    let userInfoResponse;
    try {
      userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`
        }
      });

      if (!userInfoResponse.ok) {
        const errorText = await userInfoResponse.text();
        console.error('Failed to get user info:', errorText);
        return new Response('Failed to get user info', { status: 500 });
      }
    } catch (error) {
      console.error('User info error:', error);
      return new Response('Failed to get user info', { status: 500 });
    }

    const userInfo = await userInfoResponse.json();

    // Create user object
    const user = {
      id: userInfo.id,
      email: userInfo.email,
      name: userInfo.name,
      picture: userInfo.picture
    };

    // Create session
    const sessionId = crypto.randomUUID();
    await this.saveSession(sessionId, user);

    // Set cookie and redirect to app
    return new Response(null, {
      status: 302,
      headers: {
        'Location': '/',
        'Set-Cookie': `session=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`
      }
    });
  }

  async logout(request) {
    const sessionId = this.getSessionIdFromRequest(request);
    if (sessionId) {
      await this.deleteSession(sessionId);
    }

    // Clear cookie and redirect to login
    return new Response(null, {
      status: 302,
      headers: {
        'Location': '/login',
        'Set-Cookie': 'session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'
      }
    });
  }
}

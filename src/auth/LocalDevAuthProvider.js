/**
 * LocalDevAuthProvider - Always authenticated as "default" user
 *
 * This provider is for local development convenience.
 * It always returns a default user without requiring login.
 *
 * WARNING: NEVER use this in production!
 */
import { AuthProvider } from './AuthProvider.js';

export class LocalDevAuthProvider extends AuthProvider {
  constructor() {
    super();
    this.defaultUser = {
      id: 'default',
      email: 'dev@localhost',
      name: 'Local Dev User'
    };
  }

  async getCurrentUser(request) {
    // Always return the default user
    return this.defaultUser;
  }

  async initiateLogin(request) {
    // Immediately redirect to app (already "logged in")
    return new Response(null, {
      status: 302,
      headers: { 'Location': '/' }
    });
  }

  async handleCallback(request) {
    // Not used in local dev, but redirect to app anyway
    return new Response(null, {
      status: 302,
      headers: { 'Location': '/' }
    });
  }

  async logout(request) {
    // Can't really log out in local dev mode
    // Just redirect back to app
    return new Response(null, {
      status: 302,
      headers: { 'Location': '/' }
    });
  }
}

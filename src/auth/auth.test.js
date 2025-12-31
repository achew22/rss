/**
 * Tests for the authentication system
 *
 * These tests verify that:
 * 1. Auth providers work correctly
 * 2. The router enforces authentication properly
 * 3. It's impossible to bypass auth checks
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { FakeAuthProvider } from './FakeAuthProvider.js';
import { LocalDevAuthProvider } from './LocalDevAuthProvider.js';
import { handleRequest, handleAuthRoute, handlePublicRoute } from './router.js';

describe('FakeAuthProvider', () => {
  let authProvider;

  beforeEach(() => {
    authProvider = new FakeAuthProvider();
  });

  it('should have default test users', () => {
    expect(authProvider.users.size).toBeGreaterThan(0);
    expect(authProvider.users.has('test-user-1')).toBe(true);
    expect(authProvider.users.has('test-user-2')).toBe(true);
  });

  it('should allow adding new users', () => {
    const newUser = {
      id: 'test-user-3',
      email: 'charlie@example.com',
      name: 'Charlie Test'
    };
    authProvider.addUser(newUser);
    expect(authProvider.users.has('test-user-3')).toBe(true);
  });

  it('should create and retrieve sessions', () => {
    const sessionId = authProvider.createSession('test-user-1');
    expect(sessionId).toBeTruthy();
    expect(authProvider.sessions.has(sessionId)).toBe(true);

    const user = authProvider.sessions.get(sessionId);
    expect(user.id).toBe('test-user-1');
    expect(user.email).toBe('alice@example.com');
  });

  it('should delete sessions', () => {
    const sessionId = authProvider.createSession('test-user-1');
    authProvider.deleteSession(sessionId);
    expect(authProvider.sessions.has(sessionId)).toBe(false);
  });

  it('should return null for getCurrentUser without session', async () => {
    const request = new Request('http://localhost/');
    const user = await authProvider.getCurrentUser(request);
    expect(user).toBeNull();
  });

  it('should return user for getCurrentUser with valid session', async () => {
    const sessionId = authProvider.createSession('test-user-1');
    const request = new Request('http://localhost/', {
      headers: {
        'Cookie': `session=${sessionId}`
      }
    });
    const user = await authProvider.getCurrentUser(request);
    expect(user).toBeTruthy();
    expect(user.id).toBe('test-user-1');
    expect(user.email).toBe('alice@example.com');
  });

  it('should serve login page for initiateLogin', async () => {
    const request = new Request('http://localhost/auth/login');
    const response = await authProvider.initiateLogin(request);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/html');
    const html = await response.text();
    expect(html).toContain('Fake Login');
    expect(html).toContain('alice@example.com');
  });

  it('should handle callback and create session', async () => {
    const request = new Request('http://localhost/auth/callback', {
      method: 'POST',
      body: new URLSearchParams({ userId: 'test-user-1' }),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    const response = await authProvider.handleCallback(request);
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/');

    const setCookie = response.headers.get('Set-Cookie');
    expect(setCookie).toContain('session=');
    expect(setCookie).toContain('HttpOnly');
  });

  it('should logout and clear session', async () => {
    const sessionId = authProvider.createSession('test-user-1');
    const request = new Request('http://localhost/auth/logout', {
      headers: {
        'Cookie': `session=${sessionId}`
      }
    });
    const response = await authProvider.logout(request);
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/login');
    expect(authProvider.sessions.has(sessionId)).toBe(false);
  });
});

describe('LocalDevAuthProvider', () => {
  let authProvider;

  beforeEach(() => {
    authProvider = new LocalDevAuthProvider();
  });

  it('should always return default user', async () => {
    const request = new Request('http://localhost/');
    const user = await authProvider.getCurrentUser(request);
    expect(user).toBeTruthy();
    expect(user.id).toBe('default');
    expect(user.email).toBe('dev@localhost');
  });

  it('should redirect to app on login', async () => {
    const request = new Request('http://localhost/auth/login');
    const response = await authProvider.initiateLogin(request);
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/');
  });
});

describe('Auth Router', () => {
  let authProvider;
  let mockEnv;

  beforeEach(() => {
    authProvider = new FakeAuthProvider();
    mockEnv = {
      RSS_STORE: {
        get: async (key) => null,
        put: async (key, value, options) => {},
        delete: async (key) => {}
      }
    };
  });

  describe('Public routes', () => {
    it('should serve landing page for /login', async () => {
      const request = new Request('http://localhost/login');
      const response = handlePublicRoute(request, new URL(request.url));
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain('RSS Reader');
      expect(html).toContain('Log in with Google');
    });

    it('should serve landing page for /landing', async () => {
      const request = new Request('http://localhost/landing');
      const response = handlePublicRoute(request, new URL(request.url));
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain('RSS Reader');
    });
  });

  describe('Auth routes', () => {
    it('should handle /auth/login', async () => {
      const request = new Request('http://localhost/auth/login');
      const response = await handleAuthRoute(
        request,
        new URL(request.url),
        authProvider
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain('Fake Login');
    });

    it('should handle /auth/callback', async () => {
      const request = new Request('http://localhost/auth/callback', {
        method: 'POST',
        body: new URLSearchParams({ userId: 'test-user-1' }),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
      const response = await handleAuthRoute(
        request,
        new URL(request.url),
        authProvider
      );
      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toBe('/');
    });

    it('should handle /auth/logout', async () => {
      const sessionId = authProvider.createSession('test-user-1');
      const request = new Request('http://localhost/auth/logout', {
        headers: {
          'Cookie': `session=${sessionId}`
        }
      });
      const response = await handleAuthRoute(
        request,
        new URL(request.url),
        authProvider
      );
      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toBe('/login');
    });
  });

  describe('Protected routes', () => {
    const mockProtectedHandler = async (request, env, ctx, user) => {
      // Mock protected handler that returns user info
      return new Response(JSON.stringify({ userId: user.id }), {
        headers: { 'Content-Type': 'application/json' }
      });
    };

    it('should redirect to login for unauthenticated protected routes', async () => {
      const request = new Request('http://localhost/api/feeds');
      const response = await handleRequest(
        request,
        mockEnv,
        {},
        authProvider,
        mockProtectedHandler
      );
      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toBe('/login');
    });

    it('should serve landing page for root when not authenticated', async () => {
      const request = new Request('http://localhost/');
      const response = await handleRequest(
        request,
        mockEnv,
        {},
        authProvider,
        mockProtectedHandler
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain('RSS Reader');
      expect(html).toContain('Log in with Google');
    });

    it('should allow authenticated users to access protected routes', async () => {
      const sessionId = authProvider.createSession('test-user-1');
      const request = new Request('http://localhost/api/feeds', {
        headers: {
          'Cookie': `session=${sessionId}`
        }
      });
      const response = await handleRequest(
        request,
        mockEnv,
        {},
        authProvider,
        mockProtectedHandler
      );
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.userId).toBe('test-user-1');
    });

    it('should pass validated user to protected handler', async () => {
      const sessionId = authProvider.createSession('test-user-2');
      const request = new Request('http://localhost/api/articles', {
        headers: {
          'Cookie': `session=${sessionId}`
        }
      });
      const response = await handleRequest(
        request,
        mockEnv,
        {},
        authProvider,
        mockProtectedHandler
      );
      const data = await response.json();
      expect(data.userId).toBe('test-user-2');
    });

    it('SECURITY: should NOT allow access without valid session', async () => {
      const request = new Request('http://localhost/api/feeds', {
        headers: {
          'Cookie': 'session=invalid-session-id'
        }
      });
      const response = await handleRequest(
        request,
        mockEnv,
        {},
        authProvider,
        mockProtectedHandler
      );
      // Should redirect to login, not call protected handler
      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toBe('/login');
    });

    it('SECURITY: should NOT allow access with deleted session', async () => {
      const sessionId = authProvider.createSession('test-user-1');
      authProvider.deleteSession(sessionId);

      const request = new Request('http://localhost/api/feeds', {
        headers: {
          'Cookie': `session=${sessionId}`
        }
      });
      const response = await handleRequest(
        request,
        mockEnv,
        {},
        authProvider,
        mockProtectedHandler
      );
      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toBe('/login');
    });

    it('SECURITY: protected handler should never be called without valid user', async () => {
      let handlerWasCalled = false;
      const strictHandler = async (request, env, ctx, user) => {
        handlerWasCalled = true;
        if (!user || !user.id) {
          throw new Error('SECURITY VIOLATION: Handler called without valid user!');
        }
        return new Response('OK');
      };

      const request = new Request('http://localhost/api/feeds');
      await handleRequest(request, mockEnv, {}, authProvider, strictHandler);

      // Handler should NOT have been called
      expect(handlerWasCalled).toBe(false);
    });
  });

  describe('Complete authentication flow', () => {
    it('should complete full login flow', async () => {
      const mockProtectedHandler = async (request, env, ctx, user) => {
        return new Response(JSON.stringify({
          message: 'Success',
          userId: user.id
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      };

      // 1. Unauthenticated user tries to access protected route
      let request = new Request('http://localhost/api/feeds');
      let response = await handleRequest(
        request,
        mockEnv,
        {},
        authProvider,
        mockProtectedHandler
      );
      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toBe('/login');

      // 2. User goes to login page
      request = new Request('http://localhost/auth/login');
      response = await handleRequest(
        request,
        mockEnv,
        {},
        authProvider,
        mockProtectedHandler
      );
      expect(response.status).toBe(200);

      // 3. User submits login form
      request = new Request('http://localhost/auth/callback', {
        method: 'POST',
        body: new URLSearchParams({ userId: 'test-user-1' }),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
      response = await handleRequest(
        request,
        mockEnv,
        {},
        authProvider,
        mockProtectedHandler
      );
      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toBe('/');

      const setCookie = response.headers.get('Set-Cookie');
      expect(setCookie).toContain('session=');

      // Extract session cookie
      const sessionMatch = setCookie.match(/session=([^;]+)/);
      expect(sessionMatch).toBeTruthy();
      const sessionId = sessionMatch[1];

      // 4. User now has session and can access protected routes
      request = new Request('http://localhost/api/feeds', {
        headers: {
          'Cookie': `session=${sessionId}`
        }
      });
      response = await handleRequest(
        request,
        mockEnv,
        {},
        authProvider,
        mockProtectedHandler
      );
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.message).toBe('Success');
      expect(data.userId).toBe('test-user-1');

      // 5. User logs out
      request = new Request('http://localhost/auth/logout', {
        headers: {
          'Cookie': `session=${sessionId}`
        }
      });
      response = await handleRequest(
        request,
        mockEnv,
        {},
        authProvider,
        mockProtectedHandler
      );
      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toBe('/login');

      // 6. User can no longer access protected routes
      request = new Request('http://localhost/api/feeds', {
        headers: {
          'Cookie': `session=${sessionId}`
        }
      });
      response = await handleRequest(
        request,
        mockEnv,
        {},
        authProvider,
        mockProtectedHandler
      );
      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toBe('/login');
    });
  });
});

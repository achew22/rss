/**
 * AuthProvider Interface
 *
 * This interface defines the contract for all authentication providers.
 * All auth implementations MUST extend this class and implement all methods.
 *
 * This design makes auth checks impossible to bypass because:
 * 1. All requests go through a single entry point
 * 2. The entry point enforces auth before calling protected handlers
 * 3. User object is only passed to handlers AFTER validation
 */
export class AuthProvider {
  /**
   * Get the currently authenticated user from the request
   * @param {Request} request - The incoming request
   * @returns {Promise<User|null>} - User object if authenticated, null otherwise
   *
   * User object shape: { id: string, email: string, name?: string }
   */
  async getCurrentUser(request) {
    throw new Error('getCurrentUser() must be implemented by subclass');
  }

  /**
   * Initiate the login flow
   * @param {Request} request - The incoming request
   * @returns {Promise<Response>} - Redirect to login provider or login page
   */
  async initiateLogin(request) {
    throw new Error('initiateLogin() must be implemented by subclass');
  }

  /**
   * Handle the OAuth callback from the login provider
   * @param {Request} request - The callback request with auth code
   * @returns {Promise<Response>} - Response that sets session and redirects to app
   */
  async handleCallback(request) {
    throw new Error('handleCallback() must be implemented by subclass');
  }

  /**
   * Log out the current user
   * @param {Request} request - The incoming request
   * @returns {Promise<Response>} - Response that clears session and redirects
   */
  async logout(request) {
    throw new Error('logout() must be implemented by subclass');
  }
}

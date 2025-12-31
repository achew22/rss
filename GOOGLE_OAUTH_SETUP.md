# Google OAuth Setup Guide

This guide walks you through setting up Google OAuth for the RSS Reader application.

## Prerequisites

- A Google account
- Access to the [Google Cloud Console](https://console.cloud.google.com/)
- Your deployed application URL (e.g., `https://rss.achew22.com`)

## Step 1: Create a Google Cloud Project

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Click on the project dropdown at the top of the page
3. Click **"New Project"**
4. Enter a project name (e.g., "RSS Reader")
5. Click **"Create"**
6. Wait for the project to be created, then select it from the project dropdown

## Step 2: Enable Google+ API

1. In the Google Cloud Console, go to **"APIs & Services" > "Library"**
2. Search for **"Google+ API"** (or "Google Identity")
3. Click on it and then click **"Enable"**

## Step 3: Configure OAuth Consent Screen

1. Go to **"APIs & Services" > "OAuth consent screen"**
2. Select **"External"** user type (unless you're using Google Workspace)
3. Click **"Create"**

### App Information

Fill in the required information:

- **App name**: RSS Reader (or your preferred name)
- **User support email**: Your email address
- **App logo**: (Optional) Upload a logo if you have one
- **Developer contact information**: Your email address

Click **"Save and Continue"**

### Scopes

1. Click **"Add or Remove Scopes"**
2. Add the following scopes:
   - `openid`
   - `email`
   - `profile`
3. Click **"Update"** then **"Save and Continue"**

### Test Users (Optional for Development)

If you selected "External" and haven't published your app:

1. Click **"Add Users"**
2. Add email addresses of users who should be able to test the app
3. Click **"Save and Continue"**

### Summary

Review your settings and click **"Back to Dashboard"**

## Step 4: Create OAuth 2.0 Credentials

1. Go to **"APIs & Services" > "Credentials"**
2. Click **"Create Credentials"** > **"OAuth client ID"**
3. Select **"Web application"** as the application type
4. Enter a name (e.g., "RSS Reader Web Client")

### Configure OAuth Client

**Authorized JavaScript origins:**
```
https://rss.achew22.com
```

**Authorized redirect URIs:**
```
https://rss.achew22.com/auth/callback
```

**For local development, also add:**

Authorized JavaScript origins:
```
http://localhost:8787
```

Authorized redirect URIs:
```
http://localhost:8787/auth/callback
```

5. Click **"Create"**

## Step 5: Save Your Credentials

After creating the OAuth client, you'll see a dialog with your credentials:

- **Client ID**: Something like `123456789-abcdefghijklmnop.apps.googleusercontent.com`
- **Client Secret**: Something like `GOCSPX-abcdefghijklmnopqrstuvwx`

**IMPORTANT**: Copy these values - you'll need them in the next step.

## Step 6: Configure Cloudflare Workers

You need to add the OAuth credentials as environment variables (secrets) in your Cloudflare Worker.

### Using Wrangler CLI (Recommended)

```bash
# Add Client ID as a secret
npx wrangler secret put GOOGLE_CLIENT_ID
# When prompted, paste your Client ID

# Add Client Secret as a secret
npx wrangler secret put GOOGLE_CLIENT_SECRET
# When prompted, paste your Client Secret

# Add your app URL
npx wrangler secret put APP_URL
# When prompted, enter: https://rss.achew22.com

# Set auth mode to Google
npx wrangler secret put AUTH_MODE
# When prompted, enter: google
```

### Using Cloudflare Dashboard (Alternative)

1. Go to the [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to **Workers & Pages**
3. Click on your RSS Reader worker
4. Go to **Settings** > **Variables**
5. Under **Environment Variables**, click **"Add variable"**
6. Add the following secrets (encrypted):
   - `GOOGLE_CLIENT_ID`: Your Google OAuth Client ID
   - `GOOGLE_CLIENT_SECRET`: Your Google OAuth Client Secret
   - `APP_URL`: Your application URL (e.g., `https://rss.achew22.com`)
   - `AUTH_MODE`: `google`

## Step 7: Deploy Your Application

Deploy the updated worker with the auth system:

```bash
npm run deploy
```

## Step 8: Test the Authentication Flow

1. Visit your application URL (e.g., `https://rss.achew22.com`)
2. You should see the landing page with a "Log in with Google" button
3. Click the button to initiate the OAuth flow
4. Select your Google account
5. Grant the requested permissions
6. You should be redirected back to your application and logged in

## Troubleshooting

### "Error 400: redirect_uri_mismatch"

This means your redirect URI doesn't match what you configured in Google Cloud Console.

**Fix:**
1. Check that your redirect URI is exactly: `https://yourdomain.com/auth/callback`
2. Make sure there are no trailing slashes
3. Verify the protocol (http vs https) matches
4. Wait a few minutes after making changes in Google Cloud Console

### "Error 401: invalid_client"

This means your Client ID or Client Secret is incorrect.

**Fix:**
1. Double-check that you've copied the correct values
2. Verify the secrets are set correctly in Cloudflare Workers
3. Redeploy your worker after updating secrets

### "This app isn't verified"

This is normal for apps in development/testing.

**Options:**
1. Click **"Advanced"** > **"Go to [Your App Name] (unsafe)"** to proceed (safe for your own app)
2. OR: Go through Google's app verification process (required for production)

### Users Can't Log In

**Check:**
1. If your OAuth consent screen is set to "Testing", you need to add users to the test users list
2. OR: Publish your app to make it available to all users

## Local Development

**IMPORTANT**: By default, the app uses Google OAuth for security. For local development without setting up Google OAuth, you need to explicitly set `AUTH_MODE`.

### Option 1: Fake Auth (Recommended for Testing)

1. Create a `.dev.vars` file in your project root:

```bash
# .dev.vars
AUTH_MODE=fake
```

2. Start your development server: `npm run dev`
3. Visit `http://localhost:8787`
4. You'll see a simple login form with test users

### Option 2: Local Dev (No Auth - Use with Caution)

**⚠️ WARNING**: This mode bypasses all authentication. Only use on `localhost`, never deploy with this setting!

```bash
# .dev.vars
AUTH_MODE=local
```

To test Google OAuth locally:

1. Add `http://localhost:8787` and `http://localhost:8787/auth/callback` to your Google OAuth credentials
2. Set environment variables in `.dev.vars`:

```bash
# .dev.vars
AUTH_MODE=google
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
APP_URL=http://localhost:8787
```

3. Start the dev server: `npm run dev`

## Security Best Practices

1. **Never commit secrets to Git**: Use environment variables/secrets
2. **Use HTTPS in production**: OAuth requires secure connections
3. **Restrict redirect URIs**: Only add the exact URIs your app uses
4. **Rotate secrets regularly**: Regenerate Client Secret periodically
5. **Monitor OAuth usage**: Check Google Cloud Console for suspicious activity
6. **Verify the app**: Go through Google's verification process for production

## Additional Resources

- [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Cloudflare Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [OAuth 2.0 Security Best Practices](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-security-topics)

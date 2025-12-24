# RSS Hello World - Cloudflare Workers

A simple Hello World application deployed to Cloudflare Workers with continuous deployment via GitHub Actions.

## Local Development

### Prerequisites

- Node.js 20+
- npm

### Setup

```bash
npm install
```

### Run locally

```bash
npm run dev
```

This starts a local development server at `http://localhost:8787`.

## Deployment

### Automatic Deployment (CD)

This project automatically deploys to Cloudflare Workers when changes are pushed to the `main` branch.

#### Setup Required

1. Create a Cloudflare API token:
   - Go to [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens)
   - Click "Create Token"
   - Use the "Edit Cloudflare Workers" template
   - Save the token

2. Add the token to GitHub Secrets:
   - Go to your repository Settings → Secrets and variables → Actions
   - Create a new secret named `CLOUDFLARE_API_TOKEN`
   - Paste your API token as the value

### Manual Deployment

```bash
npm run deploy
```

Note: You'll need to authenticate with Wrangler first via `npx wrangler login`.

## API Response

The worker responds with a JSON object:

```json
{
  "message": "Hello World!",
  "path": "/",
  "timestamp": "2024-12-24T12:00:00.000Z"
}
```

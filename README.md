# Swappify — Spotify to YouTube Playlist Converter

Swappify is a Next.js + TypeScript app that reads a Spotify playlist, searches for each track on YouTube, and creates a private YouTube playlist with the matched videos.

## What it does

1. Sign in with Google / YouTube
2. Paste a Spotify playlist URL
3. Fetch playlist metadata and tracks from Spotify
4. Search YouTube for each track
5. Create a private YouTube playlist and add the matched videos
6. Return a summary including any failed tracks

## Tech stack

- Next.js 15 App Router
- TypeScript
- React
- Tailwind CSS
- Spotify Web API
- YouTube Data API v3 via `googleapis`

## Local setup

### 1. Install dependencies

```bash
npm ci
```

### 2. Create your environment file

Copy `.env.example` to `.env.local` and fill in the values:

```bash
cp .env.example .env.local
```

Required environment variables:

| Variable | Required | Description |
| --- | --- | --- |
| `APP_URL` | Yes | Base URL for the app, such as `http://localhost:3000` or your deployed domain |
| `SPOTIFY_CLIENT_ID` | Yes | Spotify application client ID |
| `SPOTIFY_CLIENT_SECRET` | Yes | Spotify application client secret |
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth client secret |
| `GOOGLE_YOUTUBE_SCOPES` | Yes | Space- or comma-separated YouTube OAuth scopes |
| `GOOGLE_REDIRECT_URL` | Optional | Explicit OAuth callback URL override. Defaults to `${APP_URL}/api/auth/youtube` |

### 3. Configure Spotify

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2. Create an app or open your existing app.
3. Copy the client ID and client secret into your environment file.
4. No Spotify redirect URL is required because the app uses the client credentials flow to read public playlist data.

### 4. Configure Google / YouTube OAuth

1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. Create or select a project.
3. Enable the **YouTube Data API v3**.
4. Create an **OAuth 2.0 Client ID** for a web application.
5. Add these authorized redirect URIs:
   - `http://localhost:3000/api/auth/youtube`
   - `https://your-production-domain/api/auth/youtube`
   - Any preview deployment callback you plan to use
6. Copy the Google client ID and client secret into `.env.local`.
7. Set `GOOGLE_YOUTUBE_SCOPES` to the scopes your app needs. A good starting point is:

```env
GOOGLE_YOUTUBE_SCOPES=https://www.googleapis.com/auth/youtube https://www.googleapis.com/auth/youtube.force-ssl
```

### 5. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deployment notes

### Recommended target: Vercel

This project is a good fit for Vercel, but production will only work if the OAuth and environment settings are exact.

Deployment checklist:

- Set all variables from `.env.example` in the Vercel project settings
- Set `APP_URL` to your production domain
- Add the production callback URL to your Google OAuth app
- If you use Vercel preview deployments, register each preview callback URL you need or use a stable production callback
- Keep `SPOTIFY_CLIENT_SECRET` and `GOOGLE_CLIENT_SECRET` server-side only

### Runtime expectations

The API routes that call Spotify and Google APIs are configured for the **Node.js runtime**. This avoids Edge-runtime compatibility issues with `googleapis` and Node-specific modules.

## Build and validation

Available scripts:

```bash
npm run dev
npm run build
npm run start
npm run lint
```

Node.js `18.18.0` or newer is required.

## Known limitations

- Track matching currently uses a simple `"track name + artist"` search
- Some songs may resolve to remixes, live versions, or no result at all
- Created YouTube playlists are private
- There is not yet a manual rematch workflow for failed tracks

## Why hosting can fail

The most common deployment issues for this app are:

- Missing production environment variables
- Google OAuth redirect URI mismatches
- Secrets being configured incorrectly
- Server/runtime differences between local development and deployment

This repository now includes a complete `.env.example`, explicit Node runtime configuration for API routes, and deployment-focused setup notes to make those problems easier to diagnose.

## Roadmap

Phase 1:

- [x] Document required environment variables
- [x] Document Spotify and Google OAuth setup
- [x] Clarify deployment path for Vercel
- [x] Ensure server routes use server-side secrets and Node runtime

Next improvements:

- [ ] Better track matching heuristics
- [ ] Conversion progress UI
- [ ] Retry / manual rematch flow
- [ ] Automated tests for matching logic
- [ ] CI for lint and build

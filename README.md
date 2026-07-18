# Participatory Plant Mapping

A mobile-first Vue application for collecting plant Observations and viewing them on MapLibre/H3 maps. The Vercel API stores metadata in Supabase and private Photos and Voice Notes in Google Drive.

## Project structure

- `frontend/` — Vue 3, Vite, Bun, Tailwind, and shadcn-vue-style components
- `api/` — Hono TypeScript API for Vercel’s Node.js runtime
- `supabase/` — manually applied SQL migrations
- `docs/adr/` — agreed architecture decisions

## Local development

Requirements: Bun and Node.js 22.

```sh
cd api
cp .env.example .env.local
bun install
bun run dev
```

In another terminal:

```sh
cd frontend
cp .env.example .env.local
bun install
bun run dev
```

The frontend defaults to `http://localhost:5173/pm-hybrid-graden/`; the API defaults to `http://localhost:3000`.

## Supabase

1. Create a Supabase project.
2. Run `supabase/migrations/0001_initial.sql` in the SQL editor.
3. Run edited copies of the commented Access Code examples at the bottom of that file.
4. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in Vercel.

The browser never receives the service-role key. See `supabase/README.md` for closing Events and rotating codes.

## Private Google Drive storage

1. Create a Google Cloud project and enable the Google Drive API.
2. Configure an external OAuth consent screen and move it to **In production**. Testing refresh tokens expire after seven days.
3. Create an OAuth client and authorize your own Google account once with only `https://www.googleapis.com/auth/drive.file` and offline access. Google OAuth Playground can perform this one-time exchange when configured with your client credentials.
4. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REFRESH_TOKEN` in Vercel.

The API creates its private `pm-hybrid-garden` folder on the first media upload and stores the folder ID in Supabase.

## Vercel API deployment

Create a Vercel project from this repository with `api/` as its root. Add:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`
- `ALLOWED_ORIGINS=https://thibaud-c.github.io,http://localhost:5173`
- `CRON_SECRET` containing a long random value

Vercel deploys the Hono app and calls `/cron/cleanup` daily at 03:00 UTC. Cleanup is idempotent and removes expired drafts and Temporary Collection Sessions.

## GitHub Pages deployment

Create `frontend/.env.production.local` containing the deployed API URL:

```env
VITE_API_BASE_URL=https://your-api.vercel.app
```

Then publish locally:

```sh
cd frontend
bun run deploy
```

In GitHub, choose **Settings → Pages → Deploy from a branch**, select `gh-pages`, and publish from `/ (root)`. The configured project URL is `https://thibaud-c.github.io/pm-hybrid-graden/`.

## Verification

```sh
cd api && bun run typecheck && bun test
cd ../frontend && bun test && bun run build
```

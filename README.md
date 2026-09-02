# JWRLCS Replay Parser Service

This is the backend engine for the GHL `/admin/replay-import` page. It accepts an authenticated multipart upload at `POST /parse-series`, parses Rocket League `.replay` files with pinned `boxcars.js` 1.0.6, and returns the JWRLCS normalized contract `0.2.0` for administrator review.

It does **not** write games, player statistics, match results, or standings. The first deployment is intentionally parse-only.

## Simple explanation

- GHL is the upload screen.
- This service is the replay-reading machine.
- Supabase Auth checks that the person using the machine is a verified JWRLCS administrator.
- The response goes back to GHL for team and player corrections.
- Nothing is saved to league history during this step.

## Security behavior

- Requires `Authorization: Bearer <Supabase access token>`.
- Confirms the token with Supabase Auth.
- Confirms a matching active, verified `owner` or `administrator` profile.
- Uses the publishable key only. No service-role key is required.
- Restricts browser origins through `ALLOWED_ORIGINS`.
- Rejects invalid extensions, empty files, oversized uploads, excess files, duplicate replay hashes, and corrupt replays.
- Does not log tokens or replay contents.

## API

### `GET /health`

Returns:

```json
{"ok":true,"service":"jwrlcs-replay-parser","contract_version":"0.2.0"}
```

### `POST /parse-series`

Send `multipart/form-data` with:

- One or more file parts containing `.replay` files. Field names may be `files`, `replays`, or repeated file fields.
- Optional `match_id` or `matchId` containing the selected scheduled-match UUID.
- Supabase access token in the `Authorization` header.

The successful response is the normalized series object directly, not nested under `data`.

## Run locally

1. Install Node.js 22 or newer.
2. Copy `.env.example` to `.env` and fill in the server environment variables. Never commit `.env`.
3. Run `npm ci`.
4. Export the environment variables through your terminal or development runner.
5. Run `npm start`.
6. Open `http://localhost:8080/health`.

## Test

Point `REPLAY_FIXTURE_DIR` at the existing seven-replay test folder, then run:

```bash
REPLAY_FIXTURE_DIR="/path/to/JWRLCS-Replay-Parser-Test" npm test
```

The verified result is seven games and a 4–3 series. The original replay files are not included in this service package.

## Deploy on Render

1. Put this folder in a private GitHub repository.
2. In Render, choose **New → Blueprint** and connect the repository. Render reads `render.yaml` and builds the included Dockerfile.
   - The Blueprint uses Render's free plan for this first connection test.
   - Free services can sleep and are not intended for production. Move to an appropriate paid web-service plan before Season 8 begins.
3. Add these environment variables in Render:
   - `SUPABASE_URL`: the JWRLCS Supabase project URL.
   - `SUPABASE_PUBLISHABLE_KEY`: the JWRLCS publishable key.
   - `ALLOWED_ORIGINS`: comma-separated production and preview origins, for example `https://your-jwrlcs-domain.com,https://*.vibepreview.com`.
   - `ADMIN_PROFILE_USER_COLUMN`: keep `user_id` unless the production table links Auth users through an `id` column.
4. Deploy and open `https://YOUR-SERVICE.onrender.com/health`.
5. Copy only the service base URL, without `/parse-series`.
6. Configure GHL with `VITE_REPLAY_PARSER_URL=https://YOUR-SERVICE.onrender.com` or runtime `REPLAY_PARSER_URL`.
7. Republish GHL, sign in as the verified owner, choose a scheduled match, upload the seven test replays, and press **Parse Replays**.

## First live acceptance test

The GHL review screen must show:

- Contract version `0.2.0`.
- Seven games.
- Game scores `1–5`, `2–5`, `3–2`, `3–2`, `2–0`, `2–3`, `5–0`.
- Provisional blue/orange series score `4–3`.
- Six human players per game.
- Manual mapping required for the Epic players whose replay IDs are missing.
- A warning, not an error, for one goal with zero shots.

Do not begin the database-import endpoint until this parse-only acceptance test passes from the real GHL page.

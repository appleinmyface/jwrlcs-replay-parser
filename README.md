# JWRLCS Replay Parser Service

This service powers the GHL `/admin/replay-import` review page. It accepts an authenticated multipart upload at `POST /parse-series`, parses Rocket League `.replay` files with released Rust `boxcars` 0.12.0 through the included `@jwrlcs/boxcars-wasm` 0.1.0 binding, and returns the backward-compatible JWRLCS `0.3.0` contract.

See [the overtime integration handoff](docs/OVERTIME_INTEGRATION.md) for the packaged `jwrlcs-overtime-v1` extension, availability, real-fixture limitations, and subsequent storage work. This source package has not been deployed.

Version 0.3.0 retains the five existing scoreboard statistics and adds guarded network-stream extraction for stable player identity, demolitions, overtime, and timing. Unsupported or unverified values are `null`; they are never fabricated as zero.

It does not write games, statistics, match results, or standings.

## Security behavior

- Requires `Authorization: Bearer <Supabase access token>`.
- Confirms the token with Supabase Auth and checks an enabled, verified `owner` or `administrator` profile.
- Uses the publishable key only; no service-role key is required.
- Restricts browser origins through `ALLOWED_ORIGINS`.
- Preserves the existing upload limits and rejects invalid, empty, oversized, duplicate, or corrupt replay files.
- Does not log tokens or replay contents.

## API

### `GET /health`

```json
{"ok":true,"service":"jwrlcs-replay-parser","contract_version":"0.3.0"}
```

### `POST /parse-series`

Send `multipart/form-data` containing one or more `.replay` file parts, optional `match_id`/`matchId`, and the Supabase access token in `Authorization`. The response is the series object directly, not nested under `data`.

Existing consumers may continue reading:

```text
games[].players[].statistics.score
games[].players[].statistics.goals
games[].players[].statistics.assists
games[].players[].statistics.saves
games[].players[].statistics.shots
```

New consumers must check `games[].advanced_metrics.metric_availability` and each player's `metric_availability` before using advanced values. See `docs/JWRLCS_REPLAY_PARSER_0.3.0_CONTRACT.md`.

## Run and test

Requires Node.js 22 or newer.

```bash
npm ci
npm test
REPLAY_FIXTURE_DIR="/path/to/JWRLCS-Replay-Parser-Test" npm test
REPLAY_FIXTURE_DIR="/path/to/JWRLCS-Replay-Parser-Test" RECENT_REPLAY_FILE="/path/to/AECE585C11F1C1FA47B6CBA5D3AEA3D3.replay" npm test
REPLAY_FIXTURE_DIR="/path/to/JWRLCS-Replay-Parser-Test" RECENT_REPLAY_FILE="/path/to/AECE585C11F1C1FA47B6CBA5D3AEA3D3.replay" CURRENT_VALIDATION_REPLAY_FILE="/path/to/B5C5C4D211F1C1FBE09ECBA5A4E06F15.replay" npm test
npm start
```

The fixture suite verifies seven games, a 4–3 color series, all 42 legacy player-stat rows, stable identity resolution, demo attribution and deduplication, one real overtime game, null handling for unverified duration, and the valid one-goal/zero-shot case. The original replay files are not included in this source package.

The new B5 current-build fixture decodes all 7,281 frames, resolves seven IDs with six participating accounts, and has 11 internally consistent demos. Its unassigned Lebyrinnn row remains null and available for review. The prior Eclipse–Aspect discrepancy is closed as unresolved: preserve its `DEMOLITION_COUNTER_MISMATCH` and null totals without re-investigating the interval. An ambiguous replay does not invalidate another game's available metrics. All 21 fixture-enabled regressions pass, including a mixed-format/ambiguous upload. Internal consistency is not independent visual verification. Unsupported physical duration, boost, movement, and positioning remain null; see `docs/VALIDATION_REPORT.md`.

The tested WASM binary and Node glue are included under `vendor/boxcars-wasm/`. Rust is not needed at runtime or for ordinary deployment. `Cargo.lock`, provenance, upstream license, binary checksums, and `scripts/build-decoder.sh` support optional reproducible rebuilding. No extra service/subscription is needed.

## Deploy on Render

1. Push this folder to the private Git repository connected to the existing `jwrlcs-replay-parser` Render service.
2. Deploy that revision without changing the existing environment values.
3. Confirm `GET /health` reports `contract_version: "0.3.0"`.
4. Send an authenticated retained fixture to `POST /parse-series` and verify `advanced_metrics.network_decode_status` is `success`.

Required environment variables remain unchanged:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `ALLOWED_ORIGINS`
- `ADMIN_PROFILE_USER_COLUMN`
- `MAX_REPLAY_BYTES`
- `MAX_SERIES_BYTES`
- `MAX_REPLAY_FILES`

The included `render.yaml` and `Dockerfile` remain deployable as-is.

For the exact existing-service repository/branch and manual-deployment procedure, see `docs/DEPLOYMENT.md`. Preserve existing Render authentication/environment configuration; do not create a replacement service or modify Supabase/GHL.

## Conservative network fallback

The service first parses with network decoding enabled. If the network stream is incompatible but the replay header is valid, it reparses without network frames, returns the five scoreboard statistics, sets advanced values to `null`, and emits `ADVANCED_NETWORK_DECODE_FAILED`. A corrupt replay still returns the existing parse error.

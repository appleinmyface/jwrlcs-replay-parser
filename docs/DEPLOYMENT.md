# Deploy v0.3.0 to the existing Render service

## Status

This bundle is prepared but not deployed. The available workspace has no Render deployment credential/session, linked Git remote, or connected repository/branch metadata. The live `/health` still reports v0.2.0. Do not interpret local tests as a live deployment check.

The new `B5C5C4D211F1C1FBE09ECBA5A4E06F15.replay` passes current-build decoding, identity, and available demo-counter checks: 7,281 frames, six participants, 11 demos, no gameplay attribution loss or counter mismatch. Overtime remains null. The older Eclipse–Aspect discrepancy is closed as unresolved; its warning/null totals remain intact and do not invalidate other replays. All 21 focused tests pass. Independent visual verification is distinct from these internal checks.

## Locate the existing deployment target

1. Sign in normally at https://dashboard.render.com — never paste credentials into chat.
2. Open the existing web service named `jwrlcs-replay-parser`; confirm its URL is `https://jwrlcs-replay-parser.onrender.com`.
3. Open **Settings**. In **Build & Deploy**, record the linked **Repository**, **Branch**, **Root Directory**, runtime, and Dockerfile path.
4. Open that exact repository and branch through the normal Git-provider login. Use the existing Root Directory; do not create a replacement Render service.

## Replace the parser revision

After comparing the connected revision for any newer/custom authentication changes, copy these bundle files into the configured service root:

- `src/advanced.mjs` (new)
- `src/engine.mjs`
- `src/normalize.mjs`
- `src/http.mjs` (the `/health` version changes; auth/upload logic is unchanged)
- `package.json`
- `package-lock.json`
- `vendor/boxcars-wasm/` (including prebuilt WASM/glue, package metadata, Cargo.lock and provenance; exclude `target/`)
- `Dockerfile` (adds COPY of the vendored runtime dependency before npm ci)
- `.dockerignore` (excludes Rust build intermediates)
- `scripts/build-decoder.sh` (optional rebuild; Rust is not needed to deploy)
- `test/` (all tests)
- `docs/` (contract, types, validation, deployment)
- `README.md`

Do not overwrite a server `.env` file. The bundle's `src/auth.mjs`, `src/errors.mjs`, `src/parser.mjs`, `src/server.mjs`, `render.yaml`, and `.env.example` are unchanged from the original v0.2.0 artifact; preserve any separately verified deployment-specific changes. No replay binaries, access tokens, service-role keys, node_modules, or Rust build intermediates are included. Keep the existing Node runtime and environment; no additional service or subscription is introduced.

Run `npm ci` and the focused fixture command in `VALIDATION_REPORT.md`, then commit to the exact connected branch. Do not copy QA or test data to Supabase.

## Deploy

In the existing service's Render **Deploys** page, select **Manual Deploy → Deploy latest commit**. Confirm the displayed commit matches the commit containing these changes. Keep every existing environment value and authentication setting unchanged.

Render documentation: https://render.com/docs/deploys and https://render.com/docs/monorepo-support.

## Verify the live service

Open:

https://jwrlcs-replay-parser.onrender.com/health

It must return:

```json
{"ok":true,"service":"jwrlcs-replay-parser","contract_version":"0.3.0"}
```

Then perform an authenticated **parse-only** check:

1. Sign into the existing GHL admin portal normally as a verified administrator/owner.
2. Open Replay Import, choose any required match only as review context, and upload `B5C5C4D211F1C1FBE09ECBA5A4E06F15.replay`. Press **Parse Replays** only.
3. In browser Developer Tools → Network, inspect the `POST /parse-series` response. The request must use the existing administrator Bearer session; do not copy its token into chat or publish it.
4. Confirm `contract_version: "0.3.0"`, `parser_engine.rust_boxcars_version: "0.12.0"`, and `games[0].timing.metric_version: "jwrlcs-timing-v2"`. Check final blue 1/orange 2 score, seven string identities, six `car_observed` rows, unassigned Lebyrinnn retained with null demos, 11 counted gameplay demos, 2 repeats, 8 non-gameplay exclusions, and no counter mismatch. Participating demo outputs are Albert 2/2, ttvCupboard 2/1, Sean 1/3, Heynamesjr 1/2, zev 2/0, apple 3/3 (inflicted/taken). Overtime and physical duration must remain null. TeamSize=4 and no-car warnings remain review warnings. This is a parse-only deployment check, not an independent visual demo recount.
5. Do **not** click Import, Confirm Import, Save Results, or any database-write action. Close the review page afterward. The parser itself performs no league-data writes.
6. Confirm an unauthenticated parse request is denied; `/health` remains public.

A successful `/health` version without an authenticated parsing response is not complete live verification.

The closed Eclipse–Aspect interval must not be reopened as part of deployment. Existing automated mismatch regressions preserve its warning/null behavior.

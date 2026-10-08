# Retained fixture verification manifest

The replay binaries are intentionally not distributed in this source bundle. Set `REPLAY_FIXTURE_DIR` to the retained `JWRLCS-Replay-Parser-Test` directory to run the integration test.

All seven fixtures report build `240618.64094.453196`, replay version `8`, and replay major/minor/net `868/32/10`.

| Fixture | SHA-256 | Score | Unique gameplay demos | Repeated updates ignored | Non-gameplay updates ignored | OT status | Official playing duration |
|---|---|---:|---:|---:|---:|---:|---:|
| `1F5FE3AA4D16641F2B03BF9A0E7D87F1.replay` | `2a28d3203cc9d3913d1d050b78575ec308578a081249510a2c03f6a04996a220` | 2–0 | 8 | 3 | 0 | Unknown | null |
| `46E29CE349B7A73BDBF35CA2D3500FB7.replay` | `a57fc7d1c28262a244d137ff8b0543e6e68b61d4964b94c3cc06c715a51050e6` | 2–3 | 12 | 5 | 0 | Unknown | null |
| `57DCF3AE451939092504A88BA7D782B5.replay` | `6b68af078ccfe2b34b055d153f59b3a00efceb8d59a032d9568fdffdfcb09cbb` | 5–0 | 7 | 4 | 1 | Unknown | null |
| `8A4F11A94D99212BF503C9A034869234.replay` | `685aaca8b8f390075dba4908e155a44edfc4157a9feec5be1d3f8f0ae089a9f4` | 3–2 | 3 | 1 | 1 | Yes, 36 s | null |
| `A24859B640BF09ADB4BEA99A85621AF3.replay` | `e8969d2cdcd43490ca8dcfe9133a940234639acba5de168c7a5a43a498d6aa78` | 3–2 | 9 | 3 | 0 | Unknown | null |
| `CDFC47E540D86EDE93F9DEA21237A4D9.replay` | `fd0ce62fb1d9f36ecdb373e3c178f28dbd0a8709818c386dca4d573062416c6d` | 1–5 | 9 | 5 | 0 | Unknown | null |
| `E7797F9E42C7F4DEDBBC7C8649EBAAF4.replay` | `8d339e6e665e82baa8a2a2703c0bee491240a910cb9e414ed318742da916bb4d` | 2–5 | 9 | 3 | 0 | Unknown | null |

The fixed expected demo totals in `test/series.test.mjs` were recorded after manually reviewing the decoded demolition event stream, its attacker/victim car actor, the car-to-PRI relation, lifecycle generation, game state, and repeat updates. The test then compares the production normalizer against those fixed counts.

Real-fixture coverage:

- Seven complete 3v3 scoreboard headers and 42 player rows.
- Player identity recovery from network `UniqueId` when header IDs are absent.
- Car respawns, PRI generations, actor-ID reuse, repeated demo replication, and non-gameplay demo updates.
- One real overtime goal and overtime clock.
- One valid one-goal/zero-shot scoreboard row.
- No verified pause fixture and no forfeit fixture.

Synthetic coverage in `test/advanced.test.mjs`:

- Actor destruction/recreation and same-ID reuse.
- Team-change observation.
- Duplicate demo suppression.
- Non-active demo exclusion.
- Missing network frames.
- Incomplete overtime evidence.
- Pause and forfeit interval closure.

The supplied `AECE585C11F1C1FA47B6CBA5D3AEA3D3.replay` has SHA-256 `4ef298fc0b1923f06d5dc75a33458fbf33a77707e1c34f527bfc2dd8a8529f48`, build `261001.2867.529371`, and major/minor/net `868/34/12`. The updated boxcars 0.12.0 WASM decodes all 8,176 frames. All seven account IDs resolve; six accounts have cars. The event algorithm finds nine demos but recorded counters indicate ten, so all official demo outputs are null with an explicit mismatch warning. This discrepancy is closed as unresolved due to missing evidence; do not reopen the interval unless new evidence is supplied. The user's manually observed Albert→Heynamesjr event is already counted and does not confirm the additional tally. Existing tests preserve the disposition without a new recount.

Set `CURRENT_VALIDATION_REPLAY_FILE` to `B5C5C4D211F1C1FBE09ECBA5A4E06F15.replay`, SHA-256 `43e8cb7070b47f201b19fd4bdbc497bba2dfcfc67b341e9a19e94474fef8660c`. It uses the same current build/protocol, decodes 7,281 frames, and resolves seven account IDs. Six participants have 11 internally consistent demos; unassigned Lebyrinnn remains null. `test/current-validation.test.mjs` checks fixed event candidates against every available recorded per-player counter, unavailable timing/scouting, scoreboard preservation, and mixed-game isolation. The fixed values are internal replay evidence, not independently viewed demo labels. See `docs/VALIDATION_REPORT.md` for counter absence, gaps, exclusions, and availability.

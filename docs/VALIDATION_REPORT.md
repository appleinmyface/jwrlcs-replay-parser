> Current overtime implementation: see [OVERTIME_INTEGRATION.md](OVERTIME_INTEGRATION.md), [OVERTIME_VALIDATION_REPORT.md](OVERTIME_VALIDATION_REPORT.md), and OVERTIME_FIXTURE_RESULTS.json. The earlier results below are retained history, not validation of the new OT rules.

# Replay-parser v0.3.0 final validation — 2026-10-08 UTC

## Final disposition and new current-build validation

**Deployable source is finalized; no live deployment has occurred.** The existing Render `/health` was checked during this task and still returned `contract_version: "0.2.0"`. The Render-linked repository/branch and deployment access are not available to this workspace. See `DEPLOYMENT.md` for the exact manual step.

**Eclipse–Aspect is closed as unresolved due to missing evidence.** Preserve `DEMOLITION_COUNTER_MISMATCH` and null affected official demo totals. The user's observation corroborates the already-counted Albert→Heynamesjr event; it does not establish an additional event or a Lebyrinnn→Heynamesjr pairing. Do not re-investigate its interval unless new evidence is supplied. Existing regression assertions preserve this disposition; they do not reopen the investigation.

New file: `B5C5C4D211F1C1FBE09ECBA5A4E06F15.replay`.

SHA-256: `43e8cb7070b47f201b19fd4bdbc497bba2dfcfc67b341e9a19e94474fef8660c`.

| Check | Actual result |
|---|---|
| Build / major-minor-net / ReplayVersion | `261001.2867.529371` / `868/34/12` / `8` |
| Strict decoding | 7,281 / 7,281 recorded frames; no ignored decoder errors |
| Scoreboard | Blue 1, orange 2; all five existing stats unchanged for all seven rows |
| Identity / participation | Seven distinct string account IDs resolve; six have cars, three per team; Lebyrinnn has Team=-1, no observed car/team assignment, and remains available for review |
| Gameplay demos | 11 unique attributed events; sums inflicted=11 and taken=11 |
| Duplicate / non-gameplay updates | 2 Active repeats suppressed; 8 outside-Active updates excluded |
| Attribution | 0 unresolved gameplay endpoints; excluded goal-explosion updates are not promoted to gameplay demos |
| Available counter comparison | All observed MatchDemolishes/MatchTimesDemolished values agree; no mismatch warning |
| Independent accuracy | Not visually verified; both event and counter evidence come from this same replay |
| Overtime | Null: no bOverTime, bMatchEnded, bForfeit, or bFullMatchWinnerDecided update; recording finishes in Active without a recognized terminal boundary |
| Regulation clock | 300 seconds, a maximum observed clock reference only |
| Physical timing / deferred scouting | Actual playing, zero-second, and pause duration null; boost/movement/positioning and other unsupported metrics null |

Per-player comparison below is `[inflicted, taken]`. “Not serialized” is not a recorded counter zero.

| Player | Observed role | Event output | Recorded counter maximum |
|---|---|---|---|
| Albert | Blue participant | 2 / 2 | 2 / 2 |
| ttvCupboard | Blue participant | 2 / 1 | 2 / 1 |
| Sean | Blue participant | 1 / 3 | 1 / 3 |
| Heynamesjr | Orange participant | 1 / 2 | 1 / 2 |
| zev | Orange participant | 2 / 0 | 2 / taken not serialized |
| apple | Orange participant | 3 / 3 | 3 / 3 |
| Lebyrinnn | Unassigned; no car observed | null / null | Neither serialized |

zev's taken zero comes from no attributed victim event in the decoded gameplay stream, not from coercing an absent counter to zero. Lebyrinnn's missing participation stays null. Account identity does not establish participation across different replay files: ttvCupboard is a participant here, while the closed Eclipse–Aspect file retains it unassigned.

The new replay has three timestamp jumps over 250 ms, all PostGoalScored→ReplayPlayback with the game clock stopped:

| Prior sample → next sample, replay seconds | Jump | Clock |
|---|---:|---|
| 106.897650 → 110.770690 | 3.873040 s | 3:45 |
| 292.823030 → 301.848600 | 9.025570 s | 0:52 |
| 314.028960 → 316.654500 | 2.625540 s | 0:49 |

No above-threshold gap was found during Active. These are recording boundaries, not proof that every possible physical event is observed or that post-goal counters have universal semantics. Full recorded-frame decoding and internal tally agreement are established; an independent visual recount has not been performed.

All 21 raw demo updates use DemolishExtended. The 8 exclusions consist of 2 stale post-goal repeats of the already-counted Albert/apple mutual demo, 3 goal-explosion updates during PostGoalScored, and 3 goal-explosion updates during ReplayPlayback. Goal-explosion updates have inactive attacker-car references; three replay snapshots also lack victim-to-player links. They are excluded by phase and are not counted as unresolved **gameplay** attribution. The two Active duplicates occur at replay times 180.951450 s and 241.094270 s with unchanged victim generations. Detailed new-fixture event and counter ledgers accompany the deliverable.

Two focused integration regressions were added: strict new-build/counter/identity/nullable-metric checks, and a mixed upload containing the new replay, the closed ambiguous replay, and the older OT fixture. The latter proves ambiguity in one game does not clear another game's available demos or apply one game's OT status to the rest. Runtime extraction, authentication, upload limits, and decoder dependency versions are unchanged.

## Current Eclipse–Aspect replay

File: `AECE585C11F1C1FA47B6CBA5D3AEA3D3.replay`.

SHA-256: `4ef298fc0b1923f06d5dc75a33458fbf33a77707e1c34f527bfc2dd8a8529f48`.

| Item | Actual observed result |
|---|---|
| Header name/date | `eclipse vs aspect`; `2026-10-07 02-56-24` (replay-local time, timezone unknown) |
| Build | `261001.2867.529371` |
| Replay major/minor/net | `868/34/12` |
| ReplayVersion / GameVersion | `8` / `30` |
| Final header score | Blue 2, orange 7; team-color mapping remains administrator-reviewed |
| Scoreboard | Parsed successfully; all five existing stats preserved for seven header rows |
| Identity | Seven stable account IDs, all matched to network PRI accounts without name-only merging |
| Network decoding | Success: strict upstream boxcars 0.12.0 decoded all 8,176 frames, matching header NumFrames |
| Original failure | `MissingAttribute { actor: ActorId(2), actor_object: ObjectId(111), attribute_stream: StreamId(63) }` |
| Original failing property | `TAGame.GameEvent_Soccar_TA:bMatchCreatorAdminEnabled`, object ID 95 in the GameEvent_Soccar class net cache |
| Demos inflicted/taken | null for every player: game-recorded counters disagree with the event extractor; `DEMOLITION_COUNTER_MISMATCH` |
| Overtime | null; `unavailable` — not inferred from the score or absent header field |
| Regulation clock | Maximum observed clock 300 s; available as a clock reference only |
| Other timing metrics | Game clock, actual playing duration, zero-second play, and pauses remain null |
| Deferred scouting/MVP | null; `unsupported` |
| Independent demo/OT expectations | User observation corroborates one already-counted Albert→Heynamesjr event; complete-game demo/OT labels remain unavailable |
| Accuracy conclusion | Decoder compatibility and scoreboard preservation pass; current demo/OT accuracy is not independently verified |

Header players:

| Name | Color | Platform | Stable ID available |
|---|---|---|---|
| Albert | Blue | Steam | Yes |
| Sean | Blue | Steam | Yes |
| Lebyrinnn | Blue | Epic | Yes |
| ttvCupboard | Unassigned (`Team=-1`) | Epic | Yes |
| Heynamesjr | Orange | Epic | Yes |
| zev | Orange | Steam | Yes |
| apple | Orange | Steam | Yes |

### Why the three IDs were unresolved

`OnlineID` is the string `"0"` for the three Epic rows. Their account IDs are present in `PlayerStats[].PlayerID.fields.EpicAccountId`, a nested `UniqueNetId` header representation ignored by the previous normalizer. All three match network `UniqueId.remote_id.Epic` exactly. IDs are strings throughout; unsafe numeric IDs are rejected instead of rounded. This was an unsupported header representation plus the network-decoding failure, not absent identifiers. The four Steam OnlineID strings are unchanged.

The header reports `TeamSize: 4`, but has six team-assigned rows and a seventh zero-score entry (`ttvCupboard`) with **Team=-1**, not orange. Network PRI actor 12 belongs to that distinct Epic account, has no observed team assignment, and never has a car linked to it. The six other accounts do. The stream does not supply a decisive spectator flag, so this is reported precisely as `no_car_observed`, not proven spectator status or a reconnect. The row remains available for administrator review with a null team and null demo metrics; `NOT_3V3` and `HEADER_ENTRY_WITHOUT_CAR` remain warnings. Do not automatically import it as a seventh competitive player.

### Exact compatibility fix

The old npm `boxcars.js@1.0.6` artifact embeds **boxcars 0.10.7**, confirmed by its WASM paths. Earlier handoff metadata naming 0.10.5 was incorrect. The first current-fixture failure is the missing Boolean property `bMatchCreatorAdminEnabled` (introduced upstream in 0.10.9). A one-property patch would still be inadequate: the Season 24 format also grows `ProfileSettings` by 98 bits (three floats, two booleans), gated on `868/34/12`, and adds PRI status/counter mappings. Released boxcars 0.12.0 includes these changes. In this fixture the new camera fields decode to 5.8, 10.8, 7, false, true; all 8,176 frames are decoded in strict mode.

The maintained Rust decoder is unmodified. npm's latest binding remains 1.0.6 and its source still depends on 0.10.7. The contained fix rebuilds a small API-compatible WASM binding as private vendored `@jwrlcs/boxcars-wasm@0.1.0`, pinned to boxcars 0.12.0. It retains Node deployment, auth and HTTP behavior. No unknown properties are skipped, no paid service is introduced, and no Rust runtime is required.

Upstream evidence inspected:

- https://github.com/nickbabcock/boxcars/blob/master/CHANGELOG.md
- https://github.com/nickbabcock/boxcars/issues/295
- https://github.com/nickbabcock/boxcars/pull/296
- https://github.com/carl-sauter/boxcars.js/blob/main/Cargo.toml
- boxcars tag `v0.12.0`, commit `c1d7cb75399520667e5e6b058c8e27fcc0fa5b63`.

### Current demo cross-check and remaining validation

The event extractor attributes all nine detected unique active-gameplay events to stable accounts, but the replay's own PRI counters (`MatchDemolishes` and `MatchTimesDemolished`) indicate ten. These are separate recorded inputs to the counting algorithm, not an independently viewed or external reference. They expose a mismatch:

| Player | Attributed event candidate inflicted/taken | Observed recorded counters inflicted/taken |
|---|---:|---:|
| Albert | 2 / 1 | 2 / 1 |
| Sean | 2 / 1 | 2 / 1 |
| Lebyrinnn | **2 / 1** | **3 / 1** |
| Heynamesjr | **0 / 1** | **not observed / 2** |
| zev | 2 / 3 | 2 / 3 |
| apple | 1 / 2 | 1 / 2 |
| ttvCupboard | unavailable | not observed |

The two counter changes have no corresponding attributed demolition event. They do not prove a Lebyrinnn→Heynamesjr pairing. All official demo totals remain **null**, and the two mismatches remain in diagnostics/warnings. Nine is a diagnostic count, not the complete official result. This case is closed as unresolved; there is no outstanding instruction to review its interval without new evidence. Overtime also remains null under the unchanged timing contract. Historical compatibility findings above are retained without repeating the audit.

## Retained overtime fixture: resolve 347.772 vs 336

Fixture: `8A4F11A94D99212BF503C9A034869234.replay`, build `240618.64094.453196`.

The old implementation added wall-time between replicated `Active` phase boundaries. Raw network phase and clock transitions show:

| Phase | Active start | Active end | Active interval s | Clock change | Clock delta s | First ball hit | Before first touch s |
|---|---:|---:|---:|---|---:|---:|---:|
| Regulation 1 | 18.269980 | 70.592560 | 52.322580 | 300 → 250 | 50 | 20.203806 | 1.933826 |
| Regulation 2 | 86.598236 | 235.215240 | 148.617004 | 250 → 103 | 147 | 88.531250 | 1.933014 |
| Regulation 3 | 251.154510 | 312.691700 | 61.537190 | 103 → 44 | 59 | 253.087520 | 1.933010 |
| Regulation 4 | 328.710300 | 334.804320 | 6.094020 | 44 → 40 | 4 | 330.918100 | 2.207800 |
| Regulation 5 | 350.828430 | 392.760740 | 41.932310 | 40 → 0 | 40 | 352.779630 | 1.951200 |
| Overtime | 396.786350 | 434.054960 | 37.268610 | 0 → 36 | 36 | 398.693080 | 1.906730 |
| Total | | | **347.771714** | | **336** | | **11.865580** |

The extra **11.771714 s** is accounted for at the phase/clock representation level as:

```text
347.771714 − 336 = 11.771714
11.865580 pre-first-touch phase time
+ 0.175380 zero-clock-to-countdown interval
− 0.269246 residual from comparing integer clock samples to replicated phase boundaries
= 11.771714
```

The residual is not invented pause time. Its exact physical allocation is not established: the clock is integer-sampled, goal boundaries occur between clock ticks, and regulation and overtime do not start ticking identically around kickoff. For example, overtime's first `1` sample is at 398.726530, only 0.033450 s after the observed first hit at 398.693080. A uniform subtraction of kickoff-to-hit intervals would therefore also be wrong.

Checks:

- Countdown intervals total 24.076758 s and were already excluded.
- Four pre-OT `PostGoalScored` intervals total 47.944064 s and were already excluded.
- The final post-goal tail is 3.003300 s and was already excluded.
- Their sum, 75.024122 s, equals the recorded first-phase-to-last-frame span minus active-phase candidate time. Goal replays were not the extra 11.772 s.
- No recognized stop-countdown pause signal was observed. Absence of that signal is not proof of zero pauses.
- Zero was sampled at 392.585360; the overtime countdown began at 392.760740; this 0.175380-s sample-to-transition interval is not an independently verified physical zero-second duration.

Conclusion: 347.772 is a reproducible **active-phase diagnostic**, not a verified authoritative playing duration. `playing_duration_seconds`, `zero_second_play_seconds`, and `pause_seconds` are now null with individual `unavailable` statuses. Demo totals and observed OT flag/36-second terminal clock remain intact.

The prior classification of the six other old fixtures as definite no-OT is also withdrawn: a decisive header plus a zero-clock sample without a terminal attribute is insufficient evidence. They now return `overtime: null` rather than false.

## Focused verification

```bash
npm ci
REPLAY_FIXTURE_DIR="/path/to/JWRLCS-Replay-Parser-Test" \
RECENT_REPLAY_FILE="/path/to/AECE585C11F1C1FA47B6CBA5D3AEA3D3.replay" \
CURRENT_VALIDATION_REPLAY_FILE="/path/to/B5C5C4D211F1C1FBE09ECBA5A4E06F15.replay" \
npm test
```

The tests cover strict full-frame decoding of the current replay and all seven old fixtures; fixed retained demo totals; actor respawn/reuse and replicated-event deduplication; non-gameplay updates; all 42 old legacy scoreboard rows; all seven new header rows; nested Epic identity strings and unsafe-number rejection; no name-only account merging; seventh-row preservation; counter disagreement withholding demo totals; real older-build OT evidence; missing/incomplete timing; withheld duration; exact timing availability; network-unavailable fallback; unchanged owner/administrator authorization; anonymous HTTP denial; and `/health`.

Actual focused run: **21 tests passed, 0 failed, 0 skipped**, using the retained seven-replay directory and both recent replay fixtures. Source/test modules passed syntax checks. `src/auth.mjs` remains byte-for-byte identical to the original v0.2.0 artifact. These are compatibility/extraction regressions, not external demo-count ground truth. Old demo totals remain unchanged, and the old OT fixture still returns true / 36 seconds with duration null.

Synthetic tests exercise pause and forfeit signals only as diagnostics. No real pause/forfeit fixture or independently labeled actual playing-duration expected value is present.

No Supabase schema, production league records, or GHL screens were modified.

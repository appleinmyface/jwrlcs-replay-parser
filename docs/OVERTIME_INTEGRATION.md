# JWRLCS overtime extraction and storage handoff

Implementation: `jwrlcs-overtime-v1`; timing: `jwrlcs-timing-v3`.
HTTP/parser contract remains `0.3.0`. Demolitions remain `jwrlcs-demolitions-v3`.
Baseline: live Render commit `9541ed3b26f34b2945a3d9a3a62787370bba9db4`.
The decoder remains boxcars 0.12.0 through the existing WASM binding.

This is a tested source package, **not a production deployment**. No database,
frontend, environment, authentication, upload limit, or league record was changed.

## Exact response paths

`g` means one member of `response.games`; `p` means one member of `g.players`.
New fields are always emitted by this implementation. Older 0.3.0 responses can
omit them; consumers must treat absent fields as unavailable.

| Value path | Type / unit | Availability path |
|---|---|---|
| `g.timing.overtime` | `boolean \| null` | `g.advanced_metrics.metric_availability.overtime` |
| `g.timing.overtime_winner_color` | `"blue" \| "orange" \| null` | `g.advanced_metrics.metric_availability.overtime_winner_color` |
| `g.timing.overtime_goal` | goal object or `null` | `g.advanced_metrics.metric_availability.overtime_goal` |
| `g.timing.overtime_goal.credited_scorer` | `{ platform: string, platform_user_id: string, replay_name: string } \| null` | `g.advanced_metrics.metric_availability.overtime_goal_scorer` |
| `p.advanced_statistics.overtime_goals` | nonnegative integer or `null`; currently 0 or 1 | `p.metric_availability.overtime_goals` |
| `g.timing.overtime_seconds` | integer game-clock seconds or `null`; precision 1 second | `g.advanced_metrics.metric_availability.overtime_seconds` |
| `g.timing.overtime_goal.clock_seconds` | fresh integer game-clock sample or `null` | `g.advanced_metrics.metric_availability.overtime_goal_clock_seconds` |
| `g.timing.regulation_clock_seconds` | maximum observed pre-OT clock, integer or `null`; not elapsed play | `g.advanced_metrics.metric_availability.regulation_clock_seconds` |
| `g.timing.game_clock_seconds` | arithmetic regulation-clock reference plus verified OT clock, or `null` | `g.advanced_metrics.metric_availability.game_clock_seconds` |
| `g.timing.playing_duration_seconds` | always `null` | `g.advanced_metrics.metric_availability.playing_duration_seconds` |
| `g.timing.zero_second_play_seconds` | always `null` | `g.advanced_metrics.metric_availability.zero_second_play_seconds` |
| `g.timing.pause_seconds` | always `null` | `g.advanced_metrics.metric_availability.pause_seconds` |
| `g.timing.ended_by` | existing string enum | `g.advanced_metrics.metric_availability.ended_by` |

The existing availability aliases `overtime_clock_duration` and
`playing_duration` remain. `g.timing.metric_version` is `jwrlcs-timing-v3`.
New OT availability objects use `metric_version: "jwrlcs-overtime-v1"`,
`validation_scope: "explicit_signal_and_reconciled_game_records"`, and
`independent_reference_status: "not_compared"`.

`verified` describes extraction and reconciliation of recorded signals. It is
**not a claim of independent visual ground truth**. Availability is per game
and per player, never one global assertion for a mixed-format series.

The goal object additionally contains:

```ts
{
  frame: number;                 // zero-based decoded frame index
  replay_seconds: number;        // replay timestamp, rounded to 0.001 s
  clock_seconds: number | null;  // direct clock sample; not physical duration
  scoring_team_color: "blue" | "orange";
  score_before: { blue: number; orange: number };
  score_after: { blue: number; orange: number };
  credited_scorer: {
    platform: string;
    platform_user_id: string;    // exact string, never Number(...)
    replay_name: string;
  } | null;
  own_goal: null;                // physical own-goal classification unsupported
  attribution_status: "credited_player" | "unresolved";
}
```

## Detection and withholding rules

- A live/kickoff `TAGame.GameEvent_Soccar_TA:bOverTime = true` verifies OT
  occurrence. A positive signal seen only in a paused/replayed fragment does not
  establish a live OT transition.
- False requires explicit negative OT evidence, decoded-frame completeness,
  beginning/clock/terminal coverage, consistent final scores, no conflicting
  positive flag, and no relevant live/countdown gap. A forfeit, winner, tied
  score, 0:00 goal, or long replay alone never establishes true or false.
- **Absent-flag inference is disabled.** No new combination-based fallback was
  enabled because independently labeled current-build examples are missing.
- An OT winning goal requires a unique Active-to-PostGoalScored boundary,
  explicit OT state, a corresponding header goal record, tied pre-goal network
  team scores, a one-goal change, matching scored-on-team signal, matching final
  scores, and no subsequent live play/goal or contradictory resolved game winner.
  A pause or recording gap across that goal boundary blocks the outcome.
- Credited scorer additionally requires one matching player-goal counter change
  in that exact frame, the PRI generation's stable UniqueId, observed car/team
  participation, matching goal record, and exactly one matching review account.
  Neither a name alone, last touch, score rank, nor array position identifies it.
  When a first cumulative `MatchGoals = 1` appears without a prior tally, the
  baseline remains **null** and one matching goal record is additionally required;
  no prior counter zero is manufactured. Delayed/ambiguous/conflicting changes
  remain unresolved rather than selecting a likely scorer.
- Repeated counters/scored-on updates and goal-replay phases cannot add a goal.
- A known team win can coexist with an unknown scorer. In that case every
  participant's OT-goal value remains null. Physical own goals are not inferred:
  defending-team credit or unexplained attribution leaves `own_goal` and the
  credited scorer null with a warning.
- A verified regulation game gives verified OT-goal zeroes to uniquely identified
  observed participants. Unassigned/no-car entries stay present with null metrics.
- OT seconds are direct game-clock data, never replay timestamp subtraction.
  They require an explicit start with a fresh recorded zero, a monotonic plausible
  OT clock, a fresh goal clock, complete OT coverage, and no unvalidated technical
  pause signal. Earlier regulation goal-replay cuts do not invalidate independent
  OT clock evidence. Unknown duration does not hide a verified outcome/scorer.
- OT analysis failure is isolated: it cannot discard independently available
  demolition statistics. Physical duration, boost, movement, positioning, genuine
  MVP, and other previously unsupported metrics remain unavailable.

Private raw evidence is retained at `g.advanced_metrics.diagnostics.overtime`:
explicit flags, phases, clock samples, pauses/gaps, team-score changes, PRI goal
counter changes, header goal records, candidate blockers, and credited-scorer
evidence. Actor keys include lifecycle generations. Do not expose this diagnostic
object or stable platform accounts through public snapshots.

Relevant warnings: `OVERTIME_STATUS_UNVERIFIED`, `OVERTIME_WINNER_UNVERIFIED`,
`OVERTIME_SCORER_UNVERIFIED`, `OVERTIME_DURATION_UNVERIFIED`, and
`OVERTIME_ANALYSIS_FAILED`. Each unavailable metric also has its own reason.

## Fixture evidence and remaining release validation

| Case | Actual evidence available | Claim supported |
|---|---|---|
| Older OT goal, `8A4F11A9…` | Raw explicit flag at frame 10260; blue goal at frame 11494 / 434.054960 s; 2–2 to 3–2; PRI 25 goal tally and stable Epic account; terminal OT clock 36 | Recorded-signal reconciliation; not visual verification |
| Normal regulation ending | Synthetic explicit-negative/terminal tests | Logic tested; no independently labeled real fixture |
| Regulation goal at 0:00 | Synthetic zero-second live goal | Logic tested; no independently labeled real fixture |
| Technical pause in regulation | Synthetic frozen-clock and pause tests | No guessed OT transition; no real pause validation claim |
| Technical pause in OT | Synthetic pause and resumed winning goal | Outcome/scorer remain separate; duration withheld; real fixture missing |
| Missing OT flags / gaps | Current retained replays plus synthetic gap/removed-flag tests | Null preservation and no implicit fallback; outcome accuracy not externally labeled |
| Missing/ambiguous/possible own-goal scorer | Synthetic cases and an edited copy of the real OT fixture | Withholding tested; no independently labeled real own-goal fixture |

To independently validate the missing cases, supply complete replays plus an
external label (HUD/video/manual observation), not another parser's expected
answer generated from this implementation:

1. One normally completed regulation match, with independently confirmed no OT.
2. One goal scored while regulation shows 0:00, with confirmation that no OT began.
3. A visual check of the retained OT fixture's winning team, credited scorer, and
   0:36 clock, or another full OT replay with those labels.
4. A regulation technical pause: pause/resume clock values and final outcome.
5. An OT technical pause: pause/resume clock values and final OT-goal clock.
6. A real own goal or genuinely missing/ambiguous credited scorer, with the
   game's credited scoring record identified separately from the physical touch.

If current-build flag-free OT inference is desired later, it specifically needs
labeled current-build OT, zero-second regulation, pause, and gap counterexamples.
This package does not claim that capability and does not deploy such a rule.

## Backend and frontend integration

The authenticated `POST /parse-series` upload format, authentication checks,
five `p.statistics` fields, identities, exclusions, and demolition fields are
unchanged. New runtime files are **both** `src/advanced.mjs` and `src/overtime.mjs`.
Replacing advanced.mjs without the new module will fail at startup.

No database columns or RPC parameters were deployed by this work. The existing
full `parser_result` preservation remains the audit source; extra JSON must not
be assumed to create official statistic columns automatically.

For the subsequent backend task:

- Persist nullable game OT occurrence, winning season-team UUID, attributed goal,
  nullable OT seconds, and separate availability/provenance through the existing
  atomic import after auditing the live schema. Do not invent column names from
  this logical handoff.
- Map `overtime_winner_color` through **that game's** reviewed blue/orange team
  mapping. Color is not a stable league team across games.
- Map credited scorer and per-player OT goals through the existing reviewed
  per-game stable `(platform, platform_user_id)` mapping. Preserve account IDs
  as strings and use the same aliases/review rules already used for demolitions.
  Excluded rows create no official statistics. Never match by name or array index.
- The server must validate submitted OT values against the retained parser result,
  each metric's availability, and included stable mappings, not trust client values.
- Only verified nonnegative player counts qualify. Preserve true zero; absent,
  unavailable, ambiguous, legacy, and excluded values stay null.
- Keep private parser JSON/accounts private. Public data should expose only
  eligible published values, league player/team UUIDs, and metric coverage.
- Track OT-outcome, winner, scorer, player-goal, and duration coverage separately.
  Unknown outcomes are not regulation or losses. Averages use verified samples;
  no samples yields null. A team outcome does not require known player attribution.

For GHL now: tolerate absent new fields from older responses; read the exact
paths above; show unknown as unavailable; preserve warnings and raw review data.
Do not send invented flat OT import properties until the backend contract is
implemented. Current publication behavior and official results remain unchanged.

## Reproduce tests

```sh
npm ci
REPLAY_FIXTURE_DIR=/path/to/seven-old-replays \
RECENT_REPLAY_FILE=/path/to/01-AECE585C11F1C1FA47B6CBA5D3AEA3D3.replay \
CURRENT_VALIDATION_REPLAY_FILE=/path/to/B5C5C4D211F1C1FBE09ECBA5A4E06F15.replay \
ETERNITY_SERIES_REPLAY_DIR=/path/to/four-eternity-byproduct-replays \
npm test
```

Missing environment variables deliberately skip the corresponding retained-replay
tests; a passing skipped run is not the release evidence reported here. Original
replay binaries are not redistributed inside the source bundle.

## Deployment preparation

This task does not deploy. Preserve the existing Render service, main branch,
environment variables, CORS/auth settings, upload limits, and WASM dependency.
The package includes the complete source and a file-checksum manifest. Review
the limited real-fixture coverage before any later release. The service's
unchanged `/health` contract version alone cannot identify this upgrade: an
authenticated **parse-only** response must show timing v3, overtime v1, and
demolitions v3. Do not import/save that validation result into league records.

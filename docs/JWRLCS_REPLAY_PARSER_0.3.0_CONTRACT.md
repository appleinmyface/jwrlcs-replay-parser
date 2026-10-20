> Overtime update: [OVERTIME_INTEGRATION.md](OVERTIME_INTEGRATION.md) is authoritative for the additive `jwrlcs-overtime-v1` fields, stricter availability rules, and current fixture limitations. No new database import fields were deployed.

# JWRLCS replay-parser 0.3.0 integration contract

## Compatibility and provenance

- Endpoint and authentication are unchanged: authenticated verified administrators call `POST /parse-series` with replay files as multipart form data.
- `contract_version` and every `games[].parser_version` are `0.3.0`.
- Parser engine: vendored `@jwrlcs/boxcars-wasm` `0.1.0`, backed by unmodified released Rust `boxcars` `0.12.0`.
- Metric versions: `jwrlcs-scouting-v1`, `jwrlcs-demolitions-v3`, `jwrlcs-overtime-v1`, and `jwrlcs-timing-v3`.
- The five legacy fields at `games[].players[].statistics` are unchanged and remain direct replay-header values.
- A numeric `0` is a recorded zero. `null` means unavailable, unsupported, or insufficiently verified. Consumers must not coerce new nullable statistics to zero.
- Availability is per game and per player. A mixed-format series has no series-wide claim that every metric is verified.
- `verified` describes evidence-backed extraction under the stated metric definition. It is not independent ground-truth certification. Demo availability adds `validation_scope: "extraction_and_attribution"` and `independent_reference_status: "not_compared"`. The Eclipse–Aspect replay decodes fully, but a recorded-counter mismatch makes its demo totals unavailable. The user's observation corroborates one already-counted event; full-game demo/OT accuracy remains unverified.

## Exact HTTP request and per-game consumption

`POST https://jwrlcs-replay-parser.onrender.com/parse-series` accepts `multipart/form-data`. Every file part with a `.replay` filename is collected regardless of its field name; use repeated `files` parts. Optional `match_id` (or legacy `matchId`) is review context only. Send the existing authenticated administrator access token in the Bearer header; do not set Content-Type manually when using FormData. The successful response is the series JSON object directly, with no `data` or `payload` wrapper.

```ts
import type { ParsedReplaySeries } from "./replay-parser-0.3.0";

export async function parseSeries(
  files: File[],
  accessToken: string,
  matchId?: string,
): Promise<ParsedReplaySeries> {
  const body = new FormData();
  for (const file of files) body.append("files", file, file.name);
  if (matchId) body.append("match_id", matchId);
  const response = await fetch("https://jwrlcs-replay-parser.onrender.com/parse-series", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message ?? "Replay parsing failed");
  return result;
}
```

The existing auth contract validates the token against Supabase Auth and reads the caller's administrator_profiles record using the caller's Bearer token and the server's publishable key. Role must be owner or administrator, is_verified must be true, verified_at populated, and disabled_at null. Origins and configured upload limits remain unchanged (default 7 files, 10 MiB per file, 70 MiB per series). No service-role credential is required.

An ambiguous game returns its own metric-specific warnings/null values while other parsed games keep their values. Never gate the entire series, all statistics, or the five scoreboard fields on `advanced_metrics.validation_status`: `partial` often means demos are available but timing is not. Use both the selected game's family status and the selected player's status for demos, and each exact timing availability path for timing. There is no global series validation status.

```ts
const demoAvailable =
  game.advanced_metrics.metric_availability.demolitions.status === "verified" &&
  player.metric_availability.demolitions.status === "verified";
const inflicted = demoAvailable ? player.advanced_statistics.demolitions_inflicted : null;
const taken = demoAvailable ? player.advanced_statistics.demolitions_taken : null;
// Preserve zero; do not use `value || 0`, `value ?? 0`, or truthiness to test availability.
```

## Exact response additions

### Parser and replay metadata

| JSON path | Type | Meaning |
|---|---:|---|
| `contract_version` | string | Series contract; exactly `0.3.0`. |
| `parser_engine.name` | string | `@jwrlcs/boxcars-wasm`. |
| `parser_engine.version` | string | `0.1.0`. |
| `parser_engine.rust_boxcars_version` | string | Embedded parser version `0.12.0`. |
| `parser_engine.metric_version` | string | Overall metric contract version. |
| `parser_engine.per_game_validation` | boolean | Always `true`; use each game's availability. |
| `games[].parser_version` | string | Parser contract used for that game. |
| `games[].replay_format.major_version` | integer or null | Replay header major version. |
| `games[].replay_format.minor_version` | integer or null | Replay header minor version. |
| `games[].replay_format.net_version` | integer or null | Replay network protocol version. |
| `games[].replay_format.game_type` | string or null | Replay game-type object name. |
| `games[].replay_format.game_version` | integer or null | Header `GameVersion`. |
| `games[].replay_format.build_version` | string or null | Header `BuildVersion`. |
| `games[].replay_format.replay_version` | integer or null | Header `ReplayVersion`. |

### Existing direct scoreboard data

| JSON path | Type | Units/definition | Source |
|---|---:|---|---|
| `games[].final_score.blue` | integer | Final blue-team goals. | Replay header `Team0Score`. |
| `games[].final_score.orange` | integer | Final orange-team goals. | Replay header `Team1Score`. |
| `games[].winner_color` | `"blue"`, `"orange"`, or null | Winner derived only from the final team scores; null for a tie. | Calculated. |
| `games[].players[].statistics.score` | integer | Rocket League scoreboard points. | Header `PlayerStats.Score`. |
| `games[].players[].statistics.goals` | integer | Official scoreboard goals. | Header `PlayerStats.Goals`. |
| `games[].players[].statistics.assists` | integer | Official scoreboard assists. | Header `PlayerStats.Assists`. |
| `games[].players[].statistics.saves` | integer | Official scoreboard saves. | Header `PlayerStats.Saves`. |
| `games[].players[].statistics.shots` | integer | Official scoreboard shots; `1 goal / 0 shots` is preserved. | Header `PlayerStats.Shots`. |

The parser does not infer MVP from the highest score. `games[].players[].advanced_statistics.is_mvp` is `null`, and `games[].players[].metric_availability.mvp.status` is `unsupported`.

### Stable player identity

| JSON path | Type | Meaning |
|---|---:|---|
| `games[].players[].platform` | string | Header platform, or decoded network account platform when the header is incomplete. |
| `games[].players[].platform_user_id` | string or null | Stable replay account identifier; never an actor ID. |
| `games[].players[].identity_status` | string | `stable_id_available` or `manual_mapping_required`. |
| `games[].players[].identity_source` | `"header"`, `"network_unique_id"`, or null | Where the stable ID was resolved. |

Network actor IDs are lifecycle-scoped. The implementation records creation, deletion, generation reuse, respawn car-to-PRI links, team membership, and every PRI generation that resolves to the same stable replay account.

Header identity supports string `OnlineID` and nested `PlayerStats[].PlayerID.fields.EpicAccountId`/`Uid`. Unsafe numeric IDs remain unresolved rather than being converted after precision loss. Stable joins require platform plus account ID. Older header recovery requires a unique network account corroborated by name, observed team, and platform; display name alone is insufficient. Contradictory IDs and duplicate accounts are not merged. `required_review.unresolved_player_count` counts unresolved rows without deduplicating names.

Unassigned header entries remain in `players[]`, with `team_color: null`; only Team 0/1 map to blue/orange. Added per-player participation metadata:

| JSON path under `games[].players[]` | Type | Meaning |
|---|---|---|
| `participation.header_team_index` | integer or null | Exact header Team value, including -1. |
| `participation.status` | `car_observed`, `no_car_observed`, `unknown` | Car-to-account evidence in the decoded recording; not a guessed spectator label. |
| `participation.team_assignment_observed` | boolean or null | Whether any matched PRI generation has a team assignment. |
| `participation.network_pri_generations` | integer or null | Number of matched PRI lifecycles. |
| `participation.car_actor_generations` | integer or null | Distinct linked car lifecycles. |

Keep unassigned/unresolved rows available for explicit review. Do not automatically map the seventh row to orange, discard it because its score is zero, or commit it as an extra competitive player.

### Demolitions

| JSON path | Type | Units/definition |
|---|---:|---|
| `games[].players[].advanced_statistics.demolitions_inflicted` | integer or null | Count of unique active-gameplay demolition events attributed to the player as attacker. |
| `games[].players[].advanced_statistics.demolitions_taken` | integer or null | Count of unique active-gameplay demolition events attributed to the player as victim. |
| `games[].players[].metric_availability.demolitions.status` | `verified` or `unavailable` | Per-player availability. |
| `games[].advanced_metrics.diagnostics.demolition_events_counted` | integer or null | Unique events used when attribution is complete. |
| `games[].advanced_metrics.diagnostics.repeated_demolition_updates_ignored` | integer | Repeated replicated updates suppressed by victim car generation. |
| `games[].advanced_metrics.diagnostics.non_gameplay_demolition_updates_ignored` | integer | Updates outside the `Active` game state, including goal-replay sequences. |

If any gameplay demo cannot be attributed to both stable identities, all demo totals for that game remain `null`. This prevents a partial total from looking complete. Self-demolition events are withheld and warned rather than assigned to the wrong player.

If observed game-recorded `MatchDemolishes`/`MatchTimesDemolished` counters have an unexplained difference from attributed events, all official totals remain null with `DEMOLITION_COUNTER_MISMATCH`. Version `jwrlcs-demolitions-v3` distinguishes strictly corroborated post-goal counter scope: an ordinary unique `DemolishExtended` collision in `PostGoalScored`, with exact attacker/victim PRI attribution and both expected counter updates in that same frame, may explain a difference. Such a collision remains excluded from official Active-phase counts; `DEMOLITION_COUNTER_SCOPE_DIFFERENCE` and the optional `diagnostics.recorded_demo_counter_scope_differences` / `post_goal_counter_evidence` arrays preserve the evidence. Missing or delayed counter proof, goal explosions, self-demolitions, and replay playback never qualify. Unused unassigned header rows do not block fully covered network participants; ambiguous car-owner identities still do. `ps4` headers compare canonically with network `PlayStation`, without rewriting legacy response platform/account fields. Missing counter fields are not interpreted as zero. `diagnostics.demolition_events_detected` remains a diagnostic candidate count, and `diagnostics.recorded_demo_counter_mismatches[]` reports `replay_player_name`, `metric`, `recorded_counter`, and `attributed_gameplay_events`. Counters are not substituted for event counts. Accounts with no observed car also have null demos instead of fabricated zeroes.

### Timing

| JSON path | Type | Units/definition |
|---|---:|---|
| `games[].timing.overtime` | boolean or null | `true` when the network overtime attribute is observed; `false` only when regulation/no-OT is positively established; otherwise null. |
| `games[].timing.overtime_seconds` | integer or null | Final observed overtime game-clock second, returned only with an accepted terminal boundary. `0` only when no overtime is verified; null when unknown/incomplete. Clock precision is one second. |
| `games[].timing.regulation_clock_seconds` | integer or null | Maximum observed regulation clock value, normally 300; not actual play elapsed. |
| `games[].timing.game_clock_seconds` | integer or null | Regulation clock plus overtime clock when overtime status is known. |
| `games[].timing.playing_duration_seconds` | number or null | Currently always null: phase intervals are not independently validated as actual physical playing duration. |
| `games[].timing.zero_second_play_seconds` | number or null | Currently always null: sampled zero-clock-to-state-transition duration is diagnostic only. |
| `games[].timing.pause_seconds` | number or null | Currently always null: the stop-countdown signal does not establish complete pause coverage. |
| `games[].timing.ended_by` | string | `regulation`, `regulation_clock_expired`, `overtime_goal`, `forfeit`, `incomplete`, or `unknown`. |
| `games[].timing.clock_precision_seconds` | number | `1`. |
| `games[].timing.playing_duration_precision_seconds` | number | `0.001`; this is output rounding, while replay frame sampling remains the real measurement limit. |
| `games[].timing.metric_version` | string | `jwrlcs-timing-v3`. |

The service never uses total replay timeline length as playing duration. An absent overtime attribute is not proof of regulation, even if the scoreboard header is decisive and a zero-clock sample exists. A forfeit or terminal state can establish how the game ended, but it does not establish an authoritative playing-duration definition. Countdown and goal-replay intervals are excluded from active-phase diagnostics; these diagnostics still include kickoff movement while the clock is stopped.

### Precise timing availability paths

Use the following full paths; do not infer availability from another metric or the summary status.

| Value path | Exact availability path |
|---|---|
| `games[].timing.overtime` | `games[].advanced_metrics.metric_availability.overtime.status` |
| `games[].timing.overtime_seconds` | `games[].advanced_metrics.metric_availability.overtime_seconds.status` |
| `games[].timing.regulation_clock_seconds` | `games[].advanced_metrics.metric_availability.regulation_clock_seconds.status` |
| `games[].timing.game_clock_seconds` | `games[].advanced_metrics.metric_availability.game_clock_seconds.status` |
| `games[].timing.playing_duration_seconds` | `games[].advanced_metrics.metric_availability.playing_duration_seconds.status` |
| `games[].timing.zero_second_play_seconds` | `games[].advanced_metrics.metric_availability.zero_second_play_seconds.status` |
| `games[].timing.pause_seconds` | `games[].advanced_metrics.metric_availability.pause_seconds.status` |
| `games[].timing.ended_by` | `games[].advanced_metrics.metric_availability.ended_by.status` |

The earlier keys `overtime_clock_duration` and `playing_duration` remain as availability aliases. Clock precision, output rounding precision, and metric version are metadata, not measured metrics. Availability is present in both decoded and fallback games.

`games[].advanced_metrics.diagnostics.timing` now includes `active_state_interval_seconds`, `active_intervals`, `zero_clock_transition_interval_seconds`, `stop_countdown_signal_interval_seconds`, and `diagnostic_only: true`. These are debugging evidence, not official statistics. Never store them as game duration or use them for per-five-minute statistics.

### Availability and warnings

| JSON path | Type | Meaning |
|---|---:|---|
| `games[].advanced_metrics.network_decode_status` | `success` or `unavailable` | Whether decoded frames were available. |
| `games[].advanced_metrics.validation_status` | `verified`, `partial`, or `unavailable` | Summary for required advanced metrics in this game only. |
| `games[].advanced_metrics.metric_availability.<metric>.status` | `verified`, `unavailable`, or `unsupported` | Exact status for the metric family. |
| `games[].advanced_metrics.metric_availability.<metric>.source` | string or null | Evidence source when available. |
| `games[].advanced_metrics.metric_availability.<metric>.metric_version` | string | Version of that definition. |
| `games[].advanced_metrics.metric_availability.<metric>.reason` | string or null | Why a value is not available. |
| `games[].warnings[]` | object[] | Machine-readable `code`, `severity`, `message`, and optional details. |

Network decoding failure returns valid basic scoreboard data when the header can still be parsed. Advanced fields remain null and a warning uses `ADVANCED_NETWORK_DECODE_FAILED` or `ADVANCED_NETWORK_UNAVAILABLE`.

## Implemented and verified

- Stable account identity recovery from header or network `UniqueId`.
- Actor creation/deletion/generation reuse, car respawns, PRI recreation, and team-change observation.
- Unique gameplay demolitions inflicted/taken with replicated-update deduplication.
- Goal-replay/non-active demo exclusion.
- Explicit overtime state and server clock duration.
- Active-phase interval diagnostics; actual playing duration, zero-second duration, and pause duration withheld pending semantic validation.
- Existing scores, goals, assists, saves, shots, final score, winner color, upload/authentication behavior, and valid `1 goal / 0 shots` behavior.

## Deferred metrics and exact missing work

| Family | Output behavior | Work still required |
|---|---|---|
| Boost | All boost fields remain null; status `unsupported`. | Validate boost-byte scaling for supported replay versions, integrate per-car values over time, classify large/small pads, and define stolen boost against pad ownership/team state. |
| Movement | All movement fields remain null. | Sample rigid-body velocity without double-counting replicated frames; validate supersonic threshold, wheel/ground state, air state, and powerslide input/state. |
| Positioning/distances | All fields remain null. | Synchronize ball/car trajectories, normalize field orientation by team, define zones, and validate distance sampling through respawns/stoppages. |
| Possession/touches/clears/centers/aerials | All fields remain null. | Build and validate player-attributed ball-touch events. Available stat-event names alone are insufficient because verified fixtures do not reliably attribute them to players. |
| Epic saves | Null. | Obtain reliable player attribution; the scoreboard save count cannot identify epic saves. |
| Passes/interceptions | Null. | Define and validate multi-touch sequences, possession changes, opponent interruption, and time/distance thresholds. |
| Bumps | Null. | Identify and validate non-demolition collision events and attacker/victim identity. Demolition events are not used as a bump approximation. |
| Kickoffs/challenges | Null. | Detect kickoff phases and contested-ball interactions, then validate winner definitions against labeled fixtures. |
| MVP | `advanced_statistics.is_mvp` is null. | Locate an authoritative MVP award field in supported replay formats. Highest score is explicitly not accepted. |

## Verification evidence and limits

The retained seven-game series uses replay build `240618.64094.453196`, replay version `8`, major/minor/net `868/32/10`. All seven decoded, all 42 player identities resolved, and every game's demo totals balanced (`sum inflicted = sum taken`). The overtime fixture contains an explicit overtime flag and a terminal observed clock of 36 seconds. The earlier 347.772-second playing-duration claim is withdrawn; that value survives only as an active-state interval diagnostic. The six other fixtures no longer infer `overtime: false` from an absent flag and decisive header when no terminal attribute is observed.

No retained real fixture contains a verified pause or forfeit terminal. Pause/forfeit diagnostic exclusion, missing network data, incomplete terminal data, repeated demo updates, respawn, actor-ID reuse, and team-change behavior are covered by synthetic regression tests.

The Eclipse–Aspect fixture reports build `261001.2867.529371`, replay version `8`, major/minor/net `868/34/12`. Updated boxcars 0.12.0 decodes all 8,176 frames in strict mode. All seven account IDs resolve, six have cars, and all five-stat rows plus final 2–7 score are unchanged. The unassigned `ttvCupboard` entry is retained with null team and demo values. Nine attributed event candidates disagree with recorded counters indicating ten (Lebyrinnn inflicted 2 vs counter 3; Heynamesjr taken 1 vs counter 2), so **every official demo total remains null** with the mismatch warning. This discrepancy is closed as unresolved due to missing evidence; do not reopen the interval without new evidence. Overtime and physical durations remain null. It does not block available metrics from another replay.

The new `B5C5C4D211F1C1FBE09ECBA5A4E06F15.replay` uses the same current build/protocol and decodes all 7,281 frames. All seven IDs resolve; six accounts participate and the unassigned Lebyrinnn row remains null. The six participant demo counts total 11 inflicted/11 taken, with every available player counter agreeing. There are 2 repeated updates, 8 non-gameplay exclusions, no unresolved gameplay endpoint, and no counter mismatch. Three timestamp jumps occur in stopped-clock post-goal/replay transitions. zev's taken counter is absent; its event-derived zero is not falsely described as a recorded-counter zero. These are internal-consistency checks; `independent_reference_status` remains `not_compared`. Overtime and unsupported timing/scouting remain null. A mixed-format regression verifies per-game isolation.

## Supabase import/storage handoff

The full per-game object must continue to be stored unchanged in `replay_imports.parsed_payload.parser_result`; this preserves replay-format, availability, diagnostics, and future reprocessing evidence.

For the normalized import:

1. Keep mapping the five existing fields from `players[].statistics` exactly as today.
2. Add nullable, nonnegative integer columns for `player_game_statistics.demolitions_inflicted` and `player_game_statistics.demolitions_taken`.
3. Populate both demo columns only when both `player.metric_availability.demolitions.status` and `game.advanced_metrics.metric_availability.demolitions.status` are `verified`; otherwise store null.
4. Store `games.duration_seconds` only from non-null `timing.playing_duration_seconds` (rounding only if the column remains integer). Never use replay timeline length or `timing.game_clock_seconds` as actual duration.
5. Add a nullable `games.is_overtime` (or equivalent typed field) and store `timing.overtime` without coercion.
6. Make the current `games.overtime_seconds` nullable and remove its zero default before importing 0.3.0. Store null when timing is unknown, `0` only for verified regulation, and the integer clock duration for verified overtime.
7. Do not populate the database MVP flag from player score. The parser's authoritative MVP value is unavailable.
8. Preserve all warning and availability objects inside the existing replay-import metadata. Do not add a service-role credential to GHL or browser code.

Preserve the full parser_result in the existing private/admin replay-import JSON location. Only reviewed mapped participants become normalized competitive rows; stable account IDs and no-car review entries must not be copied into public statistic responses. New nullable columns/import mappings above are a future backend task; this bundle does not imply those database fields are deployed. Keep the existing five-stat import working until that separate backend change is authorized. Never feed diagnostic active interval time into duration_seconds or a per-five-minute denominator.

These schema/import changes are not included or deployed by the parser upgrade.

## GHL mapping handoff

- Continue uploading and authenticating exactly as with 0.2.0.
- Accept `0.3.0` while retaining the five existing `statistics` reads.
- Show advanced values only when the corresponding availability status is `verified`.
- Render null as `Unavailable`/`—`, never `0`.
- Surface game warning codes next to the affected game.
- Do not infer series-wide availability; inspect every game.
- Keep administrator review/mapping before calling `import_replay_series`.
- Accept nullable `team_color` and the participation metadata. Keep the unassigned row in review until an administrator decides its participation; never silently remove it or commit it as an orange player.
- Surface `DEMOLITION_COUNTER_MISMATCH`; do not use diagnostic candidate counts as official totals. Availability `verified` means extraction validation, while `independent_reference_status` states whether external accuracy comparison exists.

## Actual retained-fixture excerpt

From `8A4F11A94D99212BF503C9A034869234.replay` (account identifiers omitted):

```json
{
  "contract_version": "0.3.0",
  "game": {
    "final_score": { "blue": 3, "orange": 2 },
    "winner_color": "blue",
    "replay_format": {
      "major_version": 868,
      "minor_version": 32,
      "net_version": 10,
      "build_version": "240618.64094.453196",
      "replay_version": 8
    },
    "timing": {
      "overtime": true,
      "overtime_seconds": 36,
      "regulation_clock_seconds": 300,
      "game_clock_seconds": 336,
      "playing_duration_seconds": null,
      "zero_second_play_seconds": null,
      "pause_seconds": null,
      "ended_by": "overtime_goal"
    },
    "demolition_diagnostics": {
      "demolition_events_counted": 3,
      "repeated_demolition_updates_ignored": 1,
      "non_gameplay_demolition_updates_ignored": 1,
      "unresolved_demolition_events": 0
    },
    "player_demo_totals": {
      "Lobo": [0, 0],
      "schmeater meister": [0, 0],
      "Estach.": [1, 0],
      "Carter.": [0, 1],
      "The 1st PROGRAM": [1, 1],
      "DCXD.": [1, 1]
    }
  }
}
```

Each array is `[demolitions_inflicted, demolitions_taken]`.

See `VALIDATION_REPORT.md` for the new current-build evidence, closed ambiguity disposition, and timing limitations, and `DEPLOYMENT.md` for the existing Render-service deployment procedure. No database migration or frontend change is part of this bundle.

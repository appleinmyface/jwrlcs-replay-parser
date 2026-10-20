# Overtime extension validation

Baseline: deployed commit `9541ed3b26f34b2945a3d9a3a62787370bba9db4`.
Source-only update; no production deployment, schema changes, imports, or UI changes.

- Full suite: **66 passed, 0 failed, 0 skipped**, with all retained fixture environment variables set.
- Real fixture account assertions use exact-account SHA-256 checks where newly added to the public test source; synthetic identity cases use synthetic account strings. Retained replays remain private.
- TypeScript: `npm exec --yes --package typescript@5.9.3 -- tsc --strict --noEmit --lib es2022 docs/replay-parser-0.3.0.d.ts` exited 0. No dependency or lockfile changes were made.
- Differential comparison against the deployed implementation: **13 real replays passed** for all five scoreboard values, stable player identities, participation, final scores, demolition values, demolition availability, and demolition diagnostics.
- The four Eternity–Byproduct Active-phase demolition totals remain **6 / 6 / 6 / 5**. Their unassigned rows remain null; Game 2's captured post-goal collision stays excluded.
- B5 remains 11 internally corroborated demos. The closed Eclipse–Aspect mismatch remains unavailable with its warning. No discrepancy interval was reinvestigated.

The existing forfeit unit test was deliberately tightened: a forfeit without an explicit OT flag now leaves overtime unknown rather than claiming regulation. The forfeit terminal signal remains independently available as `ended_by: forfeit`.

## Recorded overtime example

Fixture `8A4F11A94D99212BF503C9A034869234.replay`, SHA-256:
`685aaca8b8f390075dba4908e155a44edfc4157a9feec5be1d3f8f0ae089a9f4`.

- Build `240618.64094.453196`, replay major/minor/network `868 / 32 / 10`.
- First explicit OT flag: frame **10260**, replay **392.760740 s**.
- Winning goal: frame **11494**, replay **434.054960 s**, blue **2–2 → 3–2**.
- Credited player: **The 1st PROGRAM**, resolved from PRI generation **25:1**, stable UniqueId, the goal tally at that frame, and the corresponding goal record.
- OT game-clock sample: **36 s**; arithmetic clock reference **336 s**.
- Six observed participants: credited player OT goals **1**, other five **0**.
- Physical playing duration, zero-second duration, pause duration, and physical own-goal classification remain null.

This is recorded-signal reconciliation, **not independent visual verification**.
`independent_reference_status` remains `not_compared`. Test expected values were
transcribed from literal raw records, not generated from the production normalizer.

## Synthetic coverage and limits

Signal-level tests cover normal regulation, a 0:00 regulation goal, regulation/OT
pauses, frozen clocks, missing flags, delayed/missing/ambiguous scorer data,
possible own-goal attribution, duplicate updates, actor-ID reuse, changed accounts,
recording gaps, clock jumps, conflicting terminal winner, and OT failure isolation.
An edited copy of the retained OT replay separately proves missing-counter and
missing-flag withholding. Edited replays and synthetic frames are not independent
real-match labels.

No independently labeled real normal-regulation ending, zero-second regulation
goal, regulation pause, OT pause, or ambiguous/physical-own-goal scorer fixture was
available. The exact additional replay/label requirements are listed in
OVERTIME_INTEGRATION.md. An absent-flag fallback remains disabled. All current-build
retained games lacking explicit OT evidence remain null, without affecting their
verified demolition values. No claim of comprehensive current-build OT accuracy
or real technical-pause duration support is made.

## Scope preserved

Authentication, upload/CORS settings, HTTP routes, package dependencies, WASM,
normalization of the original five statistics, raw header entries, and stable
identity output are unchanged. The only runtime files changed/added are
`src/advanced.mjs` and `src/overtime.mjs`. Both are required together.

All tests ran locally against retained files or synthetic data. No Supabase write,
league import, frontend change, Render deployment, or change to main was performed.

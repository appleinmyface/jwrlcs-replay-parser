# NBD–Swoll Game 5 demolition attribution

`3E0B5B5411F1DCB9595354A660D4B411.replay` (title `NBD Swoll 5`) has SHA-256
`5221fd68d4ca334e3799b760d257ecbbf285e47a586d7c55464c3f5639b35009`.
All 7,824 frames decode and all six scoreboard accounts resolve. The v5
classifier nevertheless reports one unresolved event and nulls all demos.

At frame 2,573, replay time 143.96939, ForTrees.' car `69:2` detaches
from PRI `18:1`, which simultaneously leaves team `3:1` and advances its
`SelfDemolitions` counter from unobserved to 1. The removal has no attacker,
attacker PRI, self-demo actor, or goal-explosion owner. No ordinary taken
counter updates. The same car generation is deleted at 148.94528 without
a rebind or conflicting demolition. The victim's finite velocity
`(-4.24, 8.55, -0.17)` caused v5's stationary-car requirement to reject
this otherwise corroborated removal.

Revision `jwrlcs-demolitions-v6` accepts finite victim velocity for that
existing narrow classifier. The attacker velocity must still be zero,
all detachment/counter/deletion evidence is still required, and malformed
vectors, unknown attackers, conflicting events, actor reuse, and unexplained
competitive counter differences retain their existing safeguards. Raw
evidence and account identifiers are unchanged. API contract remains 0.3.0.

Game 5 has nine detected candidates: eight attributed competitive demos and
one excluded removal. The derived inflicted/taken pairs are:

| Player | Inflicted | Taken |
| --- | ---: | ---: |
| NBDxJxyden | 1 | 2 |
| NBDxGrxnding | 0 | 2 |
| Q_tty | 1 | 2 |
| ForTrees. | 1 | 0 |
| j. | 3 | 2 |
| Trizzyyyyy. | 2 | 0 |

These are event-derived values checked against available recorded counters,
not an independent video recount. ForTrees.' taken counter is absent;
event-derived zero is not a recorded-counter zero. The first four games
remain at 5, 7, 3, and 4 demos with their scoreboards unchanged. The prior
Catalyst–Wheaties fixtures retain counts 5, 7, 2, 4, and 8 and both previously
validated exclusions.

Run `npm test` with `NBD_SWOLL_REPLAY_DIR` and
`CATALYST_WHEATIES_REPLAY_DIR` set to the supplied replay directories to
exercise both full-series paths. Without binary fixtures, the synthetic
moving/stationary removal, malformed-vector, attribution, and counter
regressions still run. Parsing does not import or publish league results.

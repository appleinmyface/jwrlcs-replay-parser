// Explicit-state OT extraction. No clock/duration/score-only fallback exists.
// "verified" means the recorded signals reconcile, not independent video review.
export const OVERTIME_METRIC_VERSION = "jwrlcs-overtime-v1";
export const TIMING_METRIC_VERSION = "jwrlcs-timing-v3";

const GE = "TAGame.GameEvent_Soccar_TA:";
const STATE = "TAGame.GameEvent_TA:ReplicatedStateName";
const LIVE_OR_START = new Set(["Active", "Countdown"]);
const TERMINAL = new Set(["Finished", "MatchEnded"]);
const MAX_CONTINUOUS_FRAME_SECONDS = 0.25;
const MAX_CLOCK_SAMPLE_AGE_SECONDS = 1.25;
const nni = (n) => Number.isInteger(n) && n >= 0;
const round = (n) => Math.round(n * 1000) / 1000;
const opposite = (color) => color === "blue" ? "orange" : "blue";
const color = (index) => index === 0 ? "blue" : index === 1 ? "orange" : null;
const decisive = (s) => nni(s.blue) && nni(s.orange) && s.blue !== s.orange;
const scoreEqual = (a, b) => a.blue === b.blue && a.orange === b.orange;
const message = (code, text, details = {}) => ({ code, severity: "warning", message: text, ...details });

function availability(available, source, reason, extra = {}) {
  return {
    status: available ? "verified" : "unavailable",
    source: available ? source : null,
    metric_version: OVERTIME_METRIC_VERSION,
    reason: available ? null : reason,
    validation_scope: "explicit_signal_and_reconciled_game_records",
    independent_reference_status: "not_compared",
    ...extra,
  };
}

export function unavailableOvertime(reason) {
  return {
    value: {
      overtime: null, overtime_seconds: null, overtime_winner_color: null,
      overtime_goal: null, regulation_clock_seconds: null, game_clock_seconds: null,
      ended_by: "unknown", metric_version: TIMING_METRIC_VERSION,
    },
    availability: Object.fromEntries([
      "overtime", "overtime_seconds", "overtime_clock_duration", "overtime_winner_color",
      "overtime_goal", "overtime_goal_scorer", "overtime_goal_clock_seconds", "regulation_clock_seconds", "game_clock_seconds", "ended_by",
    ].map((key) => [key, availability(false, null, reason)])),
  };
}

export function createOvertimeAnalyzer(decoded, { teamColorFromActor, uniqueIdentity }) {
  let phase = null;
  let paused = false;
  let otFlag = null;
  let observedLiveOvertime = false;
  let gameEventKey = null;
  let mixedGameEvents = false;
  let previousFrame = null;
  let lastActiveFrame = -1;
  let clock = null;
  let forfeit = false;
  let explicitEnd = false;
  let firstPhase = null;
  let lastFalseSignal = null;
  const scores = { blue: null, orange: null };
  const counters = new Map();
  const identityKeys = new Map();
  const changedIdentities = new Set();
  const signals = [];
  const clockSamples = [];
  const phaseTransitions = [];
  const gaps = [];
  const pauseSignals = [];
  const goalCandidates = [];
  const terminalSignals = [];
  const scoreChanges = [];
  const counterChanges = [];
  const terminalFrames = [];
  let anyPause = false;
  let nonMonotonicTime = false;
  let conflictingFrame = false;

  function processFrame(frame, frameIndex, registry) {
    const phaseBefore = phase;
    const pausedBefore = paused;
    const otBefore = otFlag;
    const beforeScores = { ...scores };
    const updates = (frame.updated_actors ?? []).map((u) => ({
      ...u, property: decoded.objects?.[u.object_id] ?? "",
    }));
    const states = updates.filter((u) => u.property === STATE && Number.isInteger(u.attribute?.Int));
    const stateNames = [...new Set(states.map((u) => decoded.names?.[u.attribute.Int] ?? `UnknownState:${u.attribute.Int}`))];
    if (stateNames.length > 1) conflictingFrame = true;
    if (stateNames.length) phase = stateNames.at(-1);
    if (firstPhase === null && phase !== null) firstPhase = phase;
    if (phaseBefore !== phase) phaseTransitions.push({ frame: frameIndex, replay_seconds: frame.time, before: phaseBefore, after: phase });

    const dt = previousFrame === null ? 0 : frame.time - previousFrame.time;
    if (!Number.isFinite(frame.time) || dt < 0) nonMonotonicTime = true;
    const boundaryGap = previousFrame !== null && dt > MAX_CONTINUOUS_FRAME_SECONDS;
    if (boundaryGap && (LIVE_OR_START.has(phaseBefore) || LIVE_OR_START.has(phase))) {
      gaps.push({ before_frame: frameIndex - 1, after_frame: frameIndex,
        start_replay_seconds: previousFrame.time, end_replay_seconds: frame.time,
        phase_before: phaseBefore, phase_after: phase });
    }

    for (const u of updates) {
      // A second game-event actor/epoch cannot be mixed into the first match.
      if (u.property === STATE || u.property.startsWith(GE)
        || u.property === "TAGame.GameEvent_Team_TA:bForfeit") {
        const key = registry.current(u.actor_id)?.key ?? `${u.actor_id}:unregistered`;
        if (gameEventKey !== null && gameEventKey !== key) mixedGameEvents = true;
        gameEventKey ??= key;
      }
      if (u.property === "Engine.PlayerReplicationInfo:UniqueId") {
        const actor = registry.current(u.actor_id);
        const key = uniqueIdentity(u.attribute?.UniqueId)?.stable_key;
        if (actor && key) {
          if (identityKeys.has(actor.key) && identityKeys.get(actor.key) !== key) changedIdentities.add(actor.key);
          identityKeys.set(actor.key, key);
        }
      }
      if (u.property === "Engine.GameReplicationInfo:bStopCountDown" && typeof u.attribute?.Boolean === "boolean") {
        paused = u.attribute.Boolean;
        anyPause ||= paused;
        pauseSignals.push({ frame: frameIndex, replay_seconds: frame.time, value: paused, phase });
      }
      if (u.property === GE + "bOverTime" && typeof u.attribute?.Boolean === "boolean") {
        otFlag = u.attribute.Boolean;
        const item = { frame: frameIndex, replay_seconds: frame.time, value: otFlag,
          actor_key: registry.current(u.actor_id)?.key ?? `${u.actor_id}:unregistered`, phase };
        signals.push(item);
        if (!otFlag) lastFalseSignal = item;
      }
      if (u.property === GE + "bMatchEnded" && u.attribute?.Boolean === true) {
        explicitEnd = true;
        terminalFrames.push(frameIndex);
        terminalSignals.push({ frame: frameIndex, replay_seconds: frame.time, property: u.property, attribute: u.attribute });
      }
      if (u.property === "TAGame.GameEvent_Team_TA:bForfeit" && u.attribute?.Boolean === true) {
        forfeit = true;
        terminalFrames.push(frameIndex);
        terminalSignals.push({ frame: frameIndex, replay_seconds: frame.time, property: u.property, attribute: u.attribute });
      }
      if ([GE + "GameWinner", GE + "MatchWinner", "Engine.GameReplicationInfo:Winner", GE + "bFullMatchWinnerDecided"].includes(u.property)) {
        const reference = u.attribute?.ActiveActor;
        const target = reference?.active ? registry.current(reference.actor) : null;
        const resolvedTeam = teamColorFromActor(target)
          ?? teamColorFromActor(registry.histories.get(target?.teamActorKey));
        terminalSignals.push({ frame: frameIndex, replay_seconds: frame.time, property: u.property,
          attribute: u.attribute, resolved_team_color: resolvedTeam });
      }
      if (u.property === "Engine.TeamInfo:Score" && nni(u.attribute?.Int)) {
        const team = teamColorFromActor(registry.current(u.actor_id));
        if (team) {
          if (scores[team] !== u.attribute.Int) scoreChanges.push({ frame: frameIndex, replay_seconds: frame.time,
            team_color: team, before: scores[team], after: u.attribute.Int });
          scores[team] = u.attribute.Int;
        }
      }
    }
    if (TERMINAL.has(phase) && phaseBefore !== phase) terminalFrames.push(frameIndex);
    if (otFlag === true && !paused && (LIVE_OR_START.has(phase)
      || phaseBefore === "Active" && phase === "PostGoalScored")) observedLiveOvertime = true;
    if (phase === "Active" && !paused) lastActiveFrame = frameIndex;

    for (const u of updates) {
      if (u.property === GE + "SecondsRemaining" && nni(u.attribute?.Int)) {
        clock = { frame: frameIndex, replay_seconds: frame.time, value: u.attribute.Int,
          overtime_flag: otFlag, phase, paused };
        clockSamples.push(clock);
      }
    }

    const frameCounterChanges = [];
    for (const u of updates) {
      if (u.property !== "TAGame.PRI_TA:MatchGoals" || !nni(u.attribute?.Int)) continue;
      const actor = registry.current(u.actor_id);
      if (!actor || !/PRI_TA/.test(actor.objectName)) continue;
      const before = counters.get(actor.key) ?? null;
      const after = u.attribute.Int;
      counters.set(actor.key, after);
      if (before === after) continue;
      const identity = actor.identity ? { ...actor.identity } : null;
      const row = { frame: frameIndex, replay_seconds: frame.time, pri_actor_key: actor.key,
        actor_created_at: actor.createdAt, replay_name: actor.playerName, identity,
        team_color: teamColorFromActor(registry.histories.get(actor.teamActorKey)),
        observed_car: actor.carGenerations.size > 0, before, after };
      counterChanges.push(row);
      frameCounterChanges.push(row);
    }

    // Only the live -> post-goal boundary is a candidate. Repeated counters,
    // repeated scored-on flags and ReplayPlayback cannot create a second goal.
    if (phaseBefore === "Active" && phase === "PostGoalScored") {
      const scoredOn = [...new Set(updates.filter((u) => u.property === GE + "ReplicatedScoredOnTeam"
        && [0, 1].includes(u.attribute?.Byte)).map((u) => u.attribute.Byte))];
      goalCandidates.push({ frame: frameIndex, replay_seconds: frame.time, phase_before: phaseBefore, phase_after: phase,
        overtime_flag_before: otBefore, overtime_flag_after: otFlag,
        paused: pausedBefore || paused, boundary_gap: boundaryGap,
        score_before: beforeScores, score_after: { ...scores },
        scored_on_team: scoredOn.length === 1 ? color(scoredOn[0]) : null,
        clock: clock ? { ...clock } : null, counter_changes: frameCounterChanges });
    }
    previousFrame = { time: frame.time, phase, frame: frameIndex };
  }

  function finish(reviewPlayers) {
    const warnings = [];
    const header = decoded.properties ?? {};
    const headerScore = { blue: header.Team0Score, orange: header.Team1Score };
    const frames = decoded.network_frames?.frames ?? [];
    const fullDecodedRecording = nni(header.NumFrames) && header.NumFrames === frames.length;
    const rawGoals = Array.isArray(header.Goals) ? header.Goals : [];
    const goals = [...new Map(rawGoals.filter((g) => nni(g?.frame)).map((g) => [
      `${g.frame}:${g.PlayerTeam}:${g.PlayerName}`, { ...g },
    ])).values()];
    const coherentStream = !mixedGameEvents && !nonMonotonicTime && !conflictingFrame;
    const clockBeforeOvertime = clockSamples.filter((s) => s.overtime_flag !== true);
    const regulationMaximum = clockBeforeOvertime.length ? Math.max(...clockBeforeOvertime.map((s) => s.value)) : null;
    const terminalFrame = terminalFrames.at(-1);
    const terminal = terminalFrame === undefined ? null : frames[terminalFrame];
    const earlyFalse = signals.some((s) => s.value === false && s.frame <= (clockSamples.find((s) => s.value === 0)?.frame ?? Infinity));
    // False requires an explicit negative signal and continuous beginning-to-
    // terminal evidence. A winner, zero clock, decisive score, or forfeit alone
    // is never sufficient. No absent-flag inference is enabled.
    const completeRegulation = coherentStream && fullDecodedRecording && !observedLiveOvertime
      && !signals.some((s) => s.value === true)
      && earlyFalse && lastFalseSignal !== null && terminal !== null
      && terminal.time - lastFalseSignal.replay_seconds >= 0
      && terminal.time - lastFalseSignal.replay_seconds <= MAX_CLOCK_SAMPLE_AGE_SECONDS
      && ["Countdown", "WaitingForPlayers"].includes(firstPhase)
      && clockBeforeOvertime.some((s) => s.value > 0 && LIVE_OR_START.has(s.phase))
      && (clockBeforeOvertime.some((s) => s.value === 0) || forfeit)
      && gaps.length === 0 && decisive(headerScore) && scoreEqual(scores, headerScore);
    const overtime = coherentStream && observedLiveOvertime ? true : completeRegulation ? false : null;
    const overtimeReason = !coherentStream ? "AMBIGUOUS_GAME_EVENT_STREAM: mixed game-event epochs, conflicting phases, or non-monotonic replay frames."
      : signals.length === 0 ? "MISSING_OVERTIME_FLAG: no explicit bOverTime sample; supply a complete replay with recorded OT state. Clock/score-only fallback is disabled pending independent labels."
        : "INCOMPLETE_OVERTIME_EVIDENCE: no live positive OT state or continuous explicitly negative regulation-to-terminal record.";
    if (overtime === null) warnings.push(message("OVERTIME_STATUS_UNVERIFIED", overtimeReason));

    const candidates = goalCandidates.filter((g) => g.overtime_flag_after === true);
    const evaluated = candidates.map((g) => {
      const blockers = [];
      const records = goals.filter((r) => r.frame === g.frame);
      const winner = decisive(g.score_after) ? g.score_after.blue > g.score_after.orange ? "blue" : "orange" : null;
      if (g.paused || g.boundary_gap) blockers.push("GOAL_BOUNDARY_PAUSED_OR_GAPPED");
      if (records.length !== 1) blockers.push("MISSING_OR_AMBIGUOUS_GOAL_RECORD");
      if (!winner || !nni(g.score_before.blue) || !nni(g.score_before.orange)
        || g.score_before.blue !== g.score_before.orange
        || g.score_after[winner] !== g.score_before[winner] + 1
        || g.score_after[opposite(winner)] !== g.score_before[opposite(winner)]) blockers.push("UNRECONCILED_TEAM_SCORE_CHANGE");
      if (winner && g.scored_on_team !== opposite(winner)) blockers.push("SCORED_ON_TEAM_DISAGREES");
      if (!scoreEqual(g.score_after, headerScore) || !scoreEqual(scores, headerScore)) blockers.push("FINAL_SCORE_DISAGREES");
      if (lastActiveFrame > g.frame || goals.some((r) => r.frame > g.frame)) blockers.push("LATER_LIVE_PLAY_OR_GOAL");
      if (forfeit) blockers.push("FORFEIT_NOT_A_VERIFIED_OVERTIME_GOAL");
      if (terminalSignals.some((s) => [GE + "GameWinner", "Engine.GameReplicationInfo:Winner"].includes(s.property)
        && s.frame >= g.frame && s.resolved_team_color !== null && s.resolved_team_color !== winner)) {
        blockers.push("TERMINAL_GAME_WINNER_DISAGREES");
      }
      return { ...g, scoring_team_color: winner, goal_record: records.length === 1 ? records[0] : null, blockers };
    });
    const winning = overtime === true && candidates.length === 1 && evaluated[0]?.blockers.length === 0 ? evaluated[0] : null;
    const winner = winning?.scoring_team_color ?? null;
    let scorer = null;
    let scorerReason = winning ? "NO_UNIQUE_CREDITED_SCORER: no uniquely attributable goal-counter change on the scoring team. An own goal, delayed counter, or missing attribution remains unresolved." : "NO_VERIFIED_OVERTIME_GOAL";
    let scorerEvidence = null;
    if (winning) {
      const possible = winning.counter_changes.filter((c) =>
        c.after === (c.before === null ? 1 : c.before + 1));
      const credited = possible.length === 1 && winning.counter_changes.every((c) =>
        c.before === null || c.after >= c.before) ? possible[0] : null;
      // The header name is a corroboration only. Identity always comes from
      // that exact counter's PRI generation and its UniqueId. A missing prior
      // tally remains null; first-positive 1 additionally requires a sole
      // corresponding goal record, not an invented prior counter of zero.
      const firstPositiveCorroborated = credited?.before !== null
        || goals.filter((g) => g.PlayerName === credited?.replay_name
          && color(g.PlayerTeam) === credited?.team_color).length === 1;
      if (credited && credited.identity && credited.observed_car
        && credited.actor_created_at < winning.replay_seconds
        && !changedIdentities.has(credited.pri_actor_key)
        && credited.team_color === winner
        && color(winning.goal_record.PlayerTeam) === winner
        && winning.goal_record.PlayerName === credited.replay_name && firstPositiveCorroborated) {
        const mapped = reviewPlayers.filter((p) => p.stable_key === credited.identity.stable_key && p.participating);
        if (mapped.length === 1) {
          scorer = { platform: mapped[0].platform, platform_user_id: mapped[0].platform_user_id,
            replay_name: mapped[0].replay_name };
          scorerEvidence = credited;
        } else scorerReason = "CREDITED_SCORER_REVIEW_MAPPING_AMBIGUOUS: the stable credited account must match exactly one participating review entry.";
      }
      if (scorer === null) warnings.push(message("OVERTIME_SCORER_UNVERIFIED", scorerReason, { goal_frame: winning.frame }));
    } else if (overtime === true) warnings.push(message("OVERTIME_WINNER_UNVERIFIED", "OT is explicit, but a unique terminal goal, scoring-team change, and final result did not reconcile.", {
      goal_blockers: evaluated.map((g) => ({ frame: g.frame, blockers: g.blockers })),
    }));

    let overtimeSeconds = overtime === false ? 0 : null;
    let durationReason = "NO_VERIFIED_FINAL_OVERTIME_CLOCK: need an explicit OT start at zero and a fresh terminal game-clock sample.";
    const otClock = winning ? clockSamples.filter((s) => s.overtime_flag === true && s.frame <= winning.frame
      && LIVE_OR_START.has(s.phase) && !s.paused) : [];
    const firstTrue = signals.find((s) => s.value === true && LIVE_OR_START.has(s.phase));
    const startClock = firstTrue ? clockSamples.filter((s) => s.frame <= firstTrue.frame).at(-1) : null;
    const zeroAtStart = startClock?.value === 0 && !startClock.paused
      && firstTrue.replay_seconds - startClock.replay_seconds >= 0
      && firstTrue.replay_seconds - startClock.replay_seconds <= MAX_CLOCK_SAMPLE_AGE_SECONDS;
    const overtimeGaps = firstTrue && winning ? gaps.filter((g) =>
      g.after_frame >= firstTrue.frame && g.before_frame <= winning.frame) : gaps;
    const clockIsMonotonic = otClock.every((s, i) => i === 0 || s.value >= otClock[i - 1].value);
    const clockProgressionPlausible = otClock.every((s, i) => i === 0 ||
      s.value - otClock[i - 1].value <= s.replay_seconds - otClock[i - 1].replay_seconds + MAX_CLOCK_SAMPLE_AGE_SECONDS);
    const terminalClock = winning?.clock;
    if (anyPause) durationReason = "PAUSE_CLOCK_VALIDATION_REQUIRED: an explicit stop-countdown signal was observed; final OT duration awaits a labeled real pause fixture.";
    else if (overtimeGaps.length || !fullDecodedRecording) durationReason = "INCOMPLETE_CLOCK_COVERAGE: an OT-start/OT-play recording gap or incomplete decoded frame count prevents duration verification.";
    else if (!clockIsMonotonic) durationReason = "OVERTIME_CLOCK_REGRESSION: the OT clock regressed or reset.";
    else if (!clockProgressionPlausible) durationReason = "OVERTIME_CLOCK_JUMP: recorded OT ticks advanced faster than the continuous recording permits.";
    if (winning && fullDecodedRecording && !anyPause && overtimeGaps.length === 0 && zeroAtStart
      && otClock.length > 0 && clockIsMonotonic && clockProgressionPlausible && terminalClock?.overtime_flag === true
      && winning.replay_seconds - terminalClock.replay_seconds >= 0
      && winning.replay_seconds - terminalClock.replay_seconds <= MAX_CLOCK_SAMPLE_AGE_SECONDS
      && !terminalClock.paused) overtimeSeconds = terminalClock.value;
    if (overtime === true && overtimeSeconds === null) warnings.push(message("OVERTIME_DURATION_UNVERIFIED", durationReason));
    const goalClockAvailable = winning !== null && terminalClock?.overtime_flag === true
      && !terminalClock.paused && winning.replay_seconds - terminalClock.replay_seconds >= 0
      && winning.replay_seconds - terminalClock.replay_seconds <= MAX_CLOCK_SAMPLE_AGE_SECONDS;

    const endedBy = forfeit ? "forfeit" : winning ? "overtime_goal" : completeRegulation ? "regulation" : explicitEnd ? "unknown" : "incomplete";
    const byKey = new Map();
    for (const p of reviewPlayers) {
      if (!p.stable_key) continue;
      const unique = reviewPlayers.filter((r) => r.stable_key === p.stable_key).length === 1;
      const available = p.participating && unique && (overtime === false || scorer !== null);
      const value = available ? overtime === false ? 0
        : p.stable_key === scorerEvidence?.identity.stable_key ? 1 : 0 : null;
      byKey.set(p.stable_key, { value, availability: availability(available,
        overtime === false ? "explicitly_verified_regulation_game" : "reconciled_overtime_goal_and_stable_account",
        !p.participating ? "NO_OBSERVED_PARTICIPATING_CAR" : !unique ? "AMBIGUOUS_REVIEW_ACCOUNT"
          : overtime === null ? overtimeReason : scorerReason) });
    }
    const value = {
      overtime, overtime_seconds: overtimeSeconds, overtime_winner_color: winner,
      overtime_goal: winning ? {
        frame: winning.frame, replay_seconds: round(winning.replay_seconds),
        clock_seconds: goalClockAvailable ? terminalClock.value : null,
        scoring_team_color: winner, score_before: winning.score_before, score_after: winning.score_after,
        credited_scorer: scorer, own_goal: null,
        attribution_status: scorer ? "credited_player" : "unresolved",
      } : null,
      regulation_clock_seconds: regulationMaximum,
      game_clock_seconds: overtimeSeconds === null || regulationMaximum === null ? null : regulationMaximum + overtimeSeconds,
      ended_by: endedBy, metric_version: TIMING_METRIC_VERSION,
    };
    return {
      value, playerByKey: byKey, warnings,
      availability: {
        overtime: availability(overtime !== null, overtime ? "explicit_live_bOverTime" : "explicit_negative_and_complete_terminal_evidence", overtimeReason),
        overtime_winner_color: availability(winner !== null, "explicit_overtime_reconciled_goal_score_and_result", "NO_RECONCILED_OVERTIME_WINNING_GOAL"),
        overtime_goal: availability(winning !== null, "live_goal_boundary_network_team_scores_and_header_goal_record", "NO_RECONCILED_OVERTIME_WINNING_GOAL"),
        overtime_goal_scorer: availability(scorer !== null, "PRI_MatchGoals_UniqueId_and_corresponding_goal_record", scorerReason),
        overtime_goal_clock_seconds: availability(goalClockAvailable, "network_game_clock_at_goal", "NO_FRESH_GOAL_CLOCK_SAMPLE"),
        overtime_seconds: availability(overtimeSeconds !== null, overtime === false ? "explicitly_verified_regulation_game" : "network_overtime_clock", durationReason),
        overtime_clock_duration: availability(overtimeSeconds !== null, overtime === false ? "explicitly_verified_regulation_game" : "network_overtime_clock", durationReason),
        regulation_clock_seconds: availability(regulationMaximum !== null, "network_game_clock", "NO_REGULATION_CLOCK_SAMPLE", { definition: "Maximum observed pre-OT clock value, not elapsed physical playing time." }),
        game_clock_seconds: availability(value.game_clock_seconds !== null, "derived_clock_reference_sum", "UNAVAILABLE_REGULATION_OR_OVERTIME_CLOCK", { definition: "Arithmetic clock reference only; never a playing-duration denominator." }),
        ended_by: availability(forfeit || winning !== null || completeRegulation, "explicit_terminal_or_reconciled_overtime_goal", "NO_VERIFIED_TERMINAL_OUTCOME"),
      },
      diagnostics: {
        metric_version: OVERTIME_METRIC_VERSION, implicit_fallback_enabled: false,
        independent_reference_status: "not_compared", full_decoded_recording: fullDecodedRecording,
        explicit_overtime_signals: signals, phase_transitions: phaseTransitions,
        pause_signals: pauseSignals, recording_gaps: gaps, clock_samples: clockSamples,
        terminal_signals: terminalSignals, team_score_changes: scoreChanges,
        goal_counter_changes: counterChanges, header_goal_records: goals,
        overtime_goal_candidates: evaluated, credited_scorer_evidence: scorerEvidence,
        duplicate_header_goal_records_ignored: rawGoals.length - goals.length,
        changed_identity_pri_keys: [...changedIdentities],
        player_overtime_goals_verified: [...byKey.values()].filter((p) => p.availability.status === "verified").length,
      },
    };
  }
  return { processFrame, finish };
}

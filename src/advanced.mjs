import { createOvertimeAnalyzer, unavailableOvertime, TIMING_METRIC_VERSION, OVERTIME_METRIC_VERSION } from "./overtime.mjs";

const ACTIVE_STATE = "Active";
const KNOWN_NON_PLAYING_STATES = new Set([
  "Countdown",
  "PostGoalScored",
  "Finished",
  "MatchEnded",
  "PodiumSpotlight",
]);

export const SCOUTING_METRIC_VERSION = "jwrlcs-scouting-v1";
export const DEMOLITION_METRIC_VERSION = "jwrlcs-demolitions-v3";
export { TIMING_METRIC_VERSION, OVERTIME_METRIC_VERSION };

const DEFERRED_REASONS = {
  boost: "Requires validated boost-byte scaling, pad classification, and per-car state integration.",
  movement: "Requires validated trajectory sampling, surface state, and movement thresholds.",
  positioning: "Requires synchronized ball/car trajectories and documented field-zone definitions.",
  possession: "Requires a validated touch and possession-change model.",
  events: "Requires reliable player attribution and definitions for touches, clears, centers, aerial hits, and epic saves.",
  tactical: "Requires validated models for passes, interceptions, bumps, kickoffs, and challenges.",
};

function warning(code, message, details = {}) {
  return { code, severity: "warning", message, ...details };
}

function roundSeconds(value) {
  return Math.round(value * 1000) / 1000;
}

function normalizeName(value) {
  return String(value ?? "").trim().toLocaleLowerCase("en-US");
}

function normalizePlatform(value) {
  return String(value ?? "").trim().toLocaleLowerCase("en-US") || "unknown";
}

// Header OnlinePlatform_PS4 and network UniqueId.PlayStation represent the
// same platform. Compare canonically without rewriting legacy response IDs.
function matchingPlatform(value) {
  const platform = normalizePlatform(value);
  return platform === "ps4" ? "playstation" : platform;
}

function teamColorFromActor(actor) {
  if (!actor) return null;
  if (/\.Team0(?:$|[^0-9])/.test(actor.objectName)) return "blue";
  if (/\.Team1(?:$|[^0-9])/.test(actor.objectName)) return "orange";
  return null;
}

function uniqueIdentity(uniqueId) {
  const remoteId = uniqueId?.remote_id;
  if (!remoteId || typeof remoteId !== "object") return null;
  const entry = Object.entries(remoteId).find(([, value]) => value !== null && value !== undefined);
  if (!entry) return null;

  const [kind, rawValue] = entry;
  let value = rawValue;
  if (rawValue && typeof rawValue === "object") value = rawValue.online_id;
  if (value === null || value === undefined || String(value) === "0") return null;
  if (typeof value !== "string" && !Number.isSafeInteger(value)) return null;

  const platform = ({
    PlayStation: "playstation",
    PsyNet: "psynet",
    SplitScreen: "splitscreen",
    Steam: "steam",
    Switch: "switch",
    Xbox: "xbox",
    QQ: "qq",
    Epic: "epic",
  })[kind] ?? normalizePlatform(kind);

  return {
    platform,
    platform_user_id: String(value),
    stable_key: `${platform}:${String(value)}`,
  };
}

function emptyAdvancedStatistics() {
  return {
    demolitions_inflicted: null,
    demolitions_taken: null,
    overtime_goals: null,
    is_mvp: null,
    boost: {
      amount_collected: null,
      amount_consumed: null,
      amount_stolen: null,
      large_pads_collected: null,
      small_pads_collected: null,
      average_level: null,
      seconds_empty: null,
    },
    movement: {
      average_speed_uu_per_second: null,
      seconds_supersonic: null,
      seconds_ground: null,
      seconds_air: null,
      powerslide_count: null,
      powerslide_seconds: null,
    },
    positioning: {
      seconds_defensive_half: null,
      seconds_offensive_half: null,
      average_distance_to_ball_uu: null,
      average_distance_to_teammates_uu: null,
      possession_seconds: null,
    },
    events: {
      touches: null,
      clears: null,
      centers: null,
      epic_saves: null,
      aerial_hits: null,
      passes: null,
      interceptions: null,
      bumps_inflicted: null,
      bumps_taken: null,
      kickoff_wins: null,
      kickoff_losses: null,
      challenges_won: null,
      challenges_lost: null,
    },
  };
}

function deferredMetricAvailability() {
  return Object.fromEntries(Object.entries(DEFERRED_REASONS).map(([name, reason]) => [name, {
    status: "unsupported",
    source: null,
    metric_version: SCOUTING_METRIC_VERSION,
    reason,
  }]));
}

function createActorRegistry(objects) {
  const actors = new Map();
  const generationById = new Map();
  const histories = new Map();

  function register(newActor, time) {
    const existing = actors.get(newActor.actor_id);
    const sameGeneration = existing
      && !existing.deleted
      && existing.objectId === newActor.object_id;
    if (sameGeneration) return existing;

    const generation = (generationById.get(newActor.actor_id) ?? 0) + 1;
    generationById.set(newActor.actor_id, generation);
    const actor = {
      id: newActor.actor_id,
      generation,
      key: `${newActor.actor_id}:${generation}`,
      objectId: newActor.object_id,
      objectName: objects[newActor.object_id] ?? `#${newActor.object_id}`,
      createdAt: time,
      deleted: false,
      playerName: null,
      identity: null,
      teamActorKey: null,
      teamColors: new Set(),
      activePriActorKey: null,
      lastPriActorKey: null,
      carGenerations: new Set(),
      recordedDemosInflicted: null,
      recordedDemosTaken: null,
    };
    actors.set(newActor.actor_id, actor);
    histories.set(actor.key, actor);
    return actor;
  }

  function current(actorId) {
    const actor = actors.get(actorId);
    return actor && !actor.deleted ? actor : null;
  }

  function remove(actorId) {
    const actor = actors.get(actorId);
    if (actor) actor.deleted = true;
  }

  return { actors, histories, register, current, remove };
}

function activeActorId(value) {
  const actor = value?.ActiveActor;
  return actor?.active && Number.isInteger(actor.actor) && actor.actor >= 0
    ? actor.actor
    : null;
}

function demolitionActors(attribute) {
  if (attribute?.DemolishFx) {
    const event = attribute.DemolishFx;
    return {
      attacker: event.attacker_flag ? event.attacker : null,
      victim: event.victim_flag ? event.victim : null,
      selfDemolition: false,
      variant: "DemolishFx",
    };
  }
  if (attribute?.Demolish) {
    const event = attribute.Demolish;
    return {
      attacker: event.attacker_flag ? event.attacker : null,
      victim: event.victim_flag ? event.victim : null,
      selfDemolition: false,
      variant: "Demolish",
    };
  }
  if (attribute?.DemolishExtended) {
    const event = attribute.DemolishExtended;
    return {
      attacker: event.attacker?.active ? event.attacker.actor : null,
      victim: event.victim?.active ? event.victim.actor : null,
      selfDemolition: event.self_demolish === true,
      variant: "DemolishExtended",
    };
  }
  return null;
}

function createTimingAnalyzer(decoded) {
  let stateName = null;
  let activeStartedAt = null;
  let activeSeconds = 0;
  let paused = false;
  let pauseStartedAt = null;
  let pauseSeconds = 0;
  let pauseSignalObserved = false;
  let pauseSuspected = false;
  let lastClockFrameTime = null;
  let lastClockValue = null;
  let firstZeroAt = null;
  let zeroSecondEndedAt = null;
  let reachedZero = false;
  let overtimeObserved = false;
  let terminalClosedAt = null;
  const unknownStates = new Set();
  const stateHistory = [];
  const clockHistory = [];
  const activeIntervals = [];
  let activeStartClock = null;
  let firstBallHitAt = null;

  function closeActive(time) {
    if (activeStartedAt !== null) {
      activeSeconds += Math.max(0, time - activeStartedAt);
      activeIntervals.push({
        start_time: activeStartedAt,
        end_time: time,
        interval_seconds: roundSeconds(Math.max(0, time - activeStartedAt)),
        start_clock: activeStartClock,
        end_clock: clockHistory.at(-1)?.value ?? null,
        first_ball_hit_time: firstBallHitAt,
        before_first_touch_seconds: firstBallHitAt === null
          ? null : roundSeconds(Math.max(0, firstBallHitAt - activeStartedAt)),
      });
      activeStartedAt = null;
    }
    lastClockFrameTime = null;
    lastClockValue = null;
  }

  function openActive(time) {
    if (!paused && activeStartedAt === null) {
      activeStartedAt = time;
      activeStartClock = clockHistory.at(-1)?.value ?? null;
      firstBallHitAt = null;
    }
  }

  function transition(nextState, time) {
    if (nextState === stateName) return;
    if (stateName === ACTIVE_STATE) closeActive(time);
    if (reachedZero && zeroSecondEndedAt === null && stateName === ACTIVE_STATE) {
      zeroSecondEndedAt = time;
    }
    stateName = nextState;
    stateHistory.push({ state: nextState, time });
    if (nextState === ACTIVE_STATE) openActive(time);
    else if (!KNOWN_NON_PLAYING_STATES.has(nextState)) unknownStates.add(nextState);
  }

  function setPaused(nextPaused, time) {
    pauseSignalObserved = true;
    if (nextPaused === paused) return;
    paused = nextPaused;
    if (paused) {
      closeActive(time);
      pauseStartedAt = time;
    } else {
      if (pauseStartedAt !== null) pauseSeconds += Math.max(0, time - pauseStartedAt);
      pauseStartedAt = null;
      if (stateName === ACTIVE_STATE) openActive(time);
    }
  }

  function recordClock(value, time) {
    if (!Number.isInteger(value) || value < 0) return;
    clockHistory.push({ value, time, overtime: overtimeObserved });
    if (stateName === ACTIVE_STATE && !paused) {
      if (lastClockFrameTime !== null
          && time - lastClockFrameTime > 5
          && value === lastClockValue) {
        pauseSuspected = true;
      }
      lastClockFrameTime = time;
      lastClockValue = value;
    }
    if (value === 0) {
      reachedZero = true;
      if (firstZeroAt === null) firstZeroAt = time;
    }
  }

  function processUpdate(objectName, attribute, time) {
    if (objectName === "TAGame.GameEvent_TA:ReplicatedStateName"
        && Number.isInteger(attribute?.Int)) {
      transition(decoded.names?.[attribute.Int] ?? `UnknownState:${attribute.Int}`, time);
    } else if (objectName === "TAGame.GameEvent_Soccar_TA:SecondsRemaining") {
      recordClock(attribute?.Int, time);
    } else if (objectName === "TAGame.GameEvent_Soccar_TA:bOverTime"
        && attribute?.Boolean === true) {
      overtimeObserved = true;
    } else if (objectName === "TAGame.GameEvent_Soccar_TA:bBallHasBeenHit"
        && attribute?.Boolean === true
        && stateName === ACTIVE_STATE && firstBallHitAt === null) {
      firstBallHitAt = time;
    } else if (objectName === "Engine.GameReplicationInfo:bStopCountDown"
        && typeof attribute?.Boolean === "boolean") {
      setPaused(attribute.Boolean, time);
    } else if (objectName === "TAGame.GameEvent_Soccar_TA:bMatchEnded"
        && attribute?.Boolean === true) {
      closeActive(time);
      terminalClosedAt = time;
    } else if (objectName === "TAGame.GameEvent_Team_TA:bForfeit"
        && attribute?.Boolean === true) {
      closeActive(time);
      terminalClosedAt = time;
    }
  }

  function finish({ lastFrameTime }) {
    if (paused && pauseStartedAt !== null && terminalClosedAt !== null) {
      pauseSeconds += Math.max(0, terminalClosedAt - pauseStartedAt);
    }
    const warnings = [warning(
      "PLAYING_DURATION_UNVERIFIED",
      "Active-state intervals include kickoff clock-stopped time and unvalidated transition boundaries; actual playing duration is withheld.",
    )];
    if (unknownStates.size > 0) warnings.push(warning(
      "UNKNOWN_GAME_STATE",
      "Playing duration was withheld because the replay used unrecognized game states.",
      { state_names: [...unknownStates].sort() },
    ));
    if (pauseSuspected) warnings.push(warning(
      "POSSIBLE_UNMARKED_PAUSE",
      "Playing duration was withheld because the live game clock stopped without a recognized pause signal.",
    ));
    const unavailable = (reason) => ({ status: "unavailable", source: null,
      metric_version: TIMING_METRIC_VERSION, reason });
    return {
      value: {
        playing_duration_seconds: null, zero_second_play_seconds: null, pause_seconds: null,
        clock_precision_seconds: 1, playing_duration_precision_seconds: 0.001,
        metric_version: TIMING_METRIC_VERSION,
      },
      availability: {
        playing_duration: unavailable("Active-state intervals remain diagnostic until physical timing semantics are independently validated."),
        playing_duration_seconds: unavailable("Kickoff, zero-clock, pause, and transition intervals are not a validated physical playing duration."),
        zero_second_play_seconds: unavailable("Clock-to-phase intervals are not independently validated physical zero-second play."),
        pause_seconds: unavailable("Stop-countdown is not validated as complete technical-pause coverage."),
      },
      warnings,
      diagnostics: {
        reached_zero: reachedZero,
        overtime_attribute_observed: overtimeObserved,
        pause_signal_observed: pauseSignalObserved,
        terminal_boundary_observed: terminalClosedAt !== null,
        last_frame_time: Number.isFinite(lastFrameTime) ? lastFrameTime : null,
        clock_samples: clockHistory.length,
        game_states: [...new Set(stateHistory.map((item) => item.state))],
        active_state_interval_seconds: roundSeconds(activeSeconds),
        active_intervals: activeIntervals,
        zero_clock_transition_interval_seconds: firstZeroAt !== null && zeroSecondEndedAt !== null
          ? roundSeconds(Math.max(0, zeroSecondEndedAt - firstZeroAt)) : null,
        stop_countdown_signal_interval_seconds: pauseSignalObserved ? roundSeconds(pauseSeconds) : null,
        diagnostic_only: true,
      },
    };
  }

  return { processUpdate, finish, getStateName: () => stateName };
}

function unavailableResult(players, code, message) {
  const unavailableOt = unavailableOvertime(message);
  const playerResults = players.map(() => ({
    identity: null,
    advanced_statistics: emptyAdvancedStatistics(),
    metric_availability: {
      mvp: {
        status: "unsupported",
        source: null,
        metric_version: SCOUTING_METRIC_VERSION,
        reason: "No genuine MVP award was found in the verified replay data; score rank is not used as a substitute.",
      },
      demolitions: {
        status: "unavailable",
        source: null,
        metric_version: DEMOLITION_METRIC_VERSION,
        warnings: [code],
      },
      overtime_goals: { status: "unavailable", source: null,
        metric_version: OVERTIME_METRIC_VERSION, reason: message },
    },
  }));
  return {
    playerResults,
    advanced_metrics: {
      schema_version: "1.0.0",
      validation_status: "unavailable",
      network_decode_status: "unavailable",
      metric_availability: {
        demolitions: {
          status: "unavailable",
          source: null,
          metric_version: DEMOLITION_METRIC_VERSION,
          reason: message,
        },
        overtime: { status: "unavailable", source: null, metric_version: TIMING_METRIC_VERSION },
        overtime_clock_duration: { status: "unavailable", source: null, metric_version: TIMING_METRIC_VERSION },
        playing_duration: { status: "unavailable", source: null, metric_version: TIMING_METRIC_VERSION },
        ...Object.fromEntries([
          "overtime_seconds", "regulation_clock_seconds", "game_clock_seconds",
          "playing_duration_seconds", "zero_second_play_seconds", "pause_seconds", "ended_by",
        ].map((metric) => [metric, {
          status: "unavailable", source: null, metric_version: TIMING_METRIC_VERSION,
          reason: message,
        }])),
        ...deferredMetricAvailability(),
        ...unavailableOt.availability,
      },
      diagnostics: null,
    },
    timing: {
      overtime: null,
      overtime_seconds: null,
      regulation_clock_seconds: null,
      game_clock_seconds: null,
      playing_duration_seconds: null,
      zero_second_play_seconds: null,
      pause_seconds: null,
      ended_by: "unknown",
      clock_precision_seconds: 1,
      playing_duration_precision_seconds: 0.001,
      metric_version: TIMING_METRIC_VERSION,
      ...unavailableOt.value,
    },
    warnings: [warning(code, message)],
  };
}

export function analyzeNetworkReplay(decoded, players) {
  const frames = decoded?.network_frames?.frames;
  if (!Array.isArray(frames) || frames.length === 0) {
    return unavailableResult(
      players,
      decoded?._jwrlcs_network_decode_failed
        ? "ADVANCED_NETWORK_DECODE_FAILED"
        : "ADVANCED_NETWORK_UNAVAILABLE",
      decoded?._jwrlcs_network_decode_failed
        ? "Basic scoreboard data was parsed, but network decoding failed; advanced statistics remain null."
        : "Basic scoreboard data was parsed, but decoded network frames were unavailable; advanced statistics remain null.",
    );
  }

  const objects = decoded.objects ?? [];
  const registry = createActorRegistry(objects);
  const timing = createTimingAnalyzer(decoded);
  const overtimeAnalyzer = createOvertimeAnalyzer(decoded, { teamColorFromActor, uniqueIdentity });
  let overtimeAnalysisFailed = false;
  const demolitionEvents = [];
  const postGoalCollisionCandidates = [];
  const seenPostGoalVictims = new Set();
  const seenVictimGenerations = new Set();
  let repeatedDemolitionUpdates = 0;
  let excludedNonGameplayDemolitions = 0;
  let selfDemolitionEvents = 0;

  for (const [frameIndex, frame] of frames.entries()) {
    const counterChanges = new Map();
    for (const newActor of frame.new_actors ?? []) registry.register(newActor, frame.time);

    for (const update of frame.updated_actors ?? []) {
      const actor = registry.current(update.actor_id);
      const objectName = objects[update.object_id] ?? `#${update.object_id}`;
      timing.processUpdate(objectName, update.attribute, frame.time);
      if (!actor) continue;

      if (objectName === "Engine.PlayerReplicationInfo:PlayerName"
          && typeof update.attribute?.String === "string") {
        actor.playerName = update.attribute.String;
      } else if (objectName === "Engine.PlayerReplicationInfo:UniqueId"
          && update.attribute?.UniqueId) {
        actor.identity = uniqueIdentity(update.attribute.UniqueId);
      } else if (objectName === "Engine.PlayerReplicationInfo:Team") {
        const teamActorId = activeActorId(update.attribute);
        const teamActor = teamActorId === null ? null : registry.current(teamActorId);
        actor.teamActorKey = teamActor?.key ?? null;
        const color = teamColorFromActor(teamActor);
        if (color) actor.teamColors.add(color);
      } else if (objectName === "Engine.Pawn:PlayerReplicationInfo") {
        const priActorId = activeActorId(update.attribute);
        if (priActorId === null) {
          actor.activePriActorKey = null;
        } else {
          const priActor = registry.current(priActorId);
          actor.activePriActorKey = priActor?.key ?? null;
          if (priActor) actor.lastPriActorKey = priActor.key;
          if (priActor) priActor.carGenerations.add(actor.key);
        }
      } else if (objectName === "TAGame.PRI_TA:MatchDemolishes"
          && Number.isInteger(update.attribute?.Int) && update.attribute.Int >= 0) {
        counterChanges.set(`${actor.key}:inflicted`, {
          before: actor.recordedDemosInflicted, value: update.attribute.Int,
        });
        actor.recordedDemosInflicted = Math.max(actor.recordedDemosInflicted ?? 0, update.attribute.Int);
      } else if (objectName === "TAGame.PRI_TA:MatchTimesDemolished"
          && Number.isInteger(update.attribute?.Int) && update.attribute.Int >= 0) {
        counterChanges.set(`${actor.key}:taken`, {
          before: actor.recordedDemosTaken, value: update.attribute.Int,
        });
        actor.recordedDemosTaken = Math.max(actor.recordedDemosTaken ?? 0, update.attribute.Int);
      }
    }

    if (!overtimeAnalysisFailed) {
      try { overtimeAnalyzer.processFrame(frame, frameIndex, registry); }
      catch { overtimeAnalysisFailed = true; }
    }

    for (const update of frame.updated_actors ?? []) {
      const event = demolitionActors(update.attribute);
      if (!event) continue;
      const attackerActor = event.attacker === null ? null : registry.current(event.attacker);
      const victimActor = event.victim === null ? null : registry.current(event.victim);
      const victimGeneration = victimActor?.key ?? null;
      if (timing.getStateName() !== ACTIVE_STATE) {
        excludedNonGameplayDemolitions += 1;
        const raw = update.attribute.DemolishExtended;
        const attackerPri = raw?.attacker_pri?.active
          ? registry.current(raw.attacker_pri.actor) : null;
        // These remain EXCLUDED events. Recognize a counter-scope difference
        // only for one uniquely attributed ordinary post-goal collision, with
        // both exact counter updates in the same frame. Goal explosions,
        // replays, repeats, missing counters and self-demolitions cannot qualify.
        if (timing.getStateName() === "PostGoalScored"
            && raw?.self_demolish === false && raw.self_demo?.active === false
            && raw.goal_explosion_owner?.active === false
            && attackerActor?.lastPriActorKey && victimActor?.lastPriActorKey
            && attackerPri?.key === attackerActor.lastPriActorKey
            && victimGeneration && !seenVictimGenerations.has(victimGeneration)
            && !seenPostGoalVictims.has(victimGeneration)) {
          seenPostGoalVictims.add(victimGeneration);
          postGoalCollisionCandidates.push({
            time: frame.time, attackerPriKey: attackerActor.lastPriActorKey,
            victimPriKey: victimActor.lastPriActorKey,
            attackerCarKey: attackerActor.key, victimCarKey: victimGeneration,
            inflictedCounter: counterChanges.get(`${attackerActor.lastPriActorKey}:inflicted`),
            takenCounter: counterChanges.get(`${victimActor.lastPriActorKey}:taken`),
          });
        }
        continue;
      }
      if (victimGeneration && seenVictimGenerations.has(victimGeneration)) {
        repeatedDemolitionUpdates += 1;
        continue;
      }
      if (victimGeneration) seenVictimGenerations.add(victimGeneration);
      if (event.selfDemolition) selfDemolitionEvents += 1;
      demolitionEvents.push({
        time: frame.time,
        variant: event.variant,
        selfDemolition: event.selfDemolition,
        attackerPriKey: attackerActor?.lastPriActorKey ?? null,
        victimPriKey: victimActor?.lastPriActorKey ?? null,
      });
    }

    for (const actorId of frame.deleted_actors ?? []) registry.remove(actorId);
  }

  const priActors = [...registry.histories.values()].filter((actor) =>
    /PRI_TA/.test(actor.objectName),
  );
  const networkPlayers = priActors.filter((actor) => actor.identity);
  const matches = players.map((player) => {
    const stableMatch = player.platform_user_id
      ? networkPlayers.find((actor) =>
        actor.identity.platform === matchingPlatform(player.platform)
        && actor.identity.platform_user_id === player.platform_user_id,
      )
      : null;
    // Older headers lack Epic account IDs. Recover only a unique stable
    // account backed by name + observed team + platform. Never merge by name
    // alone, or assign a contradictory network ID over an existing header ID.
    const fallbackCandidates = player.platform_user_id ? [] : networkPlayers.filter((actor) =>
      normalizeName(actor.playerName) === normalizeName(player.replay_name)
      && player.team_color !== null && actor.teamColors.has(player.team_color)
      && actor.identity.platform === matchingPlatform(player.platform),
    );
    const stableKeys = new Set(fallbackCandidates.map((actor) => actor.identity.stable_key));
    return stableMatch ?? (stableKeys.size === 1 ? fallbackCandidates[0] : null);
  });

  // A PRI actor can be destroyed and recreated with the same replay account.
  // Map every observed PRI generation back to the matched stable identity so
  // demo events before and after a respawn/actor-id reuse stay attributable.
  const priToPlayer = new Map();
  for (const actor of priActors) {
    const stableCandidates = matches
      .map((matchedActor, index) => ({ matchedActor, index }))
      .filter(({ matchedActor }) => actor.identity
        && matchedActor?.identity?.stable_key === actor.identity.stable_key);
    if (stableCandidates.length === 1) {
      priToPlayer.set(actor.key, stableCandidates[0].index);
      continue;
    }

  }

  const participantActors = players.map((_, index) => priActors.filter((actor) =>
    priToPlayer.get(actor.key) === index));
  const participantCars = participantActors.map((actors) => new Set(
    actors.flatMap((actor) => [...actor.carGenerations])));

  const inflicted = players.map(() => 0);
  const taken = players.map(() => 0);
  let unresolvedDemolitionEndpoints = 0;
  for (const event of demolitionEvents) {
    if (event.selfDemolition) {
      unresolvedDemolitionEndpoints += 1;
      continue;
    }
    const attackerIndex = priToPlayer.get(event.attackerPriKey);
    const victimIndex = priToPlayer.get(event.victimPriKey);
    if (attackerIndex === undefined || victimIndex === undefined) {
      unresolvedDemolitionEndpoints += 1;
      continue;
    }
    inflicted[attackerIndex] += 1;
    taken[victimIndex] += 1;
  }

  const duplicateHeaderAccounts = matches.some((actor, index) => actor?.identity
    && matches.some((other, otherIndex) => otherIndex !== index
      && other?.identity?.stable_key === actor.identity.stable_key));
  const observedCarOwners = priActors.filter((actor) => actor.carGenerations.size > 0);
  const participatingIdentitiesResolved = observedCarOwners.length > 0
    && observedCarOwners.every((actor) => actor.identity && priToPlayer.has(actor.key));
  const unresolvedAssignedHeader = players.some((player, index) => !matches[index]
    && (player.team_color !== null
      || Object.values(player.statistics ?? {}).some((value) => value > 0)));
  // An unused/unassigned header row does not invalidate fully mapped network
  // participants. Keep its own participation unknown unless a PRI was matched.
  // A real car with an unresolved owner or an ambiguous assigned row still blocks.
  const allPlayersResolved = participatingIdentitiesResolved
    && !unresolvedAssignedHeader && !duplicateHeaderAccounts;

  const scopedOutInflicted = players.map(() => 0);
  const scopedOutTaken = players.map(() => 0);
  const postGoalCounterEvidence = [];
  for (const event of postGoalCollisionCandidates) {
    const attackerIndex = priToPlayer.get(event.attackerPriKey);
    const victimIndex = priToPlayer.get(event.victimPriKey);
    if (attackerIndex === undefined || victimIndex === undefined || attackerIndex === victimIndex) continue;
    const expectedInflicted = demolitionEvents.filter((item) => !item.selfDemolition
      && item.time <= event.time && priToPlayer.get(item.attackerPriKey) === attackerIndex
      && priToPlayer.has(item.victimPriKey)).length + scopedOutInflicted[attackerIndex] + 1;
    const expectedTaken = demolitionEvents.filter((item) => !item.selfDemolition
      && item.time <= event.time && priToPlayer.get(item.victimPriKey) === victimIndex
      && priToPlayer.has(item.attackerPriKey)).length + scopedOutTaken[victimIndex] + 1;
    const corroborates = (change, expected) => change && change.value === expected
      && (change.before === null ? change.value === 1 : change.value === change.before + 1);
    if (!corroborates(event.inflictedCounter, expectedInflicted)
        || !corroborates(event.takenCounter, expectedTaken)) continue;
    scopedOutInflicted[attackerIndex] += 1;
    scopedOutTaken[victimIndex] += 1;
    postGoalCounterEvidence.push({
      replay_seconds: roundSeconds(event.time), phase: "PostGoalScored",
      attacker_player_name: players[attackerIndex].replay_name,
      victim_player_name: players[victimIndex].replay_name,
      attacker_pri_key: event.attackerPriKey, victim_pri_key: event.victimPriKey,
      attacker_car_key: event.attackerCarKey, victim_car_key: event.victimCarKey,
      inflicted_counter: event.inflictedCounter.value, taken_counter: event.takenCounter.value,
      official_event_counted: false,
    });
  }
  // Game-recorded counters are another replay signal, not external ground
  // truth. They can include the strictly corroborated excluded collision above.
  // Any remaining mismatch withholds totals. Never substitute counters for
  // events, count a post-goal event officially, or manufacture a missing event.
  const recordedCounterMismatches = [];
  const recordedCounterScopeDifferences = [];
  participantActors.forEach((actors, index) => {
    for (const [field, key, eventCount, scopedOut] of [
      ["recordedDemosInflicted", "demolitions_inflicted", inflicted[index], scopedOutInflicted[index]],
      ["recordedDemosTaken", "demolitions_taken", taken[index], scopedOutTaken[index]],
    ]) {
      const values = actors.map((actor) => actor[field]).filter((value) => value !== null);
      if (values.length && Math.max(...values) !== eventCount + scopedOut) {
        recordedCounterMismatches.push({
          replay_player_name: players[index].replay_name,
          metric: key,
          recorded_counter: Math.max(...values),
          attributed_gameplay_events: eventCount,
        });
      } else if (values.length && scopedOut > 0) {
        recordedCounterScopeDifferences.push({
          replay_player_name: players[index].replay_name, metric: key,
          recorded_counter: Math.max(...values), attributed_gameplay_events: eventCount,
          corroborated_post_goal_events: scopedOut,
        });
      }
    }
  });
  const demolitionsVerified = allPlayersResolved && unresolvedDemolitionEndpoints === 0
    && recordedCounterMismatches.length === 0;
  const demolitionStatus = demolitionsVerified ? "verified" : "unavailable";
  const warnings = [];
  if (recordedCounterScopeDifferences.length) {
    warnings.push(warning(
      "DEMOLITION_COUNTER_SCOPE_DIFFERENCE",
      "Game-recorded counters include a corroborated post-goal collision excluded by the Active-phase demolition metric; official totals count Active-phase events only.",
      { differences: recordedCounterScopeDifferences, evidence: postGoalCounterEvidence },
    ));
  }
  if (recordedCounterMismatches.length) {
    warnings.push(warning(
      "DEMOLITION_COUNTER_MISMATCH",
      "Decoded gameplay demolition events disagree with game-recorded player counters; all demolition totals remain null pending replay review.",
      { mismatches: recordedCounterMismatches },
    ));
  }
  if (duplicateHeaderAccounts) {
    warnings.push(warning("DUPLICATE_HEADER_ACCOUNT", "Multiple scoreboard rows identify the same account; keep them for explicit review and withhold demolition totals."));
  }
  if (matches.some((item) => !item)) {
    warnings.push(warning(
      "NETWORK_PLAYER_IDENTITY_UNRESOLVED",
      allPlayersResolved
        ? "An unmatched header row is retained for review; all observed participating car identities are covered independently."
        : "At least one participating or assigned player could not be matched to a stable network account identifier; demolition statistics remain null.",
      { unmatched_player_count: matches.filter((item) => !item).length,
        participating_identity_coverage_complete: participatingIdentitiesResolved },
    ));
  }
  if (!participatingIdentitiesResolved && observedCarOwners.length > 0) {
    warnings.push(warning(
      "NETWORK_PARTICIPANT_IDENTITY_UNRESOLVED",
      "An observed participating car owner lacks a unique stable scoreboard-account mapping; complete demolition attribution remains unavailable.",
      { unmatched_participating_pri_keys: observedCarOwners
        .filter((actor) => !actor.identity || !priToPlayer.has(actor.key)).map((actor) => actor.key) },
    ));
  }
  if (unresolvedDemolitionEndpoints > 0) {
    warnings.push(warning(
      "DEMOLITION_ATTRIBUTION_INCOMPLETE",
      "At least one gameplay demolition could not be attributed to both stable player identities; all demolition totals remain null.",
      { unresolved_event_count: unresolvedDemolitionEndpoints },
    ));
  }
  if (selfDemolitionEvents > 0) {
    warnings.push(warning(
      "SELF_DEMOLITION_UNSUPPORTED",
      "A self-demolition event was observed and withheld from inflicted/taken totals.",
      { event_count: selfDemolitionEvents },
    ));
  }
  players.forEach((player, index) => {
    if (matches[index] && participantCars[index].size === 0) {
      warnings.push(warning(
        "HEADER_ENTRY_WITHOUT_CAR",
        `${player.replay_name} is retained, but no car is linked to this account in the decoded recording; review its participation instead of treating missing metrics as zero.`,
        { replay_player_name: player.replay_name },
      ));
    }
  });

  const phaseTimingResult = timing.finish({
    lastFrameTime: frames.at(-1)?.time,
  });
  const reviewedPlayers = players.map((player, index) => ({
    stable_key: matches[index]?.identity?.stable_key ?? null,
    platform: player.platform === "unknown" ? matches[index]?.identity?.platform : player.platform,
    platform_user_id: player.platform_user_id ?? matches[index]?.identity?.platform_user_id ?? null,
    replay_name: player.replay_name,
    participating: participantCars[index].size > 0,
  }));
  let overtimeResult;
  try {
    if (overtimeAnalysisFailed) throw new Error("Overtime signal analysis unavailable");
    overtimeResult = overtimeAnalyzer.finish(reviewedPlayers);
  } catch {
    overtimeResult = {
      ...unavailableOvertime("OVERTIME_ANALYSIS_FAILED: OT evidence could not be safely reconciled; other metrics are unaffected."),
      playerByKey: new Map(), diagnostics: null,
      warnings: [warning("OVERTIME_ANALYSIS_FAILED", "Overtime analysis failed; OT metrics remain null while independently available demolition statistics are preserved.")],
    };
  }
  const timingResult = {
    value: { ...phaseTimingResult.value, ...overtimeResult.value },
    availability: { ...phaseTimingResult.availability, ...overtimeResult.availability },
    warnings: [...phaseTimingResult.warnings, ...overtimeResult.warnings],
    diagnostics: { ...phaseTimingResult.diagnostics,
      terminal_boundary_observed: phaseTimingResult.diagnostics.terminal_boundary_observed
        || overtimeResult.availability.overtime_goal.status === "verified" },
  };
  warnings.push(...timingResult.warnings);

  const playerResults = players.map((player, index) => {
    const actor = matches[index];
    const advancedStatistics = emptyAdvancedStatistics();
    const demosAvailable = demolitionsVerified && participantCars[index].size > 0;
    if (demosAvailable) {
      advancedStatistics.demolitions_inflicted = inflicted[index];
      advancedStatistics.demolitions_taken = taken[index];
    }
    const overtimeGoals = overtimeResult.playerByKey.get(reviewedPlayers[index].stable_key);
    advancedStatistics.overtime_goals = overtimeGoals?.value ?? null;
    return {
      identity: actor?.identity
        ? {
          platform: actor.identity.platform,
          platform_user_id: actor.identity.platform_user_id,
          source: player.platform_user_id ? "header" : "network_unique_id",
          team_change_observed: actor.teamColors.size > 1,
        }
        : null,
      participation: {
        status: actor ? participantCars[index].size > 0 ? "car_observed" : "no_car_observed" : "unknown",
        team_assignment_observed: actor ? participantActors[index].some((item) => item.teamColors.size > 0) : null,
        network_pri_generations: actor ? participantActors[index].length : null,
        car_actor_generations: actor ? participantCars[index].size : null,
      },
      advanced_statistics: advancedStatistics,
      metric_availability: {
        overtime_goals: overtimeGoals?.availability ?? {
          status: "unavailable", source: null, metric_version: OVERTIME_METRIC_VERSION,
          reason: "NO_UNIQUE_STABLE_PARTICIPANT_IDENTITY",
        },
        mvp: {
          status: "unsupported",
          source: null,
          metric_version: SCOUTING_METRIC_VERSION,
          reason: "No genuine MVP award was found in the verified replay data; score rank is not used as a substitute.",
        },
        demolitions: {
          status: demosAvailable ? "verified" : "unavailable",
          source: demosAvailable ? "network_demolition_event" : null,
          metric_version: DEMOLITION_METRIC_VERSION,
          validation_scope: "extraction_and_attribution",
          independent_reference_status: "not_compared",
          warnings: demosAvailable ? [] : [actor && participantCars[index].size === 0
            ? "NO_CAR_OBSERVED" : recordedCounterMismatches.length
              ? "DEMOLITION_COUNTER_MISMATCH" : "DEMOLITION_ATTRIBUTION_INCOMPLETE"],
        },
      },
    };
  });

  const requiredMetricStatuses = [
    demolitionStatus,
    timingResult.availability.overtime.status,
    timingResult.availability.overtime_clock_duration.status,
    timingResult.availability.playing_duration.status,
  ];
  const validationStatus = requiredMetricStatuses.every((status) => status === "verified")
    ? "verified"
    : requiredMetricStatuses.some((status) => status === "verified") ? "partial" : "unavailable";

  return {
    playerResults,
    advanced_metrics: {
      schema_version: "1.0.0",
      validation_status: validationStatus,
      network_decode_status: "success",
      metric_availability: {
        demolitions: {
          status: demolitionStatus,
          source: demolitionsVerified ? "network_demolition_event" : null,
          metric_version: DEMOLITION_METRIC_VERSION,
          reason: demolitionsVerified ? null : recordedCounterMismatches.length
            ? "Game-recorded counters disagree with attributed gameplay events." : "Stable attribution was incomplete.",
          validation_scope: "extraction_and_attribution",
          independent_reference_status: "not_compared",
        },
        ...timingResult.availability,
        ...deferredMetricAvailability(),
      },
      diagnostics: {
        demolition_events_counted: demolitionsVerified ? demolitionEvents.length : null,
        demolition_events_detected: demolitionEvents.length,
        recorded_demo_counter_mismatches: recordedCounterMismatches,
        recorded_demo_counter_scope_differences: recordedCounterScopeDifferences,
        post_goal_counter_evidence: postGoalCounterEvidence,
        repeated_demolition_updates_ignored: repeatedDemolitionUpdates,
        non_gameplay_demolition_updates_ignored: excludedNonGameplayDemolitions,
        unresolved_demolition_events: unresolvedDemolitionEndpoints,
        player_identities_resolved: matches.filter(Boolean).length,
        player_identities_expected: players.length,
        timing: timingResult.diagnostics,
        overtime: overtimeResult.diagnostics,
      },
    },
    timing: timingResult.value,
    warnings,
  };
}

export function replayFormat(decoded) {
  return {
    major_version: Number.isInteger(decoded?.major_version) ? decoded.major_version : null,
    minor_version: Number.isInteger(decoded?.minor_version) ? decoded.minor_version : null,
    net_version: Number.isInteger(decoded?.net_version) ? decoded.net_version : null,
    game_type: decoded?.game_type ?? null,
    game_version: Number.isInteger(decoded?.properties?.GameVersion)
      ? decoded.properties.GameVersion
      : null,
    build_version: decoded?.properties?.BuildVersion ?? null,
    replay_version: Number.isInteger(decoded?.properties?.ReplayVersion)
      ? decoded.properties.ReplayVersion
      : null,
  };
}


const ACTIVE_STATE = "Active";
const KNOWN_NON_PLAYING_STATES = new Set([
  "Countdown",
  "PostGoalScored",
  "Finished",
  "MatchEnded",
  "PodiumSpotlight",
]);

export const SCOUTING_METRIC_VERSION = "jwrlcs-scouting-v1";
export const DEMOLITION_METRIC_VERSION = "jwrlcs-demolitions-v2";
export const TIMING_METRIC_VERSION = "jwrlcs-timing-v2";

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
  let overtimeClockMaximum = null;
  let regulationClockMaximum = null;
  let forfeitDetected = false;
  let matchEndedDetected = false;
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
    if (overtimeObserved || (reachedZero && value > 0)) {
      overtimeClockMaximum = Math.max(overtimeClockMaximum ?? 0, value);
    } else {
      regulationClockMaximum = Math.max(regulationClockMaximum ?? 0, value);
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
      matchEndedDetected = true;
      closeActive(time);
      terminalClosedAt = time;
    } else if (objectName === "TAGame.GameEvent_Team_TA:bForfeit"
        && attribute?.Boolean === true) {
      forfeitDetected = true;
      closeActive(time);
      terminalClosedAt = time;
    }
  }

  function finish({ finalBlueScore, finalOrangeScore, lastFrameTime }) {
    if (paused && pauseStartedAt !== null && terminalClosedAt !== null) {
      pauseSeconds += Math.max(0, terminalClosedAt - pauseStartedAt);
    }

    const finalScoreIsDecisive = Number.isInteger(finalBlueScore)
      && Number.isInteger(finalOrangeScore)
      && finalBlueScore !== finalOrangeScore;
    let overtime = null;
    if (overtimeObserved) {
      overtime = true;
    } else if (forfeitDetected && !reachedZero) {
      overtime = false;
    } else if (matchEndedDetected && reachedZero
        && finalScoreIsDecisive && overtimeClockMaximum === null) {
      overtime = false;
    }

    const endedInClosedState = activeStartedAt === null
      && (stateName !== ACTIVE_STATE || terminalClosedAt !== null);
    const completeOvertimeGoal = overtime === true
      && finalScoreIsDecisive
      && endedInClosedState
      && stateName === "PostGoalScored";
    const reliableTerminal = forfeitDetected
      || matchEndedDetected
      || completeOvertimeGoal;
    // Active-state time includes kickoff movement while the game clock is
    // stopped. Terminal closure alone does not validate its physical playing
    // duration semantics. Keep the candidate in diagnostics, never as an
    // official duration or a per-five-minute denominator.
    const playingDurationReliable = false;
    const overtimeSeconds = overtime === false ? 0
      : completeOvertimeGoal && overtimeClockMaximum !== null
        ? overtimeClockMaximum : null;

    let endedBy = "incomplete";
    if (forfeitDetected) endedBy = "forfeit";
    else if (completeOvertimeGoal) endedBy = "overtime_goal";
    else if (matchEndedDetected && overtime === false) endedBy = "regulation";
    else if (overtime === false && reachedZero && finalScoreIsDecisive) endedBy = "regulation_clock_expired";

    let zeroSecondPlaySeconds = null;
    if (firstZeroAt !== null && zeroSecondEndedAt !== null) {
      zeroSecondPlaySeconds = roundSeconds(Math.max(0, zeroSecondEndedAt - firstZeroAt));
    }

    const warnings = [];
    if (overtime === null) {
      warnings.push(warning(
        "OVERTIME_STATUS_UNVERIFIED",
        "The network data does not contain enough evidence to verify whether the game reached overtime.",
      ));
    }
    if (!playingDurationReliable) {
      warnings.push(warning(
        "PLAYING_DURATION_UNVERIFIED",
        "Active-state intervals include kickoff clock-stopped time and unvalidated transition boundaries; actual playing duration is withheld.",
        { ended_by: endedBy },
      ));
    }
    if (unknownStates.size > 0) {
      warnings.push(warning(
        "UNKNOWN_GAME_STATE",
        "Playing duration was withheld because the replay used unrecognized game states.",
        { state_names: [...unknownStates].sort() },
      ));
    }
    if (pauseSuspected) {
      warnings.push(warning(
        "POSSIBLE_UNMARKED_PAUSE",
        "Playing duration was withheld because the live game clock stopped without a recognized pause signal.",
      ));
    }

    return {
      value: {
        overtime,
        overtime_seconds: overtimeSeconds,
        regulation_clock_seconds: regulationClockMaximum,
        game_clock_seconds: overtimeSeconds === null || regulationClockMaximum === null
          ? null
          : regulationClockMaximum + overtimeSeconds,
        playing_duration_seconds: playingDurationReliable ? roundSeconds(activeSeconds) : null,
        zero_second_play_seconds: null,
        pause_seconds: null,
        ended_by: endedBy,
        clock_precision_seconds: 1,
        playing_duration_precision_seconds: 0.001,
        metric_version: TIMING_METRIC_VERSION,
      },
      availability: {
        overtime: {
          status: overtime === null ? "unavailable" : "verified",
          source: overtimeObserved ? "network_attribute" : overtime === false ? "validated_game_clock" : null,
          metric_version: TIMING_METRIC_VERSION,
        },
        overtime_clock_duration: {
          status: overtimeSeconds === null ? "unavailable" : "verified",
          source: overtimeSeconds === null ? null : "network_game_clock",
          metric_version: TIMING_METRIC_VERSION,
        },
        playing_duration: {
          status: playingDurationReliable ? "verified" : "unavailable",
          source: playingDurationReliable ? "network_game_state_intervals" : null,
          metric_version: TIMING_METRIC_VERSION,
          reason: "Active-state intervals are diagnostics only until kickoff, zero-clock, pause, and transition semantics are independently validated.",
        },
        overtime_seconds: {
          status: overtimeSeconds === null ? "unavailable" : "verified",
          source: overtimeSeconds === null ? null : "network_game_clock",
          metric_version: TIMING_METRIC_VERSION,
          reason: overtimeSeconds === null ? "No verified final overtime clock boundary." : null,
        },
        regulation_clock_seconds: {
          status: regulationClockMaximum === null ? "unavailable" : "verified",
          source: regulationClockMaximum === null ? null : "network_game_clock",
          metric_version: TIMING_METRIC_VERSION,
          reason: "Maximum observed regulation clock value; not elapsed playing time or proof of a complete recording.",
        },
        game_clock_seconds: {
          status: overtimeSeconds === null || regulationClockMaximum === null ? "unavailable" : "verified",
          source: overtimeSeconds === null || regulationClockMaximum === null ? null : "derived_clock_sum",
          metric_version: TIMING_METRIC_VERSION,
          reason: "Arithmetic clock reference only; never actual playing duration.",
        },
        playing_duration_seconds: {
          status: "unavailable",
          source: null,
          metric_version: TIMING_METRIC_VERSION,
          reason: "Active-state intervals include kickoff clock-stopped time and unvalidated boundaries.",
        },
        zero_second_play_seconds: {
          status: "unavailable",
          source: null,
          metric_version: TIMING_METRIC_VERSION,
          reason: "A sampled zero-clock-to-state-transition interval is not yet validated as actual zero-second play.",
        },
        pause_seconds: {
          status: "unavailable",
          source: null,
          metric_version: TIMING_METRIC_VERSION,
          reason: "The stop-countdown signal is not validated as complete pause coverage.",
        },
        ended_by: {
          status: reliableTerminal ? "verified" : "unavailable",
          source: forfeitDetected || matchEndedDetected ? "network_terminal_attribute"
            : completeOvertimeGoal ? "network_overtime_goal_state" : null,
          metric_version: TIMING_METRIC_VERSION,
        },
      },
      warnings,
      diagnostics: {
        reached_zero: reachedZero,
        overtime_attribute_observed: overtimeObserved,
        pause_signal_observed: pauseSignalObserved,
        terminal_boundary_observed: reliableTerminal,
        last_frame_time: Number.isFinite(lastFrameTime) ? lastFrameTime : null,
        clock_samples: clockHistory.length,
        game_states: [...new Set(stateHistory.map((item) => item.state))],
        active_state_interval_seconds: roundSeconds(activeSeconds),
        active_intervals: activeIntervals,
        zero_clock_transition_interval_seconds: zeroSecondPlaySeconds,
        stop_countdown_signal_interval_seconds: pauseSignalObserved ? roundSeconds(pauseSeconds) : null,
        diagnostic_only: true,
      },
    };
  }

  return { processUpdate, finish, getStateName: () => stateName };
}

function unavailableResult(players, code, message) {
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
  const demolitionEvents = [];
  const seenVictimGenerations = new Set();
  let repeatedDemolitionUpdates = 0;
  let excludedNonGameplayDemolitions = 0;
  let selfDemolitionEvents = 0;

  for (const frame of frames) {
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
        actor.recordedDemosInflicted = Math.max(actor.recordedDemosInflicted ?? 0, update.attribute.Int);
      } else if (objectName === "TAGame.PRI_TA:MatchTimesDemolished"
          && Number.isInteger(update.attribute?.Int) && update.attribute.Int >= 0) {
        actor.recordedDemosTaken = Math.max(actor.recordedDemosTaken ?? 0, update.attribute.Int);
      }
    }

    for (const update of frame.updated_actors ?? []) {
      const event = demolitionActors(update.attribute);
      if (!event) continue;
      if (timing.getStateName() !== ACTIVE_STATE) {
        excludedNonGameplayDemolitions += 1;
        continue;
      }
      const attackerActor = event.attacker === null ? null : registry.current(event.attacker);
      const victimActor = event.victim === null ? null : registry.current(event.victim);
      const victimGeneration = victimActor?.key ?? null;
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
        actor.identity.platform === player.platform
        && actor.identity.platform_user_id === player.platform_user_id,
      )
      : null;
    // Older headers lack Epic account IDs. Recover only a unique stable
    // account backed by name + observed team + platform. Never merge by name
    // alone, or assign a contradictory network ID over an existing header ID.
    const fallbackCandidates = player.platform_user_id ? [] : networkPlayers.filter((actor) =>
      normalizeName(actor.playerName) === normalizeName(player.replay_name)
      && player.team_color !== null && actor.teamColors.has(player.team_color)
      && actor.identity.platform === player.platform,
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
  const allPlayersResolved = matches.every(Boolean) && !duplicateHeaderAccounts;
  // Game-recorded counters are an independent input to the event-counting
  // algorithm, not external ground truth. A mismatch means event coverage is
  // incomplete or its phase semantics need review. Do not substitute counter
  // values, manufacture missing events, or publish a partial total.
  const recordedCounterMismatches = [];
  participantActors.forEach((actors, index) => {
    for (const [field, key, eventCount] of [
      ["recordedDemosInflicted", "demolitions_inflicted", inflicted[index]],
      ["recordedDemosTaken", "demolitions_taken", taken[index]],
    ]) {
      const values = actors.map((actor) => actor[field]).filter((value) => value !== null);
      if (values.length && Math.max(...values) !== eventCount) {
        recordedCounterMismatches.push({
          replay_player_name: players[index].replay_name,
          metric: key,
          recorded_counter: Math.max(...values),
          attributed_gameplay_events: eventCount,
        });
      }
    }
  });
  const demolitionsVerified = allPlayersResolved && unresolvedDemolitionEndpoints === 0
    && recordedCounterMismatches.length === 0;
  const demolitionStatus = demolitionsVerified ? "verified" : "unavailable";
  const warnings = [];
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
  if (!allPlayersResolved) {
    warnings.push(warning(
      "NETWORK_PLAYER_IDENTITY_UNRESOLVED",
      "At least one scoreboard player could not be matched to a stable network account identifier; demolition statistics remain null.",
      { unmatched_player_count: matches.filter((item) => !item).length },
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

  const timingResult = timing.finish({
    finalBlueScore: decoded.properties?.Team0Score ?? 0,
    finalOrangeScore: decoded.properties?.Team1Score ?? 0,
    lastFrameTime: frames.at(-1)?.time,
  });
  warnings.push(...timingResult.warnings);

  const playerResults = players.map((player, index) => {
    const actor = matches[index];
    const advancedStatistics = emptyAdvancedStatistics();
    const demosAvailable = demolitionsVerified && participantCars[index].size > 0;
    if (demosAvailable) {
      advancedStatistics.demolitions_inflicted = inflicted[index];
      advancedStatistics.demolitions_taken = taken[index];
    }
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
        repeated_demolition_updates_ignored: repeatedDemolitionUpdates,
        non_gameplay_demolition_updates_ignored: excludedNonGameplayDemolitions,
        unresolved_demolition_events: unresolvedDemolitionEndpoints,
        player_identities_resolved: matches.filter(Boolean).length,
        player_identities_expected: players.length,
        timing: timingResult.diagnostics,
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


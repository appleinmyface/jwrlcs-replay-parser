import crypto from "node:crypto";

const PLATFORM_PREFIX = /^OnlinePlatform_/;
const REPLAY_DATE = /^(\d{4})-(\d{2})-(\d{2}) (\d{2})-(\d{2})-(\d{2})$/;

function warning(code, message, details = {}) {
  return { code, severity: "warning", message, ...details };
}

function normalizeDate(value) {
  const match = REPLAY_DATE.exec(value ?? "");
  return match
    ? `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}`
    : null;
}

function normalizePlatform(value) {
  return (value?.value ?? "").replace(PLATFORM_PREFIX, "").toLowerCase() || "unknown";
}

function sequenceHint(replayName) {
  const match = /(?:game\s*)?(\d+)/i.exec(replayName ?? "");
  return match ? Number(match[1]) : null;
}

export function normalizeReplay({ fileName, bytes, decoded }) {
  const properties = decoded.properties;
  const warnings = [];
  const players = (properties.PlayerStats ?? [])
    .filter((player) => !player.bBot)
    .map((player) => {
      const platformUserId = player.OnlineID && player.OnlineID !== "0"
        ? String(player.OnlineID)
        : null;
      const normalized = {
        replay_name: player.Name,
        platform: normalizePlatform(player.Platform),
        platform_user_id: platformUserId,
        team_color: player.Team === 0 ? "blue" : "orange",
        mapped_player_id: null,
        identity_status: platformUserId ? "stable_id_available" : "manual_mapping_required",
        statistics: {
          score: player.Score ?? 0,
          goals: player.Goals ?? 0,
          assists: player.Assists ?? 0,
          saves: player.Saves ?? 0,
          shots: player.Shots ?? 0,
        },
      };

      if (!platformUserId) {
        warnings.push(warning(
          "PLAYER_ID_MISSING",
          `${player.Name} has no usable platform account ID in the replay header.`,
          { replay_player_name: player.Name },
        ));
      }
      if (normalized.statistics.shots < normalized.statistics.goals) {
        warnings.push(warning(
          "GOALS_EXCEED_SHOTS",
          `${player.Name} has ${normalized.statistics.goals} goal(s) and ${normalized.statistics.shots} shot(s); preserve the replay values.`,
          { replay_player_name: player.Name },
        ));
      }

      return normalized;
    });

  const blueScore = properties.Team0Score ?? 0;
  const orangeScore = properties.Team1Score ?? 0;
  const bluePlayers = players.filter((player) => player.team_color === "blue");
  const orangePlayers = players.filter((player) => player.team_color === "orange");

  if (properties.TeamSize !== 3) {
    warnings.push(warning("NOT_3V3", `Expected 3v3; replay reports team size ${properties.TeamSize}.`));
  }
  if (bluePlayers.length !== 3) {
    warnings.push(warning("BLUE_PLAYER_COUNT", `Expected three blue players; found ${bluePlayers.length}.`));
  }
  if (orangePlayers.length !== 3) {
    warnings.push(warning("ORANGE_PLAYER_COUNT", `Expected three orange players; found ${orangePlayers.length}.`));
  }
  if (blueScore === orangeScore) {
    warnings.push(warning("TIED_FINAL_SCORE", "The replay reports a tied final score and requires manual review."));
  }

  return {
    parser_version: "0.2.0",
    replay_hash_sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    replay_id: properties.Id ?? null,
    source_file_name: fileName,
    replay_name: properties.ReplayName ?? null,
    sequence_hint: sequenceHint(properties.ReplayName),
    played_at_local: normalizeDate(properties.Date),
    played_at_raw: properties.Date ?? null,
    map_code: properties.MapName ?? null,
    match_type: properties.MatchType ?? null,
    team_size: properties.TeamSize ?? null,
    team_mapping: {
      blue_season_team_id: null,
      orange_season_team_id: null,
    },
    final_score: {
      blue: blueScore,
      orange: orangeScore,
    },
    winner_color: blueScore > orangeScore ? "blue" : orangeScore > blueScore ? "orange" : null,
    players,
    warnings,
    review_status: "needs_review",
  };
}

export function normalizeSeries(games, scheduledMatchId = null) {
  const orderedGames = [...games].sort((left, right) => {
    if (left.sequence_hint !== null && right.sequence_hint !== null) {
      return left.sequence_hint - right.sequence_hint;
    }
    if (left.played_at_local && right.played_at_local) {
      return left.played_at_local.localeCompare(right.played_at_local);
    }
    return left.source_file_name.localeCompare(right.source_file_name);
  });
  const hashes = new Set();
  const seriesWarnings = [];

  for (const game of orderedGames) {
    if (hashes.has(game.replay_hash_sha256)) {
      seriesWarnings.push(warning(
        "DUPLICATE_REPLAY_HASH",
        `${game.source_file_name} duplicates another replay in this upload.`,
        { replay_hash_sha256: game.replay_hash_sha256 },
      ));
    }
    hashes.add(game.replay_hash_sha256);
  }

  const numberedGames = orderedGames.map((game, index) => ({
    game_number: index + 1,
    ...game,
  }));

  return {
    contract_version: "0.2.0",
    review_status: "needs_review",
    game_count: numberedGames.length,
    provisional_color_score: {
      blue_wins: numberedGames.filter((game) => game.winner_color === "blue").length,
      orange_wins: numberedGames.filter((game) => game.winner_color === "orange").length,
    },
    series_warnings: seriesWarnings,
    required_review: {
      scheduled_match_id: scheduledMatchId,
      confirm_team_mapping_for_every_game: true,
      unresolved_player_count: new Set(
        numberedGames.flatMap((game) => game.players)
          .filter((player) => player.identity_status === "manual_mapping_required")
          .map((player) => `${player.platform}:${player.replay_name}`),
      ).size,
    },
    games: numberedGames,
  };
}

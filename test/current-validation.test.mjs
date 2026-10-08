import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { BoxcarsParser, NetworkParse } from "@jwrlcs/boxcars-wasm";
import { parseReplayFiles } from "../src/parser.mjs";

const currentPath = process.env.CURRENT_VALIDATION_REPLAY_FILE;
const ambiguousPath = process.env.RECENT_REPLAY_FILE;
const fixtureDirectory = process.env.REPLAY_FIXTURE_DIR;

function file(replayPath) {
  return { name: path.basename(replayPath), bytes: fs.readFileSync(replayPath) };
}

// Recorded counters are a distinct signal within the same replay. This is an
// internal-consistency comparison, never an independently viewed demo label.
function recordedCounters(decoded) {
  const priAccounts = new Map();
  const accounts = new Map();
  for (const frame of decoded.network_frames.frames) {
    for (const update of frame.updated_actors) {
      const property = decoded.objects[update.object_id];
      if (property === "Engine.PlayerReplicationInfo:UniqueId") {
        const [platform, identifier] = Object.entries(update.attribute.UniqueId.remote_id)[0];
        priAccounts.set(update.actor_id, `${platform.toLowerCase()}:${identifier}`);
      }
      const metric = property === "TAGame.PRI_TA:MatchDemolishes" ? "inflicted"
        : property === "TAGame.PRI_TA:MatchTimesDemolished" ? "taken" : null;
      if (!metric) continue;
      const key = priAccounts.get(update.actor_id);
      assert.ok(key, "Counter update must have a stable account identity");
      const counter = accounts.get(key) ?? {};
      counter[metric] = Math.max(counter[metric] ?? 0, update.attribute.Int);
      accounts.set(key, counter);
    }
  }
  return accounts;
}

test("new current-build replay has complete decoding and internally consistent participant demos", { skip: !currentPath }, () => {
  const input = file(currentPath);
  const raw = new BoxcarsParser(input.bytes).setNetworkParse(NetworkParse.Always).parse();
  const game = parseReplayFiles([input]).games[0];
  assert.equal(raw.network_frames.frames.length, 7281);
  assert.equal(raw.properties.NumFrames, 7281);
  assert.equal(game.replay_format.build_version, "261001.2867.529371");
  assert.deepEqual([game.replay_format.major_version, game.replay_format.minor_version,
    game.replay_format.net_version, game.replay_format.replay_version], [868, 34, 12, 8]);
  assert.deepEqual(game.final_score, { blue: 1, orange: 2 });
  assert.equal(game.players.length, 7);
  assert.equal(game.players.filter((p) => p.participation.status === "car_observed").length, 6);
  assert.equal(new Set(game.players.map((p) => `${p.platform}:${p.platform_user_id}`)).size, 7);
  const diagnostics = game.advanced_metrics.diagnostics;
  assert.equal(game.advanced_metrics.network_decode_status, "success");
  assert.equal(game.advanced_metrics.validation_status, "partial");
  assert.equal(game.advanced_metrics.metric_availability.demolitions.status, "verified");
  assert.equal(diagnostics.demolition_events_counted, 11);
  assert.equal(diagnostics.demolition_events_detected, 11);
  assert.equal(diagnostics.repeated_demolition_updates_ignored, 2);
  assert.equal(diagnostics.non_gameplay_demolition_updates_ignored, 8);
  assert.equal(diagnostics.unresolved_demolition_events, 0);
  assert.deepEqual(diagnostics.recorded_demo_counter_mismatches, []);
  assert.ok(!game.warnings.some((w) => w.code === "DEMOLITION_COUNTER_MISMATCH"));

  const expected = {
    Albert: [2, 2], ttvCupboard: [2, 1], Sean: [1, 3], Heynamesjr: [1, 2],
    zev: [2, 0], apple: [3, 3], Lebyrinnn: [null, null],
  };
  const counters = recordedCounters(raw);
  for (const player of game.players) {
    assert.equal(typeof player.platform_user_id, "string");
    const header = raw.properties.PlayerStats.find((p) => p.Name === player.replay_name);
    assert.deepEqual(player.statistics, {
      score: header.Score ?? 0, goals: header.Goals ?? 0, assists: header.Assists ?? 0,
      saves: header.Saves ?? 0, shots: header.Shots ?? 0,
    });
    assert.deepEqual([player.advanced_statistics.demolitions_inflicted,
      player.advanced_statistics.demolitions_taken], expected[player.replay_name]);
    assert.equal(player.metric_availability.demolitions.independent_reference_status, "not_compared");
    const recorded = counters.get(`${player.platform}:${player.platform_user_id}`);
    if (recorded?.inflicted !== undefined) {
      assert.equal(player.advanced_statistics.demolitions_inflicted, recorded.inflicted);
    }
    if (recorded?.taken !== undefined) {
      assert.equal(player.advanced_statistics.demolitions_taken, recorded.taken);
    }
    for (const group of ["boost", "movement", "positioning"]) {
      assert.ok(Object.values(player.advanced_statistics[group]).every((value) => value === null));
      assert.equal(game.advanced_metrics.metric_availability[group].status, "unsupported");
    }
  }
  // No taken counter is serialized for zev: event-derived zero is not a
  // recorded counter zero. No-car Lebyrinnn remains unavailable, not zero.
  assert.equal(counters.get("steam:76561198094213201").taken, undefined);
  const unassigned = game.players.find((p) => p.replay_name === "Lebyrinnn");
  assert.equal(unassigned.team_color, null);
  assert.equal(unassigned.participation.header_team_index, -1);
  assert.equal(unassigned.participation.status, "no_car_observed");
  assert.equal(unassigned.metric_availability.demolitions.status, "unavailable");
  assert.equal(game.timing.regulation_clock_seconds, 300);
  for (const metric of ["overtime", "overtime_seconds", "game_clock_seconds",
    "playing_duration_seconds", "zero_second_play_seconds", "pause_seconds"]) {
    assert.equal(game.timing[metric], null);
    assert.equal(game.advanced_metrics.metric_availability[metric].status, "unavailable");
  }
});

test("ambiguous and mixed-format games do not withhold another replay's valid demo extraction", {
  skip: !currentPath || !ambiguousPath || !fixtureDirectory,
}, () => {
  const inputs = [file(currentPath), file(ambiguousPath),
    file(path.join(fixtureDirectory, "8A4F11A94D99212BF503C9A034869234.replay"))];
  const series = parseReplayFiles(inputs);
  assert.equal(series.game_count, 3);
  assert.equal(series.parser_engine.per_game_validation, true);
  assert.ok(!Object.hasOwn(series, "validation_status"));
  const current = series.games.find((g) => g.source_file_name === path.basename(currentPath));
  const ambiguous = series.games.find((g) => g.source_file_name === path.basename(ambiguousPath));
  const older = series.games.find((g) => g.replay_format.minor_version === 32);
  assert.equal(current.advanced_metrics.metric_availability.demolitions.status, "verified");
  assert.equal(current.players.find((p) => p.replay_name === "Albert").advanced_statistics.demolitions_inflicted, 2);
  assert.equal(current.timing.overtime, null);
  assert.ok(ambiguous.warnings.some((w) => w.code === "DEMOLITION_COUNTER_MISMATCH"));
  assert.equal(ambiguous.advanced_metrics.metric_availability.demolitions.status, "unavailable");
  assert.ok(ambiguous.players.every((p) => p.advanced_statistics.demolitions_inflicted === null
    && p.advanced_statistics.demolitions_taken === null));
  assert.equal(older.advanced_metrics.metric_availability.demolitions.status, "verified");
  assert.equal(older.timing.overtime, true);
  assert.equal(older.timing.overtime_seconds, 36);
  assert.ok(series.games.every((g) => g.timing.playing_duration_seconds === null));
});

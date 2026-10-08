import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { decodeReplay } from "../src/engine.mjs";
import { parseReplayFiles } from "../src/parser.mjs";
import { BoxcarsParser, NetworkParse } from "@jwrlcs/boxcars-wasm";
import { normalizeReplay } from "../src/normalize.mjs";

const replayPath = process.env.RECENT_REPLAY_FILE;

test("released upstream decoder processes every current-build frame without altering the scoreboard", { skip: !replayPath }, () => {
  const bytes = fs.readFileSync(replayPath);
  const raw = decodeReplay(bytes, { network: false });
  const game = parseReplayFiles([{ name: "AECE585C11F1C1FA47B6CBA5D3AEA3D3.replay", bytes }]).games[0];
  const strict = new BoxcarsParser(bytes).setNetworkParse(NetworkParse.Always).parse();
  // Decoder coverage and internally attributable events are not independent
  // demo/OT ground truth. No replay-viewing or other labeled reference exists.
  assert.equal(strict.network_frames.frames.length, 8176);
  assert.equal(strict.network_frames.frames.length, strict.properties.NumFrames);
  assert.equal(game.replay_format.build_version, "261001.2867.529371");
  assert.equal(game.replay_format.major_version, 868);
  assert.equal(game.replay_format.minor_version, 34);
  assert.equal(game.replay_format.net_version, 12);
  assert.deepEqual(game.final_score, { blue: raw.properties.Team0Score, orange: raw.properties.Team1Score });
  assert.equal(game.players.length, 7);
  assert.deepEqual(game.final_score, { blue: 2, orange: 7 });
  assert.equal(game.players.filter((player) => player.platform_user_id !== null).length, 7);
  assert.equal(new Set(game.players.map((p) => `${p.platform}:${p.platform_user_id}`)).size, 7);
  assert.equal(game.advanced_metrics.network_decode_status, "success");
  assert.equal(game.advanced_metrics.validation_status, "unavailable");
  assert.equal(game.timing.overtime, null);
  assert.equal(game.timing.overtime_seconds, null);
  assert.equal(game.timing.regulation_clock_seconds, 300);
  assert.equal(game.timing.playing_duration_seconds, null);
  assert.equal(game.timing.zero_second_play_seconds, null);
  assert.equal(game.timing.pause_seconds, null);
  assert.ok(!game.warnings.some((item) => item.code === "ADVANCED_NETWORK_DECODE_FAILED"));
  assert.ok(game.warnings.some((item) => item.code === "NOT_3V3"));
  const observer = game.players.find((p) => p.replay_name === "ttvCupboard");
  assert.equal(observer.team_color, null);
  assert.equal(observer.participation.header_team_index, -1);
  assert.equal(observer.participation.status, "no_car_observed");
  assert.equal(observer.participation.team_assignment_observed, false);
  assert.equal(observer.advanced_statistics.demolitions_inflicted, null);
  assert.equal(observer.advanced_statistics.demolitions_taken, null);
  assert.equal(observer.metric_availability.demolitions.status, "unavailable");
  assert.equal(game.players.filter((p) => p.participation.status === "car_observed").length, 6);
  for (const player of game.players) {
    const headerPlayer = raw.properties.PlayerStats.find((item) => item.Name === player.replay_name);
    assert.deepEqual(player.statistics, {
      score: headerPlayer.Score ?? 0, goals: headerPlayer.Goals ?? 0,
      assists: headerPlayer.Assists ?? 0, saves: headerPlayer.Saves ?? 0, shots: headerPlayer.Shots ?? 0,
    });
    assert.equal(typeof player.platform_user_id, "string");
    if (player.platform === "epic") assert.equal(player.platform_user_id, headerPlayer.PlayerID.fields.EpicAccountId);
    else assert.equal(player.platform_user_id, headerPlayer.OnlineID);
    if (player !== observer) {
      assert.equal(player.advanced_statistics.demolitions_inflicted, null);
      assert.equal(player.advanced_statistics.demolitions_taken, null);
      assert.equal(player.metric_availability.demolitions.status, "unavailable");
    }
    assert.equal(player.metric_availability.demolitions.independent_reference_status, "not_compared");
  }
  assert.equal(game.advanced_metrics.diagnostics.unresolved_demolition_events, 0);
  assert.equal(game.advanced_metrics.diagnostics.demolition_events_counted, null);
  assert.ok(game.advanced_metrics.diagnostics.recorded_demo_counter_mismatches.length > 0);
  assert.ok(game.warnings.some((item) => item.code === "DEMOLITION_COUNTER_MISMATCH"));
});

test("current header identities survive a network-unavailable fallback without manufacturing advanced zeroes", { skip: !replayPath }, () => {
  const bytes = fs.readFileSync(replayPath);
  const decoded = decodeReplay(bytes, { network: false });
  const game = normalizeReplay({ fileName: "recent.replay", bytes, decoded });
  assert.equal(game.players.filter((p) => p.platform_user_id).length, 7);
  assert.equal(game.advanced_metrics.network_decode_status, "unavailable");
  assert.ok(game.players.every((p) => p.advanced_statistics.demolitions_inflicted === null));
  assert.ok(game.players.every((p) => p.advanced_statistics.demolitions_taken === null));
  assert.equal(game.timing.overtime, null);
  assert.equal(game.timing.playing_duration_seconds, null);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { BoxcarsParser, NetworkParse } from "@jwrlcs/boxcars-wasm";
import { parseReplayFiles } from "../src/parser.mjs";

const fixtureDirectory = process.env.CATALYST_WHEATIES_REPLAY_DIR;
const replayIds = [
  "9782091E11F1D8CA6D3DE59366030E92",
  "AD3C8A6C11F1D8CB988A308E4178846A",
  "C705EB7211F1D8CC80C5308E9AC9546B",
  "E8435F9E11F1D8CD06B0308ECFA29187",
  "CCD4845C11F1D8CFFB9A308E4F41F148",
];

test("Catalyst–Wheaties verifies all five games and preserves both exclusions", { skip: !fixtureDirectory }, () => {
  const files = replayIds.map((id) => {
    const name = `${id}.replay`;
    return { name, bytes: readFileSync(path.join(fixtureDirectory, name)) };
  });
  const { games } = parseReplayFiles(files);
  assert.deepEqual(games.map((game) => game.replay_name),
    replayIds.map((_, index) => `catalyst vs wheaties g${index + 1}`));
  assert.deepEqual(games.map((game) => game.advanced_metrics.diagnostics.demolition_events_counted), [5, 7, 2, 4, 8]);
  for (const game of games) {
    const { diagnostics, metric_availability, network_decode_status } = game.advanced_metrics;
    assert.equal(network_decode_status, "success");
    assert.equal(metric_availability.demolitions.status, "verified");
    assert.equal(metric_availability.demolitions.metric_version, "jwrlcs-demolitions-v6");
    assert.equal(diagnostics.unresolved_demolition_events, 0);
    assert.deepEqual(diagnostics.recorded_demo_counter_mismatches, []);
    assert.ok(!game.warnings.some((item) => item.code === "DEMOLITION_ATTRIBUTION_INCOMPLETE"));
  }

  const postGoal = games[2].advanced_metrics.diagnostics.post_goal_counter_evidence;
  assert.equal(postGoal.length, 1);
  assert.equal(postGoal[0].phase, "PostGoalScored");
  assert.equal(postGoal[0].official_event_counted, false);
  assert.ok(games[2].warnings.some((item) => item.code === "DEMOLITION_COUNTER_SCOPE_DIFFERENCE"));
  assert.ok(games.slice(0, 4).every((game) =>
    game.advanced_metrics.diagnostics.team_detachment_removal_evidence.length === 0));

  const game5 = games[4];
  const decoded = new BoxcarsParser(files[4].bytes).setNetworkParse(NetworkParse.Always).parse();
  assert.equal(game5.replay_hash_sha256, "a1d9256b2c9a7da00f30f3bd64a3254a78bff8a0f5452dae77ca1944b5f3a6e5");
  assert.equal(decoded.properties.NumFrames, 7765);
  assert.equal(decoded.network_frames.frames.length, 7765);
  const diagnostics = game5.advanced_metrics.diagnostics;
  assert.equal(diagnostics.player_identities_resolved, 8);
  assert.equal(diagnostics.demolition_events_detected, 9);
  assert.equal(diagnostics.team_detachment_removal_evidence.length, 1);
  const [removal] = diagnostics.team_detachment_removal_evidence;
  assert.equal(removal.frame_index, 95);
  assert.equal(removal.victim_car_key, "67:1");
  assert.equal(removal.victim_pri_key, "24:1");
  assert.deepEqual(removal.self_demolitions_counter, { before: null, value: 1 });
  const frame = decoded.network_frames.frames[95];
  assert.equal(removal.replay_seconds, frame.time);
  assert.deepEqual(removal.raw_attribute, frame.updated_actors.find((update) =>
    update.actor_id === 67 && update.attribute.DemolishExtended).attribute);
  assert.equal(removal.official_event_counted, false);

  const demos = (player) => [player.advanced_statistics.demolitions_inflicted,
    player.advanced_statistics.demolitions_taken];
  const players = game5.players.filter((player) => player.participation.status === "car_observed");
  assert.equal(players.length, 6);
  assert.ok(players.every((player) => demos(player).every(Number.isInteger)));
  assert.ok(players.some((player) => demos(player).every((value) => value === 0)));
  const spectators = game5.players.filter((player) => player.participation.status === "no_car_observed");
  assert.equal(spectators.length, 2);
  assert.deepEqual(spectators.map(demos), [[null, null], [null, null]]);
});

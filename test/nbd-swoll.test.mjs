import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { decodeReplay } from "../src/engine.mjs";
import { parseReplayFiles } from "../src/parser.mjs";

const fixtureDirectory = process.env.NBD_SWOLL_REPLAY_DIR;
const replayIds = [
  "DC77409611F1DCB41F850FA81F83429A",
  "D8DA0A8011F1DCB5CEE79CBE194B3F14",
  "D97B77FC11F1DCB667A99CBE13E6498A",
  "25161EA011F1DCB81D1154A6A35E3316",
  "3E0B5B5411F1DCB9595354A660D4B411",
];

test("NBD–Swoll preserves five scoreboards and verifies the moving-car removal in Game 5", {
  skip: !fixtureDirectory,
}, () => {
  const files = replayIds.map((id) => ({
    name: `${id}.replay`, bytes: readFileSync(path.join(fixtureDirectory, `${id}.replay`)),
  }));
  // Exercise the same parsing and series-normalization entry point as HTTP.
  const { games } = parseReplayFiles(files);
  assert.deepEqual(games.map((game) => game.replay_name),
    ["NBD Swoll", "NBD Swoll 2", "NBD Swoll 3", "NBD Swoll 4", "NBD Swoll 5"]);
  assert.deepEqual(games.map((game) => game.final_score),
    [{blue:3,orange:2}, {blue:3,orange:2}, {blue:3,orange:2}, {blue:1,orange:4}, {blue:3,orange:1}]);
  assert.deepEqual(games.map((game) => game.advanced_metrics.diagnostics.demolition_events_counted),
    [5, 7, 3, 4, 8]);
  for (const [index, game] of games.entries()) {
    const decoded = decodeReplay(files[index].bytes);
    assert.equal(decoded.network_frames.frames.length, decoded.properties.NumFrames);
    assert.equal(game.advanced_metrics.network_decode_status, "success");
    assert.equal(game.advanced_metrics.metric_availability.demolitions.status, "verified");
    assert.equal(game.advanced_metrics.diagnostics.unresolved_demolition_events, 0);
    assert.deepEqual(game.advanced_metrics.diagnostics.recorded_demo_counter_mismatches, []);
    assert.ok(!game.warnings.some((warning) => warning.code === "DEMOLITION_ATTRIBUTION_INCOMPLETE"));
    assert.equal(game.players.length, 6);
    for (const player of game.players) {
      const header = decoded.properties.PlayerStats.find((row) => row.Name === player.replay_name);
      assert.ok(header);
      assert.deepEqual(player.statistics, {
        score:header.Score, goals:header.Goals, assists:header.Assists, saves:header.Saves, shots:header.Shots,
      });
    }
  }
  assert.ok(games.slice(0,4).every((game) =>
    game.advanced_metrics.diagnostics.team_detachment_removal_evidence.length === 0));
  const game5 = games[4];
  assert.equal(game5.replay_hash_sha256, "5221fd68d4ca334e3799b760d257ecbbf285e47a586d7c55464c3f5639b35009");
  const diagnostics = game5.advanced_metrics.diagnostics;
  assert.equal(diagnostics.demolition_events_detected, 9);
  assert.equal(diagnostics.team_detachment_removal_evidence.length, 1);
  const [removal] = diagnostics.team_detachment_removal_evidence;
  assert.equal(removal.frame_index, 2573);
  assert.equal(removal.victim_car_key, "69:2");
  assert.equal(removal.victim_pri_key, "18:1");
  assert.deepEqual(removal.self_demolitions_counter, {before:null,value:1});
  assert.deepEqual(removal.raw_attribute.DemolishExtended.victim_velocity, {x:-4.24,y:8.55,z:-0.17});
  assert.equal(removal.replay_seconds, 143.96939);
  assert.equal(removal.car_deleted_replay_seconds, 148.94528);
  assert.equal(removal.official_event_counted, false);
  assert.deepEqual(Object.fromEntries(game5.players.map((player) => [player.replay_name, [
    player.advanced_statistics.demolitions_inflicted, player.advanced_statistics.demolitions_taken,
  ]])), {
    "NBDxJxyden":[1,2], "NBDxGrxnding":[0,2], "Q_tty":[1,2],
    "ForTrees.":[1,0], "j.":[3,2], "Trizzyyyyy.":[2,0],
  });
});

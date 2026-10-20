import assert from "node:assert/strict";
import test from "node:test";
import { analyzeNetworkReplay } from "../src/advanced.mjs";

const objects = [
  "TAGame.PRI_TA",
  "Archetypes.Car.Car_Default",
  "Archetypes.Teams.Team0",
  "Archetypes.Teams.Team1",
  "Engine.PlayerReplicationInfo:PlayerName",
  "Engine.PlayerReplicationInfo:UniqueId",
  "Engine.PlayerReplicationInfo:Team",
  "Engine.Pawn:PlayerReplicationInfo",
  "TAGame.GameEvent_TA:ReplicatedStateName",
  "TAGame.Car_TA:ReplicatedDemolish",
  "TAGame.GameEvent_Soccar_TA:SecondsRemaining",
  "TAGame.GameEvent_Soccar_TA:bOverTime",
  "TAGame.GameEvent_Soccar_TA:bMatchEnded",
  "Engine.GameReplicationInfo:bStopCountDown",
  "TAGame.GameEvent_Team_TA:bForfeit",
];

const active = (actor) => ({ ActiveActor: { active: true, actor } });
const update = (actor_id, object_id, attribute) => ({ actor_id, object_id, attribute });
const actor = (actor_id, object_id) => ({ actor_id, object_id });
const demo = (attacker, victim) => ({
  DemolishFx: {
    attacker_flag: true,
    attacker,
    victim_flag: true,
    victim,
  },
});

const scoreboardPlayers = [
  { replay_name: "Alpha", platform: "steam", platform_user_id: "100", team_color: "blue" },
  { replay_name: "Bravo", platform: "steam", platform_user_id: "200", team_color: "orange" },
];

test("attributes unique demolition events across respawns and actor-id reuse", () => {
  const decoded = {
    objects,
    names: ["Countdown", "Active", "PostGoalScored"],
    properties: { Team0Score: 2, Team1Score: 1 },
    network_frames: { frames: [
      {
        time: 0,
        new_actors: [actor(1, 2), actor(2, 3), actor(10, 0), actor(11, 0), actor(20, 1), actor(21, 1)],
        updated_actors: [
          update(99, 8, { Int: 1 }),
          update(10, 4, { String: "Alpha" }),
          update(10, 5, { UniqueId: { remote_id: { Steam: "100" } } }),
          update(10, 6, active(1)),
          update(11, 4, { String: "Bravo" }),
          update(11, 5, { UniqueId: { remote_id: { Steam: "200" } } }),
          update(11, 6, active(2)),
          update(20, 7, active(10)),
          update(21, 7, active(11)),
          update(99, 10, { Int: 300 }),
        ],
        deleted_actors: [],
      },
      { time: 1, new_actors: [], updated_actors: [update(99, 9, demo(20, 21))], deleted_actors: [] },
      { time: 1.05, new_actors: [], updated_actors: [update(99, 9, demo(20, 21))], deleted_actors: [] },
      { time: 2, new_actors: [], updated_actors: [update(11, 6, active(1))], deleted_actors: [21] },
      {
        time: 3,
        new_actors: [actor(21, 1)],
        updated_actors: [update(21, 7, active(11)), update(99, 9, demo(20, 21))],
        deleted_actors: [20],
      },
      {
        time: 4,
        new_actors: [actor(20, 1)],
        updated_actors: [update(20, 7, active(10)), update(99, 9, demo(21, 20))],
        deleted_actors: [],
      },
      {
        time: 5,
        new_actors: [],
        updated_actors: [update(99, 8, { Int: 2 }), update(99, 9, demo(20, 21)), update(99, 10, { Int: 0 })],
        deleted_actors: [],
      },
    ] },
  };

  const result = analyzeNetworkReplay(decoded, scoreboardPlayers);
  assert.equal(result.advanced_metrics.metric_availability.demolitions.status, "verified");
  assert.equal(result.advanced_metrics.diagnostics.demolition_events_counted, 3);
  assert.equal(result.advanced_metrics.diagnostics.repeated_demolition_updates_ignored, 1);
  assert.equal(result.advanced_metrics.diagnostics.non_gameplay_demolition_updates_ignored, 1);
  assert.deepEqual(
    result.playerResults.map((item) => [
      item.advanced_statistics.demolitions_inflicted,
      item.advanced_statistics.demolitions_taken,
    ]),
    [[2, 1], [1, 2]],
  );
  assert.equal(result.playerResults[1].identity.team_change_observed, true);
});

test("keeps advanced values null when network frames are unavailable", () => {
  const result = analyzeNetworkReplay({ properties: {}, network_frames: null }, scoreboardPlayers);
  assert.equal(result.advanced_metrics.network_decode_status, "unavailable");
  assert.equal(result.playerResults[0].advanced_statistics.demolitions_inflicted, null);
  assert.equal(result.playerResults[0].advanced_statistics.demolitions_taken, null);
  assert.equal(result.timing.overtime, null);
  assert.equal(result.timing.playing_duration_seconds, null);
});

test("counter disagreement withholds partial demo totals rather than replacing them with counters", () => {
  const demoCounterObjects = [...objects, "TAGame.PRI_TA:MatchDemolishes"];
  const result = analyzeNetworkReplay({
    objects: demoCounterObjects, names: ["Active"], properties: {},
    network_frames: { frames: [{ time: 0,
      new_actors: [actor(10, 0), actor(11, 0), actor(20, 1), actor(21, 1)], deleted_actors: [],
      updated_actors: [
        update(99, 8, { Int: 0 }),
        update(10, 5, { UniqueId: { remote_id: { Steam: "100" } } }),
        update(11, 5, { UniqueId: { remote_id: { Steam: "200" } } }),
        update(20, 7, active(10)), update(21, 7, active(11)),
        update(99, 9, demo(20, 21)), update(10, demoCounterObjects.length - 1, { Int: 2 }),
      ],
    }] },
  }, scoreboardPlayers);
  assert.equal(result.advanced_metrics.diagnostics.demolition_events_detected, 1);
  assert.equal(result.advanced_metrics.diagnostics.demolition_events_counted, null);
  assert.equal(result.playerResults[0].advanced_statistics.demolitions_inflicted, null);
  assert.equal(result.playerResults[1].advanced_statistics.demolitions_taken, null);
  assert.equal(result.advanced_metrics.metric_availability.demolitions.status, "unavailable");
  assert.ok(result.warnings.some((item) => item.code === "DEMOLITION_COUNTER_MISMATCH"));
});

test("does not treat absent overtime evidence as regulation", () => {
  const decoded = {
    objects,
    names: ["Countdown", "Active", "PostGoalScored"],
    properties: { Team0Score: 1, Team1Score: 0 },
    network_frames: { frames: [
      { time: 0, new_actors: [], updated_actors: [update(99, 8, { Int: 1 }), update(99, 10, { Int: 300 })], deleted_actors: [] },
      { time: 10, new_actors: [], updated_actors: [], deleted_actors: [] },
    ] },
  };
  const result = analyzeNetworkReplay(decoded, []);
  assert.equal(result.timing.overtime, null);
  assert.equal(result.timing.overtime_seconds, null);
  assert.equal(result.timing.playing_duration_seconds, null);
});

test("synthetic pause and forfeit intervals stay diagnostic, not official duration", () => {
  const decoded = {
    objects,
    names: ["Countdown", "Active", "PostGoalScored"],
    properties: { Team0Score: 1, Team1Score: 0 },
    network_frames: { frames: [
      { time: 0, new_actors: [], updated_actors: [update(99, 8, { Int: 1 }), update(99, 10, { Int: 300 })], deleted_actors: [] },
      { time: 5, new_actors: [], updated_actors: [update(99, 13, { Boolean: true })], deleted_actors: [] },
      { time: 10, new_actors: [], updated_actors: [update(99, 13, { Boolean: false })], deleted_actors: [] },
      { time: 15, new_actors: [], updated_actors: [update(99, 14, { Boolean: true })], deleted_actors: [] },
    ] },
  };
  const result = analyzeNetworkReplay(decoded, []);
  // Forfeit/clock evidence without an explicit negative OT state cannot prove regulation.
  assert.equal(result.timing.overtime, null);
  assert.equal(result.timing.ended_by, "forfeit");
  assert.equal(result.timing.playing_duration_seconds, null);
  assert.equal(result.timing.pause_seconds, null);
  assert.equal(result.advanced_metrics.diagnostics.timing.active_state_interval_seconds, 10);
  assert.equal(result.advanced_metrics.diagnostics.timing.stop_countdown_signal_interval_seconds, 5);
  assert.equal(result.advanced_metrics.metric_availability.playing_duration_seconds.status, "unavailable");
  assert.equal(result.advanced_metrics.metric_availability.pause_seconds.status, "unavailable");
});

test("zero clock and a decisive header do not prove no overtime in an incomplete network recording", () => {
  const result = analyzeNetworkReplay({
    objects,
    names: ["Countdown", "Active", "PostGoalScored"],
    properties: { Team0Score: 3, Team1Score: 2 },
    network_frames: { frames: [
      { time: 0, new_actors: [], updated_actors: [update(99, 8, { Int: 1 }), update(99, 10, { Int: 300 })], deleted_actors: [] },
      { time: 300, new_actors: [], updated_actors: [update(99, 10, { Int: 0 })], deleted_actors: [] },
    ] },
  }, []);
  assert.equal(result.timing.overtime, null);
  assert.equal(result.timing.overtime_seconds, null);
  assert.equal(result.timing.game_clock_seconds, null);
});

test("observed overtime without a terminal boundary does not become a final overtime duration", () => {
  const result = analyzeNetworkReplay({
    objects,
    names: ["Countdown", "Active", "PostGoalScored"],
    properties: { Team0Score: 2, Team1Score: 2 },
    network_frames: { frames: [
      { time: 0, new_actors: [], updated_actors: [update(99, 8, { Int: 1 }), update(99, 11, { Boolean: true }), update(99, 10, { Int: 5 })], deleted_actors: [] },
    ] },
  }, []);
  assert.equal(result.timing.overtime, true);
  assert.equal(result.timing.overtime_seconds, null);
  assert.equal(result.advanced_metrics.metric_availability.overtime.status, "verified");
  assert.equal(result.advanced_metrics.metric_availability.overtime_seconds.status, "unavailable");
});

test("every timing metric has explicit availability even without network frames", () => {
  const result = analyzeNetworkReplay({ network_frames: null }, scoreboardPlayers);
  for (const field of ["overtime", "overtime_seconds", "regulation_clock_seconds", "game_clock_seconds",
    "playing_duration_seconds", "zero_second_play_seconds", "pause_seconds", "ended_by"]) {
    assert.equal(result.advanced_metrics.metric_availability[field].status, "unavailable");
  }
});

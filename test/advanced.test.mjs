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
  assert.equal(result.timing.overtime, false);
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

function aliasFixture({ headerPlatform = "dingo", networkPlatform = "Xbox",
  headerId = "2535439024683935", networkId = headerId, networkName = "Renamed",
  duplicateHeader = false } = {}) {
  const players = [
    { replay_name: "ABC123EBR", platform: headerPlatform, platform_user_id: headerId, team_color: "blue" },
    { replay_name: "Bravo", platform: "steam", platform_user_id: "200", team_color: "orange" },
  ];
  if (duplicateHeader) players.push({ ...players[0] });
  const decoded = {
    objects, names: ["Active"], properties: {},
    network_frames: { frames: [
      { time: 0,
        new_actors: [actor(1, 2), actor(2, 3), actor(10, 0), actor(11, 0), actor(20, 1), actor(21, 1)],
        updated_actors: [
          update(99, 8, { Int: 0 }),
          update(10, 4, { String: networkName }),
          update(10, 5, { UniqueId: { remote_id: { [networkPlatform]: networkId } } }),
          update(10, 6, active(1)),
          update(11, 5, { UniqueId: { remote_id: { Steam: "200" } } }),
          update(11, 6, active(2)),
          update(20, 7, active(10)), update(21, 7, active(11)),
        ], deleted_actors: [],
      },
      { time: 1, new_actors: [], updated_actors: [update(99, 9, demo(20, 21))], deleted_actors: [] },
    ] },
  };
  return { decoded, players };
}

test("Dingo and Xbox match exact stable IDs without requiring matching display names", () => {
  for (const headerPlatform of ["dingo", "xbox"]) {
    const { decoded, players } = aliasFixture({ headerPlatform });
    const before = structuredClone(players);
    const result = analyzeNetworkReplay(decoded, players);
    assert.equal(result.advanced_metrics.diagnostics.player_identities_resolved, 2);
    assert.equal(result.advanced_metrics.diagnostics.unresolved_demolition_events, 0);
    assert.equal(result.advanced_metrics.diagnostics.demolition_events_counted, 1);
    assert.deepEqual(result.advanced_metrics.diagnostics.recorded_demo_counter_mismatches, []);
    assert.deepEqual(result.playerResults.map((p) => [
      p.advanced_statistics.demolitions_inflicted, p.advanced_statistics.demolitions_taken,
    ]), [[1, 0], [0, 1]]);
    assert.deepEqual(players, before);
  }
});

test("Dingo/Xbox alias never substitutes a differing stable ID based on the same name", () => {
  const { decoded, players } = aliasFixture({ networkId: "2535439024683936", networkName: "ABC123EBR" });
  const result = analyzeNetworkReplay(decoded, players);
  assert.equal(result.playerResults[0].identity, null);
  assert.equal(result.advanced_metrics.diagnostics.player_identities_resolved, 1);
  assert.ok(result.advanced_metrics.diagnostics.unresolved_demolition_events > 0);
  assert.equal(result.advanced_metrics.diagnostics.demolition_events_counted, null);
  assert.equal(result.playerResults[0].advanced_statistics.demolitions_inflicted, null);
  assert.equal(result.playerResults[1].advanced_statistics.demolitions_taken, null);
});

test("PS4 and PlayStation retain exact-ID alias matching", () => {
  for (const headerPlatform of ["ps4", "playstation"]) {
    const { decoded, players } = aliasFixture({ headerPlatform, networkPlatform: "PlayStation" });
    const result = analyzeNetworkReplay(decoded, players);
    assert.equal(result.advanced_metrics.diagnostics.player_identities_resolved, 2);
    assert.equal(result.advanced_metrics.diagnostics.unresolved_demolition_events, 0);
    assert.equal(result.advanced_metrics.diagnostics.demolition_events_counted, 1);
  }
});

test("Dingo/Xbox alias preserves duplicate header-account ambiguity safeguards", () => {
  const { decoded, players } = aliasFixture({ duplicateHeader: true });
  const result = analyzeNetworkReplay(decoded, players);
  assert.equal(result.advanced_metrics.diagnostics.demolition_events_counted, null);
  assert.equal(result.advanced_metrics.metric_availability.demolitions.status, "unavailable");
  assert.ok(result.playerResults.every((p) => p.advanced_statistics.demolitions_inflicted === null));
});

const selfCounter = objects.length;
const takenCounter = selfCounter + 1;
const extendedDemo = selfCounter + 2;
const inactive = { active: false, actor: -1 };

function detachmentFixture() {
  const { decoded, players } = aliasFixture();
  decoded.objects = [...objects,
    "TAGame.PRI_TA:SelfDemolitions",
    "TAGame.PRI_TA:MatchTimesDemolished",
    "TAGame.Car_TA:ReplicatedDemolishExtended",
  ];
  const frames = decoded.network_frames.frames;
  const payload = {
    attacker: { ...inactive },
    attacker_pri: { ...inactive },
    self_demo: { ...inactive },
    self_demolish: false,
    goal_explosion_owner: { ...inactive },
    victim: { active: true, actor: 21 },
    attacker_velocity: { x: 0, y: 0, z: 0 },
    victim_velocity: { x: 0, y: 0, z: 0 },
  };
  const detachments = [
    update(11, 6, { ActiveActor: inactive }),
    update(21, 7, { ActiveActor: inactive }),
    update(11, selfCounter, { Int: 1 }),
  ];
  frames[1].updated_actors = [...detachments, update(21, extendedDemo, { DemolishExtended: payload })];
  frames.push({ time: 2, deleted_actors: [21] });
  return { decoded, players, frames, detachments, payload };
}

function assertUnresolvedDemolition({ decoded, players }) {
  const result = analyzeNetworkReplay(decoded, players);
  const diagnostics = result.advanced_metrics.diagnostics;
  assert.equal(diagnostics.unresolved_demolition_events, 1);
  assert.equal(diagnostics.demolition_events_counted, null);
  assert.deepEqual(diagnostics.team_detachment_removal_evidence, []);
  assert.ok(result.warnings.some((w) => w.code === "DEMOLITION_ATTRIBUTION_INCOMPLETE"));
  assert.ok(result.playerResults.every((p) => p.advanced_statistics.demolitions_inflicted === null
    && p.advanced_statistics.demolitions_taken === null));
}

test("retains evidence for a single removal across duplicate updates and counts a reused car generation", () => {
  const { decoded, players, frames, payload } = detachmentFixture();
  frames.splice(2, 0, { time: 1.5, updated_actors: [structuredClone(frames[1].updated_actors.at(-1))] });
  frames[3].deleted_actors.push(11);
  frames.push({
    time: 3,
    new_actors: [actor(11, 0), actor(21, 1)],
    updated_actors: [
      update(11, 5, { UniqueId: { remote_id: { Steam: "200" } } }),
      update(11, 6, active(2)),
      update(11, selfCounter, { Int: 1 }),
      update(21, 7, active(11)),
      update(21, 9, demo(20, 21)),
      update(11, takenCounter, { Int: 1 }),
    ],
  });
  const result = analyzeNetworkReplay(decoded, players);
  const diagnostics = result.advanced_metrics.diagnostics;
  assert.equal(diagnostics.demolition_events_detected, 2);
  assert.equal(diagnostics.demolition_events_counted, 1);
  assert.equal(diagnostics.unresolved_demolition_events, 0);
  assert.equal(diagnostics.repeated_demolition_updates_ignored, 1);
  assert.deepEqual(diagnostics.recorded_demo_counter_mismatches, []);
  assert.deepEqual(diagnostics.team_detachment_removal_evidence, [{
    victim_car_key: "21:1",
    victim_pri_key: "11:1",
    previous_team_actor_key: "2:1",
    self_demolitions_counter: { before: null, value: 1 },
    match_times_demolished_updated: false,
    raw_attribute: { DemolishExtended: payload },
    frame_index: 1,
    replay_seconds: 1,
    car_deleted_replay_seconds: 2,
    official_event_counted: false,
  }]);
  assert.deepEqual(result.playerResults.map((p) => [
    p.advanced_statistics.demolitions_inflicted, p.advanced_statistics.demolitions_taken,
  ]), [[1, 0], [0, 1]]);
});

test("a missing attacker does not resolve a demolition with incomplete or contradictory removal evidence", async (t) => {
  const cases = [
    ["missing team detachment", ({ frames }) => frames[1].updated_actors.splice(0, 1)],
    ["missing car detachment", ({ frames }) => frames[1].updated_actors.splice(1, 1)],
    ["missing self counter", ({ frames }) => frames[1].updated_actors.splice(2, 1)],
    ["repeated self counter value", ({ frames }) => frames[0].updated_actors.push(update(11, selfCounter, { Int: 1 }))],
    ["counter on a different PRI", ({ detachments }) => { detachments[2].actor_id = 10; }],
    ["ordinary victim counter update", ({ frames }) => frames[1].updated_actors.push(update(11, takenCounter, { Int: 1 }))],
    ["invalid ordinary victim counter update", ({ frames }) => frames[1].updated_actors.push(update(11, takenCounter, { Int: -1 }))],
    ["missing velocity", ({ payload }) => { delete payload.victim_velocity; }],
    ["nonzero velocity", ({ payload }) => { payload.victim_velocity.x = 1; }],
    ["missing car deletion", ({ frames }) => { frames.pop(); }],
    ["car reattached before deletion", ({ frames }) => {
      frames.splice(2, 0, { time: 1.5, updated_actors: [update(21, 7, active(11))] });
    }],
    ["a deletion of a replacement car", ({ decoded, frames }) => {
      decoded.objects.push("Archetypes.Car.Car_Replacement");
      frames[2].new_actors = [actor(21, decoded.objects.length - 1)];
    }],
  ];
  for (const [name, mutate] of cases) {
    await t.test(name, () => {
      const fixture = detachmentFixture();
      mutate(fixture);
      assertUnresolvedDemolition(fixture);
    });
  }
});

test("a live attacker reference that cannot resolve to a player still blocks verification", () => {
  const fixture = detachmentFixture();
  fixture.payload.attacker = { active: true, actor: 80 };
  fixture.frames[0].new_actors.push(actor(80, 1));
  assertUnresolvedDemolition(fixture);
});

test("a conflicting same-generation demolition cannot be hidden as a repeated removal", () => {
  const fixture = detachmentFixture();
  fixture.frames.splice(2, 0, { time: 1.5, updated_actors: [update(21, 9, demo(80, 21))] });
  assertUnresolvedDemolition(fixture);
});

test("a replacement PRI generation cannot corroborate the detached car's previous owner", () => {
  const fixture = detachmentFixture();
  fixture.frames.splice(1, 0, { time: 0.5, deleted_actors: [11] });
  const removal = fixture.frames[2];
  removal.new_actors = [actor(11, 0)];
  removal.updated_actors.unshift(update(11, 5, { UniqueId: { remote_id: { Steam: "200" } } }),
    update(11, 6, active(2)));
  assertUnresolvedDemolition(fixture);
});

test("one self-counter step cannot corroborate two different victim cars", () => {
  const { decoded, players, frames, payload } = detachmentFixture();
  frames[0].new_actors.push(actor(22, 1));
  frames[0].updated_actors.push(update(22, 7, active(11)));
  frames[1].updated_actors.push(update(22, 7, { ActiveActor: inactive }),
    update(22, extendedDemo, { DemolishExtended: { ...payload, victim: { active: true, actor: 22 } } }));
  frames[2].deleted_actors.push(22);
  const { diagnostics } = analyzeNetworkReplay(decoded, players).advanced_metrics;
  assert.equal(diagnostics.unresolved_demolition_events, 2);
  assert.equal(diagnostics.demolition_events_counted, null);
  assert.deepEqual(diagnostics.team_detachment_removal_evidence, []);
});

test("a corroborated removal cannot account for an unexplained competitive counter", () => {
  const { decoded, players, frames } = detachmentFixture();
  frames[2].updated_actors = [update(11, takenCounter, { Int: 1 })];
  const result = analyzeNetworkReplay(decoded, players);
  const diagnostics = result.advanced_metrics.diagnostics;
  assert.equal(diagnostics.team_detachment_removal_evidence.length, 1);
  assert.equal(diagnostics.unresolved_demolition_events, 0);
  assert.equal(diagnostics.demolition_events_counted, null);
  assert.equal(diagnostics.recorded_demo_counter_mismatches.length, 1);
  assert.ok(result.warnings.some((w) => w.code === "DEMOLITION_COUNTER_MISMATCH"));
  assert.ok(result.playerResults.every((p) => p.advanced_statistics.demolitions_taken === null));
});

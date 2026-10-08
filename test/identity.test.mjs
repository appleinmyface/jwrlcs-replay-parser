import assert from "node:assert/strict";
import test from "node:test";
import { normalizeReplay, normalizeSeries } from "../src/normalize.mjs";
import { analyzeNetworkReplay } from "../src/advanced.mjs";

function headerPlayer(overrides) {
  return { Name: "Review Me", Platform: { value: "OnlinePlatform_Epic" },
    OnlineID: "0", Team: 0, Score: 0, Goals: 0, Assists: 0, Saves: 0, Shots: 0,
    ...overrides };
}

test("reads nested account IDs as strings and rejects unsafe numeric IDs", () => {
  const decoded = { properties: { Team0Score: 1, Team1Score: 0, PlayerStats: [
    headerPlayer({ PlayerID: { name: "UniqueNetId", fields: { EpicAccountId: "fixture-epic-account" } } }),
    headerPlayer({ Name: "Large ID", Platform: { value: "OnlinePlatform_Steam" }, OnlineID: "76561198261838712" }),
    headerPlayer({ Name: "Unsafe", OnlineID: Number.MAX_SAFE_INTEGER + 1 }),
  ] }, network_frames: null };
  const game = normalizeReplay({ fileName: "synthetic.replay", bytes: Buffer.alloc(0), decoded });
  assert.equal(game.players[0].platform_user_id, "fixture-epic-account");
  assert.equal(game.players[1].platform_user_id, "76561198261838712");
  assert.equal(game.players[2].platform_user_id, null);
  assert.equal(game.players[2].identity_status, "manual_mapping_required");
  assert.ok(game.players.every((p) => p.advanced_statistics.demolitions_inflicted === null));
});

test("same display name alone cannot resolve an unknown or contradictory account", () => {
  const decoded = {
    objects: ["TAGame.PRI_TA", "Engine.PlayerReplicationInfo:PlayerName", "Engine.PlayerReplicationInfo:UniqueId"],
    properties: {}, network_frames: { frames: [{ time: 0,
      new_actors: [{ actor_id: 10, object_id: 0 }], deleted_actors: [],
      updated_actors: [
        { actor_id: 10, object_id: 1, attribute: { String: "Same Name" } },
        { actor_id: 10, object_id: 2, attribute: { UniqueId: { remote_id: { Epic: "real-account" } } } },
      ] }] },
  };
  for (const platform_user_id of [null, "different-account"]) {
    const result = analyzeNetworkReplay(decoded, [{ replay_name: "Same Name", platform: "epic", team_color: null, platform_user_id }]);
    assert.equal(result.playerResults[0].identity, null);
    assert.equal(result.playerResults[0].advanced_statistics.demolitions_inflicted, null);
  }
});

test("unresolved same-name rows remain separately reviewable", () => {
  const decoded = { properties: { PlayerStats: [headerPlayer({}), headerPlayer({ Team: 1 })] } };
  const game = normalizeReplay({ fileName: "synthetic.replay", bytes: Buffer.alloc(0), decoded });
  assert.equal(game.players.length, 2);
  assert.equal(normalizeSeries([game]).required_review.unresolved_player_count, 2);
});

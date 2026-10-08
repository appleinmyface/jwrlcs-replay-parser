import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { parseReplayFiles } from "../src/parser.mjs";
import { decodeReplay } from "../src/engine.mjs";
import { BoxcarsParser, NetworkParse } from "@jwrlcs/boxcars-wasm";

const fixtureDirectory = process.env.REPLAY_FIXTURE_DIR;

test("normalizes the verified seven-game 3v3 series", { skip: !fixtureDirectory }, () => {
  const files = fs.readdirSync(fixtureDirectory)
    .filter((name) => name.toLowerCase().endsWith(".replay"))
    .map((name) => ({ name, bytes: fs.readFileSync(path.join(fixtureDirectory, name)) }));
  const series = parseReplayFiles(files, "test-match-id");

  assert.equal(series.contract_version, "0.3.0");
  assert.equal(series.parser_engine.name, "@jwrlcs/boxcars-wasm");
  assert.equal(series.parser_engine.version, "0.1.0");
  assert.equal(series.parser_engine.rust_boxcars_version, "0.12.0");
  assert.equal(series.required_review.scheduled_match_id, "test-match-id");
  assert.equal(series.game_count, 7);
  assert.equal(series.games.flatMap((game) => game.players).length, 42);
  assert.deepEqual(series.provisional_color_score, { blue_wins: 4, orange_wins: 3 });
  assert.deepEqual(
    series.games.map((game) => [game.final_score.blue, game.final_score.orange]),
    [[1, 5], [2, 5], [3, 2], [3, 2], [2, 0], [2, 3], [5, 0]],
  );
  assert.equal(series.required_review.unresolved_player_count, 0);
  const gameFiveProgram = series.games[4].players
    .find((player) => player.replay_name === "The 1st PROGRAM");
  assert.equal(gameFiveProgram.statistics.goals, 1);
  assert.equal(gameFiveProgram.statistics.shots, 0);
  assert.ok(series.games[4].warnings.some((item) => item.code === "GOALS_EXCEED_SHOTS"));

  // The five existing scoreboard fields remain direct replay-header values.
  assert.deepEqual(gameFiveProgram.statistics, {
    score: 312,
    goals: 1,
    assists: 0,
    saves: 2,
    shots: 0,
  });

  const expectedDemos = {
    CDFC47E540D86EDE93F9DEA21237A4D9: {
      "DCXD.": [2, 1], "The 1st PROGRAM": [0, 2], "Carter.": [3, 2],
      "schmeater meister": [0, 4], Lobo: [1, 0], "Estach.": [3, 0],
    },
    E7797F9E42C7F4DEDBBC7C8649EBAAF4: {
      "DCXD.": [2, 3], "The 1st PROGRAM": [1, 1], "Estach.": [4, 1],
      "schmeater meister": [1, 1], Lobo: [1, 1], "Carter.": [0, 2],
    },
    A24859B640BF09ADB4BEA99A85621AF3: {
      "DCXD.": [3, 2], "Estach.": [1, 0], "Carter.": [2, 1], Lobo: [0, 1],
      "The 1st PROGRAM": [1, 3], "schmeater meister": [2, 2],
    },
    "8A4F11A94D99212BF503C9A034869234": {
      Lobo: [0, 0], "schmeater meister": [0, 0], "Estach.": [1, 0],
      "Carter.": [0, 1], "The 1st PROGRAM": [1, 1], "DCXD.": [1, 1],
    },
    "1F5FE3AA4D16641F2B03BF9A0E7D87F1": {
      "DCXD.": [0, 3], "Carter.": [2, 0], "The 1st PROGRAM": [1, 1],
      "Estach.": [1, 1], "schmeater meister": [2, 2], Lobo: [2, 1],
    },
    "46E29CE349B7A73BDBF35CA2D3500FB7": {
      "schmeater meister": [1, 3], "Carter.": [2, 1], "Estach.": [4, 3],
      "DCXD.": [3, 3], "The 1st PROGRAM": [0, 1], Lobo: [2, 1],
    },
    "57DCF3AE451939092504A88BA7D782B5": {
      "Carter.": [0, 4], "DCXD.": [0, 1], "The 1st PROGRAM": [0, 1],
      "Estach.": [5, 0], "schmeater meister": [1, 0], Lobo: [1, 1],
    },
  };

  for (const game of series.games) {
    const fixtureId = game.source_file_name.replace(/\.replay$/i, "");
    assert.equal(game.advanced_metrics.metric_availability.demolitions.status, "verified");
    assert.equal(game.advanced_metrics.diagnostics.unresolved_demolition_events, 0);
    for (const player of game.players) {
      assert.deepEqual(
        [
          player.advanced_statistics.demolitions_inflicted,
          player.advanced_statistics.demolitions_taken,
        ],
        expectedDemos[fixtureId][player.replay_name],
      );
      assert.equal(player.advanced_statistics.is_mvp, null);
      assert.equal(player.metric_availability.mvp.status, "unsupported");
    }
    const raw = decodeReplay(files.find((file) => file.name === game.source_file_name).bytes, { network: false });
    const strict = new BoxcarsParser(files.find((file) => file.name === game.source_file_name).bytes)
      .setNetworkParse(NetworkParse.Always).parse();
    assert.equal(strict.network_frames.frames.length, strict.properties.NumFrames);
    for (const player of game.players) {
      const headerPlayer = raw.properties.PlayerStats.find((item) => item.Name === player.replay_name);
      assert.deepEqual(player.statistics, {
        score: headerPlayer.Score ?? 0, goals: headerPlayer.Goals ?? 0,
        assists: headerPlayer.Assists ?? 0, saves: headerPlayer.Saves ?? 0, shots: headerPlayer.Shots ?? 0,
      });
    }
    for (const field of ["overtime", "overtime_seconds", "regulation_clock_seconds", "game_clock_seconds",
      "playing_duration_seconds", "zero_second_play_seconds", "pause_seconds", "ended_by"]) {
      assert.ok(game.advanced_metrics.metric_availability[field]);
    }
  }

  const overtimeGame = series.games[3];
  assert.equal(overtimeGame.timing.overtime, true);
  assert.equal(overtimeGame.timing.overtime_seconds, 36);
  assert.equal(overtimeGame.timing.regulation_clock_seconds, 300);
  assert.equal(overtimeGame.timing.game_clock_seconds, 336);
  assert.equal(overtimeGame.timing.playing_duration_seconds, null);
  assert.equal(overtimeGame.timing.zero_second_play_seconds, null);
  assert.equal(overtimeGame.advanced_metrics.validation_status, "partial");
  assert.equal(overtimeGame.advanced_metrics.diagnostics.timing.active_state_interval_seconds, 347.772);
  assert.equal(overtimeGame.advanced_metrics.diagnostics.timing.zero_clock_transition_interval_seconds, 0.175);
  assert.equal(overtimeGame.advanced_metrics.diagnostics.timing.active_intervals.length, 6);
  assert.equal(overtimeGame.timing.ended_by, "overtime_goal");
  assert.equal(overtimeGame.advanced_metrics.diagnostics.repeated_demolition_updates_ignored, 1);
  assert.equal(overtimeGame.advanced_metrics.diagnostics.non_gameplay_demolition_updates_ignored, 1);

  for (const game of series.games.filter((item) => item.game_number !== 4)) {
    assert.equal(game.timing.overtime, null);
    assert.equal(game.timing.overtime_seconds, null);
    assert.equal(game.timing.playing_duration_seconds, null);
    assert.ok(game.warnings.some((item) => item.code === "PLAYING_DURATION_UNVERIFIED"));
  }
});

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { parseReplayFiles } from "../src/parser.mjs";

const fixtureDirectory = process.env.REPLAY_FIXTURE_DIR;

test("normalizes the verified seven-game 3v3 series", { skip: !fixtureDirectory }, () => {
  const files = fs.readdirSync(fixtureDirectory)
    .filter((name) => name.toLowerCase().endsWith(".replay"))
    .map((name) => ({ name, bytes: fs.readFileSync(path.join(fixtureDirectory, name)) }));
  const series = parseReplayFiles(files, "test-match-id");

  assert.equal(series.contract_version, "0.2.0");
  assert.equal(series.required_review.scheduled_match_id, "test-match-id");
  assert.equal(series.game_count, 7);
  assert.deepEqual(series.provisional_color_score, { blue_wins: 4, orange_wins: 3 });
  assert.deepEqual(
    series.games.map((game) => [game.final_score.blue, game.final_score.orange]),
    [[1, 5], [2, 5], [3, 2], [3, 2], [2, 0], [2, 3], [5, 0]],
  );
  assert.equal(series.required_review.unresolved_player_count, 2);
  const gameFiveProgram = series.games[4].players
    .find((player) => player.replay_name === "The 1st PROGRAM");
  assert.equal(gameFiveProgram.statistics.goals, 1);
  assert.equal(gameFiveProgram.statistics.shots, 0);
  assert.ok(series.games[4].warnings.some((item) => item.code === "GOALS_EXCEED_SHOTS"));
});

import { decodeReplay } from "./engine.mjs";
import { normalizeReplay, normalizeSeries } from "./normalize.mjs";
import { HttpError } from "./errors.mjs";

export function parseReplayFiles(files, scheduledMatchId = null) {
  const games = files.map(({ name, bytes }) => {
    try {
      return normalizeReplay({
        fileName: name,
        bytes,
        decoded: decodeReplay(bytes),
      });
    } catch {
      throw new HttpError(
        422,
        "REPLAY_PARSE_FAILED",
        `Could not parse ${name}. Confirm that it is a valid Rocket League replay file.`,
        { file_name: name },
      );
    }
  });

  const series = normalizeSeries(games, scheduledMatchId);
  const duplicate = series.series_warnings.find((item) => item.code === "DUPLICATE_REPLAY_HASH");
  if (duplicate) {
    throw new HttpError(409, "DUPLICATE_REPLAY_HASH", duplicate.message);
  }
  return series;
}

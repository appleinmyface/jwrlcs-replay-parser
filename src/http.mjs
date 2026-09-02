import { HttpError, publicError } from "./errors.mjs";
import { requireAdministrator } from "./auth.mjs";
import { parseReplayFiles } from "./parser.mjs";

function numberSetting(name, fallback) {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function originPatternMatches(origin, pattern) {
  if (pattern === origin) return true;
  if (!pattern.includes("*")) return false;
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replaceAll("*", ".*");
  return new RegExp(`^${escaped}$`).test(origin);
}

export function isOriginAllowed(origin, configured = process.env.ALLOWED_ORIGINS ?? "") {
  if (!origin) return true;
  return configured
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .some((pattern) => originPatternMatches(origin, pattern));
}

function corsHeaders(origin) {
  return {
    ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function sendJson(response, status, body, headers = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...headers,
  });
  response.end(JSON.stringify(body));
}

async function readReplayForm(nodeRequest) {
  const maxReplayBytes = numberSetting("MAX_REPLAY_BYTES", 10 * 1024 * 1024);
  const maxSeriesBytes = numberSetting("MAX_SERIES_BYTES", 70 * 1024 * 1024);
  const maxReplayFiles = numberSetting("MAX_REPLAY_FILES", 7);
  const contentLength = Number(nodeRequest.headers["content-length"] ?? 0);
  if (contentLength > maxSeriesBytes) {
    throw new HttpError(413, "SERIES_TOO_LARGE", "The replay upload is larger than the server limit.");
  }

  const request = new Request(`http://localhost${nodeRequest.url}`, {
    method: nodeRequest.method,
    headers: nodeRequest.headers,
    body: nodeRequest,
    duplex: "half",
  });
  let form;
  try {
    form = await request.formData();
  } catch {
    throw new HttpError(422, "INVALID_MULTIPART", "Upload the replay files as multipart form data.");
  }

  const candidates = [...form.entries()]
    .map(([, value]) => value)
    .filter((value) => value && typeof value.arrayBuffer === "function" && typeof value.name === "string");
  if (candidates.length === 0) {
    throw new HttpError(422, "NO_REPLAYS", "Select at least one .replay file.");
  }
  if (candidates.length > maxReplayFiles) {
    throw new HttpError(422, "TOO_MANY_REPLAYS", `A series can contain at most ${maxReplayFiles} replay files.`);
  }

  let totalBytes = 0;
  const files = [];
  for (const file of candidates) {
    if (!file.name.toLowerCase().endsWith(".replay")) {
      throw new HttpError(422, "INVALID_FILE_TYPE", `${file.name} is not a .replay file.`);
    }
    if (file.size === 0) {
      throw new HttpError(422, "EMPTY_REPLAY", `${file.name} is empty.`);
    }
    if (file.size > maxReplayBytes) {
      throw new HttpError(413, "REPLAY_TOO_LARGE", `${file.name} is larger than the per-file limit.`);
    }
    totalBytes += file.size;
    if (totalBytes > maxSeriesBytes) {
      throw new HttpError(413, "SERIES_TOO_LARGE", "The replay upload is larger than the server limit.");
    }
    files.push({ name: file.name, bytes: Buffer.from(await file.arrayBuffer()) });
  }

  const matchId = String(form.get("match_id") ?? form.get("matchId") ?? "").trim() || null;
  return { files, matchId };
}

export async function handleRequest(request, response) {
  const origin = request.headers.origin ?? "";
  if (!isOriginAllowed(origin)) {
    return sendJson(response, 403, {
      error: "ORIGIN_NOT_ALLOWED",
      message: "This website origin is not allowed to use the replay parser.",
    });
  }
  const cors = corsHeaders(origin);

  if (request.method === "OPTIONS") {
    response.writeHead(204, cors);
    return response.end();
  }
  if (request.method === "GET" && request.url === "/health") {
    return sendJson(response, 200, { ok: true, service: "jwrlcs-replay-parser", contract_version: "0.2.0" });
  }
  if (request.method !== "POST" || request.url?.split("?")[0] !== "/parse-series") {
    return sendJson(response, 404, { error: "NOT_FOUND", message: "Route not found." }, cors);
  }

  try {
    await requireAdministrator(request.headers.authorization);
    const { files, matchId } = await readReplayForm(request);
    const parsed = parseReplayFiles(files, matchId);
    return sendJson(response, 200, parsed, cors);
  } catch (error) {
    const result = publicError(error);
    return sendJson(response, result.status, result.body, cors);
  }
}

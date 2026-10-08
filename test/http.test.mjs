import assert from "node:assert/strict";
import test from "node:test";
import { bearerToken } from "../src/auth.mjs";
import { isOriginAllowed } from "../src/http.mjs";
import { createReplayServer } from "../src/server.mjs";

test("accepts exact and wildcard configured origins", () => {
  const configured = "https://jwrlcs.com,https://*.vibepreview.com";
  assert.equal(isOriginAllowed("https://jwrlcs.com", configured), true);
  assert.equal(isOriginAllowed("https://preview-123.vibepreview.com", configured), true);
  assert.equal(isOriginAllowed("https://attacker.example", configured), false);
});

test("extracts bearer tokens and rejects missing authorization", () => {
  assert.equal(bearerToken("Bearer test-token"), "test-token");
  assert.throws(() => bearerToken(""), (error) => error.status === 401);
});

test("serves the health contract", async () => {
  const server = createReplayServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true,
      service: "jwrlcs-replay-parser",
      contract_version: "0.3.0",
    });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("denies unauthenticated parsing without reading or saving a replay", async () => {
  const server = createReplayServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/parse-series`, { method: "POST" });
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error, "AUTH_REQUIRED");
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

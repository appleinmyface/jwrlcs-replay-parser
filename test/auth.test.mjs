import assert from "node:assert/strict";
import test from "node:test";
import { requireAdministrator } from "../src/auth.mjs";

test("preserves server-validated owner/administrator auth and rejects ordinary or disabled profiles", async () => {
  const oldFetch = globalThis.fetch;
  const previous = Object.fromEntries(["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "ADMIN_PROFILE_USER_COLUMN"]
    .map((name) => [name, process.env[name]]));
  process.env.SUPABASE_URL = "https://auth-test.invalid";
  process.env.SUPABASE_PUBLISHABLE_KEY = "publishable-test-placeholder";
  process.env.ADMIN_PROFILE_USER_COLUMN = "user_id";
  const requests = [];
  let role = "administrator";
  let disabled = false;
  globalThis.fetch = async (url, options) => {
    requests.push({ url, headers: options.headers });
    if (url.endsWith("/auth/v1/user")) return new Response(JSON.stringify({
      id: "qa-auth-fixture", user_metadata: { role: "owner", is_admin: true },
    }));
    return new Response(JSON.stringify([{
      administrator_role: role, is_verified: true, verified_at: "2026-10-08T00:00:00Z",
      disabled_at: disabled ? "2026-10-08T00:01:00Z" : null,
    }]));
  };
  try {
    await assert.rejects(requireAdministrator(""), (error) => error.status === 401);
    assert.equal((await requireAdministrator("Bearer test-token")).role, "administrator");
    role = "owner";
    assert.equal((await requireAdministrator("Bearer test-token")).role, "owner");
    role = "ordinary-user";
    await assert.rejects(requireAdministrator("Bearer test-token"), (error) => error.status === 403);
    role = "owner"; disabled = true;
    await assert.rejects(requireAdministrator("Bearer test-token"), (error) => error.status === 403);
    assert.ok(requests.every(({ headers }) => headers.apikey === "publishable-test-placeholder"));
    assert.ok(requests.some(({ url }) => url.includes("user_id=eq.qa-auth-fixture")));
  } finally {
    globalThis.fetch = oldFetch;
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});

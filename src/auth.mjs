import { HttpError } from "./errors.mjs";

export function bearerToken(authorization) {
  const match = /^Bearer\s+(.+)$/i.exec(authorization ?? "");
  if (!match) {
    throw new HttpError(401, "AUTH_REQUIRED", "Sign in as a verified administrator before parsing replays.");
  }
  return match[1].trim();
}

function requireEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new HttpError(500, "SERVER_NOT_CONFIGURED", `The parser server is missing ${name}.`);
  }
  return value.replace(/\/$/, "");
}

async function readJson(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

export async function requireAdministrator(authorization) {
  const token = bearerToken(authorization);
  const supabaseUrl = requireEnvironment("SUPABASE_URL");
  const publishableKey = requireEnvironment("SUPABASE_PUBLISHABLE_KEY");
  const authHeaders = {
    apikey: publishableKey,
    Authorization: `Bearer ${token}`,
  };

  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: authHeaders });
  const userPayload = await readJson(userResponse);
  if (!userResponse.ok || !userPayload?.id) {
    throw new HttpError(401, "INVALID_SESSION", "Your administrator session is invalid or expired. Sign in again.");
  }

  const userColumn = process.env.ADMIN_PROFILE_USER_COLUMN?.trim() || "user_id";
  if (!/^(user_id|id)$/.test(userColumn)) {
    throw new HttpError(500, "SERVER_NOT_CONFIGURED", "ADMIN_PROFILE_USER_COLUMN must be user_id or id.");
  }
  const query = new URLSearchParams({
    select: "administrator_role,is_verified,verified_at,disabled_at",
    [userColumn]: `eq.${userPayload.id}`,
    limit: "1",
  });
  const profileResponse = await fetch(`${supabaseUrl}/rest/v1/administrator_profiles?${query}`, {
    headers: authHeaders,
  });
  const profiles = await readJson(profileResponse);
  if (!profileResponse.ok) {
    throw new HttpError(500, "ADMIN_LOOKUP_FAILED", "The parser could not verify administrator access.");
  }

  const profile = Array.isArray(profiles) ? profiles[0] : null;
  const allowedRole = profile?.administrator_role === "owner"
    || profile?.administrator_role === "administrator";
  if (!profile || !allowedRole || profile.is_verified !== true || !profile.verified_at || profile.disabled_at) {
    throw new HttpError(403, "ADMIN_REQUIRED", "This account is not an active, verified JWRLCS administrator.");
  }

  return { userId: userPayload.id, role: profile.administrator_role };
}

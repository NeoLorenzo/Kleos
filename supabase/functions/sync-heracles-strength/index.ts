import { createClient } from "npm:@supabase/supabase-js@2.56.0";

const AUTHORIZED_EMAIL = "theneolorenzo@gmail.com";
const HERACLES_STRENGTH_URL =
  "https://yfhmjwkscqbpzblrpsoy.supabase.co/functions/v1/kleos-strength";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const JSON_HEADERS = {
  ...CORS_HEADERS,
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store, private, max-age=0",
  "Pragma": "no-cache",
  "X-Content-Type-Options": "nosniff",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

async function authenticateCaller(
  supabaseUrl: string,
  anonKey: string,
  authorization: string,
) {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: "GET",
    headers: {
      Authorization: authorization,
      apikey: anonKey,
    },
  });

  if (!response.ok) return null;
  const user = await response.json().catch(() => null) as { id?: string; email?: string } | null;
  const email = String(user?.email ?? "").trim().toLowerCase();
  return user?.id && email === AUTHORIZED_EMAIL ? user : null;
}

function hasExpectedContract(payload: unknown): payload is {
  contract_version: string;
  source: string;
  window_days: number;
  minimum_sessions: number;
  estimation_basis: string;
  generated_at: string;
  lifts: unknown[];
} {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const record = payload as Record<string, unknown>;
  if (record.contract_version !== "1.1.0"
    || record.source !== "heracles"
    || record.window_days !== 30
    || record.minimum_sessions !== 3
    || record.estimation_basis !== "observed_e1rm_high"
    || typeof record.generated_at !== "string"
    || !Array.isArray(record.lifts)) {
    return false;
  }

  return record.lifts.every((lift) => {
    if (!lift || typeof lift !== "object" || Array.isArray(lift)) return false;
    const row = lift as Record<string, unknown>;
    return Object.prototype.hasOwnProperty.call(row, "equipment_name")
      && (row.equipment_name === null || typeof row.equipment_name === "string");
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = req.headers.get("Authorization")?.trim() ?? "";

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: "SERVER_CONFIGURATION_ERROR" }, 500);
  }
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return json({ error: "UNAUTHORIZED" }, 401);
  }

  let caller;
  try {
    caller = await authenticateCaller(supabaseUrl, anonKey, authorization);
  } catch (_error) {
    return json({ error: "AUTHENTICATION_UNAVAILABLE" }, 503);
  }
  if (!caller?.id) {
    return json({ error: "UNAUTHORIZED" }, 401);
  }

  let sourceResponse: Response;
  try {
    sourceResponse = await fetch(HERACLES_STRENGTH_URL, {
      method: "POST",
      headers: {
        Authorization: authorization,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
  } catch (_error) {
    return json({ error: "HERACLES_UNAVAILABLE", preserved_existing_snapshot: true }, 502);
  }

  if (!sourceResponse.ok) {
    return json({
      error: "HERACLES_SYNC_FAILED",
      source_status: sourceResponse.status,
      preserved_existing_snapshot: true,
    }, 502);
  }

  const sourcePayload = await sourceResponse.json().catch(() => null);
  if (!hasExpectedContract(sourcePayload)) {
    return json({ error: "HERACLES_CONTRACT_INVALID", preserved_existing_snapshot: true }, 502);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const syncedAt = new Date().toISOString();
  const { data, error } = await admin.rpc("replace_heracles_strength_snapshot", {
    p_user_id: caller.id,
    p_snapshot: sourcePayload.lifts,
    p_synced_at: syncedAt,
  });

  if (error) {
    return json({ error: "KLEOS_PERSISTENCE_FAILED", preserved_existing_snapshot: true }, 500);
  }

  return json({
    source: "heracles",
    window_days: 30,
    minimum_sessions: 3,
    estimation_basis: "observed_e1rm_high",
    source_generated_at: sourcePayload.generated_at,
    ...((data && typeof data === "object" && !Array.isArray(data)) ? data : {}),
  });
});

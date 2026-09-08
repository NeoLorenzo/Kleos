import postgres from "npm:postgres@3.4.7";

// SHA-256 of the dedicated Shortcut token. The token itself is never committed.
const EXPECTED_TOKEN_HASH = "903582239a902fe118415c44c3eb1cc967624ffa3ad0394dafb9fc825f9a3c43";

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store, private, max-age=0",
  "Pragma": "no-cache",
  "X-Content-Type-Options": "nosniff",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  }

  const token = req.headers.get("x-kleos-bot-token")?.trim() ?? "";
  if (token.length < 32 || token.length > 256) {
    return json({ error: "UNAUTHORIZED" }, 401);
  }

  const suppliedHash = await sha256Hex(token);
  if (!constantTimeEqual(suppliedHash, EXPECTED_TOKEN_HASH)) {
    return json({ error: "UNAUTHORIZED" }, 401);
  }

  const databaseUrl = Deno.env.get("SUPABASE_DB_URL");
  if (!databaseUrl) {
    return json({ error: "SERVER_CONFIGURATION_ERROR" }, 500);
  }

  const sql = postgres(databaseUrl, {
    max: 1,
    prepare: false,
    idle_timeout: 2,
    connect_timeout: 5,
  });

  try {
    const rows = await sql`select public.get_kleos_bot_evidence_admin() as evidence`;
    const evidence = rows[0]?.evidence;
    if (!evidence || typeof evidence !== "object") {
      return json({ error: "EVIDENCE_UNAVAILABLE" }, 500);
    }

    // Methodology 1.0.0 has an explicit ten-group evidence contract. Big Five is
    // stored as canonical Kleos evidence, but must not silently change the bot's
    // evaluation inputs until a later methodology version opts into it.
    const methodologyEvidence = { ...(evidence as Record<string, unknown>) };
    delete methodologyEvidence.goat_big_five_assessments;

    return json(methodologyEvidence, 200);
  } catch (_error) {
    return json({ error: "EVIDENCE_RETRIEVAL_FAILED" }, 500);
  } finally {
    await sql.end({ timeout: 1 });
  }
});

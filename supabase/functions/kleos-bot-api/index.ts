import postgres from "npm:postgres@3.4.7";

// SHA-256 of the dedicated GPT Action token. The plaintext token is never committed.
const EXPECTED_TOKEN_HASH = "ee44f21e5394c1b05b6c15d355117895cacbef85530d20424bdb681fc599cb27";
const EVIDENCE_SCHEMA_VERSION = "3.0.0";
const METHODOLOGY_VERSION = "1.0.0";
const VECTOR_IDS = [
  "physical",
  "psychological",
  "intellectual",
  "professional",
  "financial",
  "relational",
  "creative",
  "experiential",
] as const;
const VECTOR_ID_SET = new Set<string>(VECTOR_IDS);
const ASSESSED_CONFIDENCE = new Set(["low", "medium", "high"]);

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store, private, max-age=0",
  "Pragma": "no-cache",
  "X-Content-Type-Options": "nosniff",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-kleos-bot-token, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

function suppliedToken(req: Request): string {
  const direct = req.headers.get("x-kleos-bot-token")?.trim();
  if (direct) return direct;
  const authorization = req.headers.get("authorization")?.trim() ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
}

async function isAuthorized(req: Request): Promise<boolean> {
  const token = suppliedToken(req);
  if (token.length < 32 || token.length > 256) return false;
  const suppliedHash = await sha256Hex(token);
  return constantTimeEqual(suppliedHash, EXPECTED_TOKEN_HASH);
}

function routePath(req: Request): string {
  const path = new URL(req.url).pathname.replace(/\/+$/, "");
  if (path.endsWith("/evidence")) return "/evidence";
  if (path.endsWith("/evaluations")) return "/evaluations";
  return "/";
}

function openDatabase() {
  const databaseUrl = Deno.env.get("SUPABASE_DB_URL");
  if (!databaseUrl) return null;
  return postgres(databaseUrl, {
    max: 1,
    prepare: false,
    idle_timeout: 2,
    connect_timeout: 5,
  });
}

function normalizeEvaluationBody(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false as const, error: "INVALID_REQUEST_BODY" };
  }

  const body = value as Record<string, unknown>;
  const executionKey = String(body.execution_key ?? body.executionKey ?? "").trim();
  if (!executionKey || executionKey.length > 120) {
    return { ok: false as const, error: "INVALID_EXECUTION_KEY" };
  }

  const overallRaw = body.overall_score ?? body.overallScore ?? null;
  let overallScore: number | null = null;
  if (overallRaw !== null && overallRaw !== undefined && overallRaw !== "") {
    const parsed = Number(overallRaw);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      return { ok: false as const, error: "INVALID_OVERALL_SCORE" };
    }
    overallScore = parsed;
  }

  if (!Array.isArray(body.results) || body.results.length !== VECTOR_IDS.length) {
    return { ok: false as const, error: "EIGHT_VECTOR_RESULTS_REQUIRED" };
  }

  const seen = new Set<string>();
  const results: Array<Record<string, unknown>> = [];

  for (const raw of body.results) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return { ok: false as const, error: "INVALID_VECTOR_RESULT" };
    }
    const result = raw as Record<string, unknown>;
    const vectorId = String(result.vector_id ?? result.vectorId ?? "").trim().toLowerCase();
    const status = String(result.status ?? "").trim().toLowerCase();
    const confidence = String(result.confidence ?? "").trim().toLowerCase();
    const commentary = String(result.commentary ?? "").trim();

    if (!VECTOR_ID_SET.has(vectorId) || seen.has(vectorId)) {
      return { ok: false as const, error: "INVALID_OR_DUPLICATE_VECTOR" };
    }
    seen.add(vectorId);
    if (!commentary) {
      return { ok: false as const, error: "VECTOR_COMMENTARY_REQUIRED" };
    }

    if (status === "unknown") {
      const score = result.score;
      if (!(score === null || score === undefined || score === "") || confidence !== "unknown") {
        return { ok: false as const, error: "INVALID_UNKNOWN_VECTOR" };
      }
      results.push({
        vector_id: vectorId,
        status: "unknown",
        score: null,
        confidence: "unknown",
        commentary,
      });
      continue;
    }

    if (status !== "assessed" || !ASSESSED_CONFIDENCE.has(confidence)) {
      return { ok: false as const, error: "INVALID_ASSESSED_VECTOR" };
    }
    const score = Number(result.score);
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      return { ok: false as const, error: "INVALID_VECTOR_SCORE" };
    }
    results.push({
      vector_id: vectorId,
      status: "assessed",
      score,
      confidence,
      commentary,
    });
  }

  if (VECTOR_IDS.some((id) => !seen.has(id))) {
    return { ok: false as const, error: "MISSING_CANONICAL_VECTOR" };
  }

  return {
    ok: true as const,
    value: { executionKey, overallScore, results },
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: JSON_HEADERS });
  }

  // Custom authentication happens before any database connection or privileged call.
  if (!(await isAuthorized(req))) {
    return json({ error: "UNAUTHORIZED" }, 401);
  }

  const route = routePath(req);

  if (req.method === "GET" && route === "/evidence") {
    const sql = openDatabase();
    if (!sql) return json({ error: "SERVER_CONFIGURATION_ERROR" }, 500);
    try {
      const rows = await sql`select public.get_kleos_bot_evaluation_evidence_admin() as evidence`;
      const evidence = rows[0]?.evidence;
      if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
        return json({ error: "EVIDENCE_UNAVAILABLE" }, 500);
      }
      return json({
        evidence_schema_version: EVIDENCE_SCHEMA_VERSION,
        methodology_version: METHODOLOGY_VERSION,
        generated_at: new Date().toISOString(),
        evidence,
      });
    } catch (_error) {
      return json({ error: "EVIDENCE_RETRIEVAL_FAILED" }, 500);
    } finally {
      await sql.end({ timeout: 1 });
    }
  }

  if (req.method === "POST" && route === "/evaluations") {
    let parsed: unknown;
    try {
      parsed = await req.json();
    } catch (_error) {
      return json({ error: "INVALID_JSON" }, 400);
    }

    const normalized = normalizeEvaluationBody(parsed);
    if (!normalized.ok) return json({ error: normalized.error }, 400);

    // Evaluation time and methodology are server-owned so the GPT cannot mutate
    // canonical evaluator metadata. The caller supplies only per-run identity and results.
    const evaluatedAt = new Date().toISOString();
    const resultsJson = JSON.stringify(normalized.value.results);
    const sql = openDatabase();
    if (!sql) return json({ error: "SERVER_CONFIGURATION_ERROR" }, 500);

    try {
      const rows = await sql`
        select public.create_kleos_bot_snapshot_admin(
          ${evaluatedAt}::timestamptz,
          ${METHODOLOGY_VERSION}::text,
          ${normalized.value.executionKey}::text,
          ${resultsJson}::jsonb,
          ${normalized.value.overallScore}::numeric
        ) as persistence
      `;
      const persistence = rows[0]?.persistence;
      if (!persistence || typeof persistence !== "object") {
        return json({ error: "PERSISTENCE_UNAVAILABLE" }, 500);
      }
      return json({
        ok: true,
        execution_key: normalized.value.executionKey,
        evaluated_at: evaluatedAt,
        methodology_version: METHODOLOGY_VERSION,
        ...persistence,
      });
    } catch (_error) {
      return json({ error: "PERSISTENCE_FAILED" }, 500);
    } finally {
      await sql.end({ timeout: 1 });
    }
  }

  return json({ error: "NOT_FOUND" }, 404);
});

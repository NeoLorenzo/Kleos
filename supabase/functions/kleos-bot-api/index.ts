import postgres from "npm:postgres@3.4.7";

// SHA-256 of the dedicated Shortcut token. The plaintext token is never committed.
// This deliberately reuses the existing Kleos Bot Shortcut credential so existing
// Shortcuts do not need a second secret.
const EXPECTED_TOKEN_HASH = "903582239a902fe118415c44c3eb1cc967624ffa3ad0394dafb9fc825f9a3c43";
const MAX_REQUEST_BYTES = 256_000;

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

function isUuidStyle(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}

function compactMethodology(methodology: Record<string, unknown>) {
  if (methodology.version !== "2.0.0" || !Array.isArray(methodology.vectors)) {
    // Fail open to the canonical representation for a future methodology rather
    // than silently applying a stale compaction transform.
    return methodology;
  }

  const vectors = methodology.vectors.map((rawVector) => {
    const vector = rawVector as Record<string, unknown>;
    const subdomains = Array.isArray(vector.subdomains)
      ? vector.subdomains.map((rawSubdomain) => {
          const subdomain = rawSubdomain as Record<string, unknown>;
          return {
            id: subdomain.id,
            label: subdomain.label,
            weight: subdomain.weight,
            definition: subdomain.definition,
          };
        })
      : [];

    return {
      id: vector.id,
      label: vector.label,
      definition: vector.definition,
      subdomains,
    };
  });

  // In 2.0.0 the seven anchor descriptions are the same semantic template for
  // every subdomain, with only the subdomain label substituted. Returning them
  // once removes ~50 KB of repeated prompt text without changing the scale.
  const anchors = {
    "0": "Direct evidence shows severe impairment, near-total failure, or an effectively absent functional state. Missing evidence alone must never receive 0; it is unknown.",
    "25": "Direct evidence shows a clearly weak state, with substantial deficits, instability, or repeated failure.",
    "50": "Evidence supports a functional but ordinary, mixed, inconsistent, narrow, or materially constrained state.",
    "70": "Evidence supports a clearly strong state, beyond merely adequate, with meaningful demonstrated strengths and manageable limitations.",
    "85": "Evidence supports a very strong, sustained, broad, and well-supported state, with only limited material weaknesses.",
    "95": "Evidence supports an exceptional, rare, highly complete, and strongly evidenced state; important weaknesses are absent or minor.",
    "100": "Direct evidence supports the practical ceiling: extraordinarily complete, durable, and independently supported, with essentially no meaningful unmet dimension.",
  };

  return {
    version: methodology.version,
    name: methodology.name,
    scoring_scope: methodology.scoring_scope,
    evidence_rules: methodology.evidence_rules,
    aggregation: methodology.aggregation,
    anchors,
    vectors,
  };
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

  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return json({ error: "PAYLOAD_TOO_LARGE" }, 413);
  }

  let body: Record<string, unknown>;
  try {
    const text = await req.text();
    if (text.length > MAX_REQUEST_BYTES) return json({ error: "PAYLOAD_TOO_LARGE" }, 413);
    body = text.length > 0 ? JSON.parse(text) : {};
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return json({ error: "INVALID_REQUEST" }, 400);
    }
  } catch (_error) {
    return json({ error: "INVALID_JSON" }, 400);
  }

  const operation = typeof body.operation === "string" ? body.operation : "";
  if (operation !== "context" && operation !== "persist") {
    return json({ error: "INVALID_OPERATION" }, 400);
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
    if (operation === "context") {
      const rows = await sql`select public.get_kleos_evaluation_context() as context`;
      const context = rows[0]?.context as Record<string, unknown> | undefined;

      if (!context || typeof context !== "object" || Array.isArray(context)) {
        return json({ error: "CONTEXT_UNAVAILABLE" }, 500);
      }

      const methodology = context.methodology as Record<string, unknown> | undefined;
      const evidence = context.evidence;
      if (!methodology || typeof methodology !== "object" || Array.isArray(methodology) || !evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
        return json({ error: "CONTEXT_INVALID" }, 500);
      }

      return json({
        context: {
          methodology: compactMethodology(methodology),
          evidence,
        },
      });
    }

    const executionKey = typeof body.execution_key === "string" ? body.execution_key.trim() : "";
    const vectors = body.vectors;
    if (!isUuidStyle(executionKey)) {
      return json({ error: "INVALID_EXECUTION_KEY" }, 400);
    }
    if (!Array.isArray(vectors) || vectors.length !== 8) {
      return json({ error: "INVALID_VECTORS" }, 400);
    }

    const vectorJson = JSON.stringify(vectors);
    if (vectorJson.length > 200_000) {
      return json({ error: "VECTORS_TOO_LARGE" }, 413);
    }

    const rows = await sql`
      select public.persist_kleos_evaluation(
        ${executionKey},
        ${vectorJson}::jsonb
      ) as persistence_result
    `;
    const result = rows[0]?.persistence_result;
    if (!result || typeof result !== "object") {
      return json({ error: "PERSISTENCE_RESULT_INVALID" }, 500);
    }

    return json({ persistence_result: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (operation === "persist" && message.startsWith("KLEOS_")) {
      return json({ error: "EVALUATION_REJECTED", code: message }, 400);
    }
    return json({ error: operation === "context" ? "CONTEXT_RETRIEVAL_FAILED" : "PERSISTENCE_FAILED" }, 500);
  } finally {
    await sql.end({ timeout: 1 });
  }
});

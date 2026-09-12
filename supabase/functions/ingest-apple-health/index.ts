import { createClient } from "npm:@supabase/supabase-js@2.56.0";

const INGEST_TOKEN_SHA256 = "16783edb045986b20c1be8961ef01c685cdcc650484360134fdf3dfe138c5571";

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store, private, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeMetricName(value: unknown) {
  if (typeof value !== "string") return null;
  const name = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return name || null;
}

function normalizeTimestamp(value: unknown) {
  if (typeof value !== "string" || /^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const match = value.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2})$/);
  const normalized = match ? `${match[1]}T${match[2]}${match[3]}:${match[4]}` : value;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function datePrefix(value: unknown) {
  if (typeof value !== "string") return null;
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? null;
}

function extractMetrics(payload: unknown) {
  const payloads = Array.isArray(payload) ? payload : [payload];
  const metrics: unknown[] = [];
  for (const item of payloads) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const direct = Array.isArray(record.metrics) ? record.metrics : null;
    const nested = record.data && typeof record.data === "object" && !Array.isArray(record.data)
      ? (record.data as Record<string, unknown>).metrics
      : null;
    if (direct) metrics.push(...direct);
    if (Array.isArray(nested)) metrics.push(...nested);
  }
  return metrics;
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  const authorization = req.headers.get("Authorization")?.trim() ?? "";
  if (!authorization.startsWith("Bearer ")) return json({ error: "UNAUTHORIZED" }, 401);
  const suppliedToken = authorization.slice(7).trim();
  if (!suppliedToken || await sha256Hex(suppliedToken) !== INGEST_TOKEN_SHA256) {
    return json({ error: "UNAUTHORIZED" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "SERVER_CONFIGURATION_ERROR" }, 500);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: ownerId, error: ownerError } = await admin.rpc("get_kleos_owner_user_id_admin");
  if (ownerError || typeof ownerId !== "string") {
    console.error("owner resolution failed", ownerError);
    return json({ error: "OWNER_RESOLUTION_FAILED" }, 500);
  }

  const payload = await req.json().catch(() => null);
  if (!payload) return json({ error: "INVALID_JSON" }, 400);

  const metrics = extractMetrics(payload);
  if (metrics.length === 0) return json({ error: "NO_HEALTH_METRICS", expected: "data.metrics[]" }, 400);
  if (metrics.length > 250) return json({ error: "TOO_MANY_METRICS" }, 413);

  const now = new Date().toISOString();
  const rows: Record<string, unknown>[] = [];
  let skipped = 0;

  for (const metric of metrics) {
    if (!metric || typeof metric !== "object" || Array.isArray(metric)) {
      skipped++;
      continue;
    }
    const record = metric as Record<string, unknown>;
    const metricName = normalizeMetricName(record.name);
    const data = Array.isArray(record.data) ? record.data : [];
    const units = typeof record.units === "string" ? record.units : null;
    if (!metricName) {
      skipped += Math.max(1, data.length);
      continue;
    }

    for (const point of data) {
      if (!point || typeof point !== "object" || Array.isArray(point)) {
        skipped++;
        continue;
      }
      const p = point as Record<string, unknown>;
      const anchor = [p.date, p.startDate, p.sleepEnd, p.endDate, p.sleepStart]
        .find((value) => typeof value === "string") as string | undefined;
      const metricDate = datePrefix(anchor);
      if (!anchor || !metricDate) {
        skipped++;
        continue;
      }

      rows.push({
        user_id: ownerId,
        sample_key: `${metricName}|${anchor}`,
        metric_name: metricName,
        metric_date: metricDate,
        observed_at: normalizeTimestamp(anchor),
        units,
        qty: numberOrNull(p.qty),
        min_value: numberOrNull(p.Min ?? p.min),
        avg_value: numberOrNull(p.Avg ?? p.avg),
        max_value: numberOrNull(p.Max ?? p.max),
        source: typeof p.source === "string" ? p.source : null,
        details: p,
        updated_at: now,
      });
    }
  }

  if (rows.length === 0) return json({ error: "NO_VALID_SAMPLES", skipped }, 400);
  if (rows.length > 50000) return json({ error: "TOO_MANY_SAMPLES" }, 413);

  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await admin.from("goat_health_metrics").upsert(chunk, {
      onConflict: "user_id,sample_key",
    });
    if (error) {
      console.error("apple health persistence error", error);
      return json({ error: "PERSISTENCE_FAILED", accepted_before_failure: i }, 500);
    }
  }

  return json({
    ok: true,
    metrics_received: metrics.length,
    samples_upserted: rows.length,
    skipped,
    received_at: now,
  });
});

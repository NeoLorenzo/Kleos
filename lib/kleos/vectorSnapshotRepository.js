import { supabase } from "@/lib/supabase/client";
import {
  normalizeVectorSnapshotRow,
  validateVectorSnapshotPayload
} from "@/lib/kleos/vectorSnapshots";

const SNAPSHOT_SELECT = `
  id,
  user_id,
  evaluated_at,
  evaluator,
  methodology_version,
  overall_score,
  created_at,
  results:kleos_vector_snapshot_results(
    vector_id,
    status,
    score,
    confidence,
    commentary,
    coverage_pct,
    raw_score,
    aggregation_details
  ),
  subdomains:kleos_vector_snapshot_subdomain_results(
    vector_id,
    subdomain_id,
    methodology_version,
    weight,
    status,
    score,
    confidence,
    commentary
  )
`;

export async function loadLatestVectorSnapshot(userId) {
  assertReadableSession(userId);

  const { data, error } = await supabase
    .from("kleos_vector_snapshots")
    .select(SNAPSHOT_SELECT)
    .eq("user_id", userId)
    .order("evaluated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data ? normalizeVectorSnapshotRow(data) : null;
}

export async function loadVectorSnapshotHistory(userId, { limit = 50 } = {}) {
  assertReadableSession(userId);
  const boundedLimit = Math.max(1, Math.min(250, Number(limit) || 50));

  const { data, error } = await supabase
    .from("kleos_vector_snapshots")
    .select(SNAPSHOT_SELECT)
    .eq("user_id", userId)
    .order("evaluated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(boundedLimit);

  if (error) throw error;
  return (data || []).map(normalizeVectorSnapshotRow);
}

export async function persistVectorSnapshot(payload) {
  if (!supabase) {
    throw new Error("Kleos vector snapshot writes require an authenticated Supabase client.");
  }

  const validation = validateVectorSnapshotPayload(payload);
  if (!validation.ok) {
    throw new Error(`INVALID_VECTOR_SNAPSHOT:${validation.message}`);
  }

  const snapshot = validation.value;
  if (snapshot.methodologyVersion.startsWith("2.")) {
    throw new Error(
      "KLEOS_CURRENT_METHODOLOGY_SERVER_WRITER_REQUIRED: Methodology 2.x snapshots must be created through the deterministic server-side evaluator contract."
    );
  }

  const { data, error } = await supabase.rpc("create_kleos_vector_snapshot", {
    p_evaluated_at: snapshot.evaluatedAt,
    p_evaluator: snapshot.evaluator,
    p_methodology_version: snapshot.methodologyVersion,
    p_results: snapshot.results.map((result) => ({
      vector_id: result.vectorId,
      status: result.status,
      score: result.score,
      confidence: result.confidence,
      commentary: result.commentary
    })),
    p_overall_score: snapshot.overallScore
  });

  if (error) throw error;
  return data;
}

function assertReadableSession(userId) {
  if (!supabase || !userId) {
    throw new Error("Kleos vector snapshots require an authenticated cloud session.");
  }
}

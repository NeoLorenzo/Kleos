import { VECTOR_IDS } from "@/lib/kleos/vectorSnapshots";

export function buildCharacterEvidence(kleosData = {}) {
  const latestStage = [...(kleosData.academicStages || [])]
    .filter((stage) => Number.isFinite(Number(stage.stage_mean)))
    .sort((a, b) => Number(b.stage || 0) - Number(a.stage || 0))[0];
  const latestCognitive = (kleosData.cognitiveTests || [])[0] || null;
  const latestLift = (kleosData.strengthLifts || [])[0] || null;
  const bodyWeight = numberOrNull(kleosData.strengthProfile?.bodyWeightKg);
  const height = numberOrNull(kleosData.strengthProfile?.heightCm);
  const hasHealth = Boolean(
    String(kleosData.healthProfile?.bloodTestText || "").trim() ||
    String(kleosData.healthProfile?.miscText || "").trim()
  );
  const hasCv = Boolean(String(kleosData.cvText || "").trim());
  const hasMisc = Boolean(String(kleosData.miscText || "").trim());
  const hasAcademicNotes = Boolean(String(kleosData.academicNotes || "").trim());
  const unclassifiedProfileNote = hasMisc
    ? "General profile appendix recorded; its contents are not automatically classified to this vector"
    : null;

  return {
    physical: compact([
      height === null ? null : `Height ${formatNumber(height)} cm`,
      bodyWeight === null ? null : `Body weight ${formatNumber(bodyWeight)} kg`,
      latestLift ? `${latestLift.exercise_name}: ${formatNumber(latestLift.weight_kg)} kg × ${latestLift.reps}` : null,
      `${(kleosData.strengthLifts || []).length} recorded strength lift${(kleosData.strengthLifts || []).length === 1 ? "" : "s"}`,
      hasHealth ? "Health profile recorded" : "No health profile recorded"
    ]),
    psychological: compact([
      "No dedicated structured psychological evidence source is currently modeled",
      unclassifiedProfileNote
    ]),
    intellectual: compact([
      latestStage ? `Latest completed stage mean ${formatNumber(latestStage.stage_mean)}%` : null,
      latestCognitive ? `${latestCognitive.test_name}: ${latestCognitive.score_text}` : null,
      `${(kleosData.academicModules || []).length} academic module result${(kleosData.academicModules || []).length === 1 ? "" : "s"}`,
      hasAcademicNotes ? "Academic context recorded" : null
    ]),
    professional: compact([
      hasCv ? "CV / professional record available" : "No CV record available",
      `${(kleosData.academicStages || []).length} academic stage record${(kleosData.academicStages || []).length === 1 ? "" : "s"}`
    ]),
    financial: compact([
      "No dedicated structured financial evidence source is currently modeled",
      unclassifiedProfileNote
    ]),
    relational: compact([
      "No dedicated structured relational evidence source is currently modeled",
      unclassifiedProfileNote
    ]),
    creative: compact([
      "No dedicated structured creative evidence source is currently modeled",
      hasCv ? "CV / professional record exists but is not automatically classified as creative evidence" : null,
      unclassifiedProfileNote
    ]),
    experiential: compact([
      "No dedicated structured experiential evidence source is currently modeled",
      hasCv ? "CV / professional record exists but is not automatically classified as experiential evidence" : null,
      unclassifiedProfileNote
    ])
  };
}

export function buildVectorTrajectory(snapshots = [], vectorId, { limit = 8 } = {}) {
  if (!VECTOR_IDS.includes(vectorId)) return [];
  return snapshots.slice(0, Math.max(1, Number(limit) || 8)).map((snapshot) => {
    const result = snapshot?.results?.find((item) => item.vectorId === vectorId) || null;
    return {
      snapshotId: snapshot?.id || null,
      evaluatedAt: snapshot?.evaluatedAt || null,
      evaluator: snapshot?.evaluator || null,
      methodologyVersion: snapshot?.methodologyVersion || null,
      status: result?.status || "missing",
      score: result?.status === "assessed" ? Number(result.score) : null,
      confidence: result?.confidence || null
    };
  });
}

export function formatTrajectorySummary(points = []) {
  if (!points.length) return "No history";
  return points
    .slice()
    .reverse()
    .map((point) => point.status === "assessed" ? formatNumber(point.score) : point.status === "unknown" ? "?" : "—")
    .join(" → ");
}

function compact(values) {
  return values.filter(Boolean);
}

function numberOrNull(value) {
  const number = Number(value);
  return value === "" || value === null || value === undefined || !Number.isFinite(number) ? null : number;
}

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return Number.isInteger(number) ? String(number) : number.toFixed(1);
}

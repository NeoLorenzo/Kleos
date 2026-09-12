import { validateVectorSnapshotPayload } from "@/lib/kleos/vectorSnapshots";
import { KLEOS_VECTOR_METHODOLOGY_VERSION } from "@/lib/kleos/vectorMethodology.mjs";

export const KLEOS_BOT_EVALUATOR = "kleos-bot";
export const KLEOS_BOT_METHODOLOGY_VERSION = KLEOS_VECTOR_METHODOLOGY_VERSION;

export function normalizeKleosBotEvaluation(
  modelOutput,
  { evaluatedAt = new Date(), executionKey = null } = {}
) {
  const timestamp = evaluatedAt instanceof Date ? evaluatedAt : new Date(evaluatedAt);
  if (Number.isNaN(timestamp.getTime())) {
    return { ok: false, message: "Kleos Bot evaluatedAt must be a valid date." };
  }

  const normalizedExecutionKey = normalizeExecutionKey(executionKey);
  if (!normalizedExecutionKey) {
    return { ok: false, message: "Kleos Bot executionKey is required." };
  }

  const validation = validateVectorSnapshotPayload({
    evaluatedAt: timestamp.toISOString(),
    evaluator: KLEOS_BOT_EVALUATOR,
    methodologyVersion: KLEOS_BOT_METHODOLOGY_VERSION,
    overallScore: modelOutput?.overallScore ?? null,
    results: modelOutput?.results
  });

  if (!validation.ok) return validation;

  return {
    ok: true,
    value: {
      ...validation.value,
      executionKey: normalizedExecutionKey
    }
  };
}

export function normalizeExecutionKey(value) {
  const executionKey = String(value || "").trim();
  if (!executionKey || executionKey.length > 120) return null;
  return executionKey;
}

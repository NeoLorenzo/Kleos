import { validateVectorSnapshotPayload } from "@/lib/kleos/vectorSnapshots";

export const KLEOS_BOT_EVALUATOR = "kleos-bot";
export const KLEOS_BOT_METHODOLOGY_VERSION = "1.0.0";
export const KLEOS_BOT_TIME_ZONE = "Europe/Lisbon";

export function normalizeKleosBotEvaluation(modelOutput, { evaluatedAt = new Date() } = {}) {
  const timestamp = evaluatedAt instanceof Date ? evaluatedAt : new Date(evaluatedAt);
  if (Number.isNaN(timestamp.getTime())) {
    return { ok: false, message: "Kleos Bot evaluatedAt must be a valid date." };
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
      runKey: buildKleosBotRunKey(timestamp)
    }
  };
}

export function buildKleosBotRunKey(value, timeZone = KLEOS_BOT_TIME_ZONE) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("INVALID_KLEOS_BOT_RUN_DATE");
  }

  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value])
  );

  const localDate = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
  const day = localDate.getUTCDay() || 7;
  localDate.setUTCDate(localDate.getUTCDate() + 4 - day);
  const isoYear = localDate.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil((((localDate - yearStart) / 86400000) + 1) / 7);

  return `${isoYear}-W${String(week).padStart(2, "0")}:${KLEOS_BOT_METHODOLOGY_VERSION}`;
}

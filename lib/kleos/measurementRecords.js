export function getLocalCalendarDateValue(value = new Date()) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function localCalendarDateToIsoTimestamp(value) {
  const date = parseLocalCalendarDate(value);
  return date ? date.toISOString() : null;
}

export function timestampToLocalCalendarDate(value) {
  if (!value) return "";
  return getLocalCalendarDateValue(value);
}

export function formatDateOnlyCalendarDate(value, locale) {
  const date = parseLocalCalendarDate(value);
  return date ? date.toLocaleDateString(locale) : "-";
}

export function formatTimestampLocalDate(value, locale) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString(locale);
}

export function validateLiftDraft(draft) {
  const weightKg = Number(draft.weightKg);
  const reps = Number(draft.reps);
  const performedAt = localCalendarDateToIsoTimestamp(draft.performedAt);

  if (
    !String(draft.exerciseName || "").trim() ||
    !Number.isFinite(weightKg) ||
    weightKg <= 0 ||
    !Number.isInteger(reps) ||
    reps <= 0 ||
    !performedAt
  ) {
    return {
      ok: false,
      message: "Enter an exercise, positive KG weight, whole-number reps, and a valid date."
    };
  }

  return {
    ok: true,
    payload: {
      exercise_name: String(draft.exerciseName).trim(),
      weight_kg: weightKg,
      reps,
      performed_at: performedAt
    }
  };
}

export function validateCognitiveDraft(draft) {
  const conditionScores = ["hunger", "distractions", "wakefulness", "mood"].reduce(
    (scores, key) => ({ ...scores, [key]: Number(draft[key]) }),
    {}
  );
  const hasInvalidCondition = Object.values(conditionScores).some(
    (score) => !Number.isInteger(score) || score < 0 || score > 10
  );

  if (
    !String(draft.testName || "").trim() ||
    !String(draft.score || "").trim() ||
    !draft.takenAt ||
    hasInvalidCondition
  ) {
    return {
      ok: false,
      message: "Enter the test, score, date/time, and every condition rating from 0 to 10."
    };
  }

  const takenAt = new Date(draft.takenAt);
  if (Number.isNaN(takenAt.getTime())) {
    return { ok: false, message: "Enter a valid cognitive-test date/time." };
  }

  return {
    ok: true,
    payload: {
      test_name: String(draft.testName).trim(),
      score_text: String(draft.score).trim(),
      taken_at: takenAt.toISOString(),
      ...conditionScores
    }
  };
}

export function liftRowToDraft(row) {
  return {
    exerciseName: row.exercise_name || "",
    weightKg: String(row.weight_kg ?? ""),
    reps: String(row.reps ?? ""),
    performedAt: timestampToLocalCalendarDate(row.performed_at)
  };
}

export function cognitiveRowToDraft(row) {
  return {
    testName: row.test_name || "",
    score: row.score_text || "",
    takenAt: toLocalDateTime(row.taken_at),
    hunger: String(row.hunger ?? ""),
    distractions: String(row.distractions ?? ""),
    wakefulness: String(row.wakefulness ?? ""),
    mood: String(row.mood ?? "")
  };
}

export function replaceMeasurementRecord(records, kind, updatedRow) {
  assertMeasurementKind(kind);
  return {
    ...records,
    [kind]: (records[kind] || []).map((row) => (row.id === updatedRow.id ? updatedRow : row))
  };
}

export function removeMeasurementRecord(records, kind, recordId) {
  assertMeasurementKind(kind);
  return {
    ...records,
    [kind]: (records[kind] || []).filter((row) => row.id !== recordId)
  };
}

function assertMeasurementKind(kind) {
  if (!new Set(["lift", "cognitive"]).has(kind)) {
    throw new Error(`Unknown measurement kind: ${kind}`);
  }
}

function parseLocalCalendarDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 0, 0, 0, 0);

  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function toLocalDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

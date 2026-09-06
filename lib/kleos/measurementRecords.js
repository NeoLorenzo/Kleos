export function validateScoreDraft(draft) {
  const score = Number(draft.score);
  if (!Number.isFinite(score) || score < 0 || score > 100 || !draft.entryDate) {
    return { ok: false, message: "Enter a GOAT score from 0 to 100 and a date." };
  }

  return {
    ok: true,
    payload: {
      score,
      entry_date: draft.entryDate,
      llm_commentary: String(draft.commentary || "").trim()
    }
  };
}

export function validateLiftDraft(draft) {
  const weightKg = Number(draft.weightKg);
  const reps = Number(draft.reps);

  if (
    !String(draft.exerciseName || "").trim() ||
    !Number.isFinite(weightKg) ||
    weightKg <= 0 ||
    !Number.isInteger(reps) ||
    reps <= 0 ||
    !draft.performedAt
  ) {
    return {
      ok: false,
      message: "Enter an exercise, positive KG weight, whole-number reps, and a date."
    };
  }

  return {
    ok: true,
    payload: {
      exercise_name: String(draft.exerciseName).trim(),
      weight_kg: weightKg,
      reps,
      performed_at: new Date(`${draft.performedAt}T00:00:00`).toISOString()
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

export function scoreRowToDraft(row) {
  return {
    score: String(row.score ?? ""),
    entryDate: String(row.entry_date || ""),
    commentary: row.llm_commentary || ""
  };
}

export function liftRowToDraft(row) {
  return {
    exerciseName: row.exercise_name || "",
    weightKg: String(row.weight_kg ?? ""),
    reps: String(row.reps ?? ""),
    performedAt: toLocalDate(row.performed_at)
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
  if (!new Set(["score", "lift", "cognitive"]).has(kind)) {
    throw new Error(`Unknown measurement kind: ${kind}`);
  }
}

function toLocalDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function toLocalDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

export const VECTOR_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: "physical",
    label: "Physical",
    description: "Health, strength, endurance, body composition, sleep, nutrition, and mobility."
  }),
  Object.freeze({
    id: "psychological",
    label: "Psychological",
    description: "Wellbeing, emotional regulation, resilience, agency, self-esteem, motivation, and psychological coherence."
  }),
  Object.freeze({
    id: "intellectual",
    label: "Intellectual",
    description: "Knowledge, reasoning, mental models, learning ability, expertise, and critical thinking."
  }),
  Object.freeze({
    id: "professional",
    label: "Professional",
    description: "Career capital, qualifications, portfolio, experience, reputation, employability, and professional network."
  }),
  Object.freeze({
    id: "financial",
    label: "Financial",
    description: "Income, assets, savings, liquidity, financial independence, and earning capacity."
  }),
  Object.freeze({
    id: "relational",
    label: "Relational",
    description: "Romantic relationship, friendships, family, community, social connection, and relationship quality/depth."
  }),
  Object.freeze({
    id: "creative",
    label: "Creative",
    description: "Writing, filmmaking, photography, design, artistic skill, and creative output."
  }),
  Object.freeze({
    id: "experiential",
    label: "Experiential",
    description: "Travel, novelty, adventure, environments, events, memorable experiences, and breadth of lived life."
  })
]);

export const VECTOR_IDS = Object.freeze(VECTOR_DEFINITIONS.map((vector) => vector.id));
export const ASSESSED_CONFIDENCE_LEVELS = Object.freeze(["low", "medium", "high"]);

const VECTOR_ID_SET = new Set(VECTOR_IDS);
const ASSESSED_CONFIDENCE_SET = new Set(ASSESSED_CONFIDENCE_LEVELS);
const VECTOR_BY_ID = new Map(VECTOR_DEFINITIONS.map((vector) => [vector.id, vector]));

export function isVectorId(value) {
  return VECTOR_ID_SET.has(String(value || "").trim().toLowerCase());
}

export function getVectorDefinition(vectorId) {
  return VECTOR_BY_ID.get(String(vectorId || "").trim().toLowerCase()) || null;
}

export function getVectorLabel(vectorId) {
  return getVectorDefinition(vectorId)?.label || String(vectorId || "");
}

export function validateVectorSnapshotPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return invalid("Snapshot payload must be an object.");
  }

  const evaluatedAt = normalizeTimestamp(payload.evaluatedAt ?? payload.evaluated_at);
  if (!evaluatedAt) {
    return invalid("Snapshot evaluatedAt must be a valid timestamp.");
  }

  const evaluator = String(payload.evaluator || "").trim();
  const methodologyVersion = String(payload.methodologyVersion ?? payload.methodology_version ?? "").trim();
  if (!evaluator || !methodologyVersion) {
    return invalid("Snapshot evaluator and methodologyVersion are required.");
  }

  const overallScoreResult = normalizeOptionalScore(payload.overallScore ?? payload.overall_score);
  if (!overallScoreResult.ok) {
    return invalid("Snapshot overallScore must be null or between 0 and 100.");
  }

  if (!Array.isArray(payload.results) || payload.results.length !== VECTOR_IDS.length) {
    return invalid(`Snapshot must contain exactly ${VECTOR_IDS.length} vector results.`);
  }

  const normalizedById = new Map();
  for (const rawResult of payload.results) {
    const normalized = normalizeVectorResult(rawResult);
    if (!normalized.ok) {
      return normalized;
    }
    if (normalizedById.has(normalized.value.vectorId)) {
      return invalid(`Snapshot contains duplicate vector result: ${normalized.value.vectorId}.`);
    }
    normalizedById.set(normalized.value.vectorId, normalized.value);
  }

  const missingVector = VECTOR_IDS.find((vectorId) => !normalizedById.has(vectorId));
  if (missingVector) {
    return invalid(`Snapshot is missing canonical vector result: ${missingVector}.`);
  }

  return {
    ok: true,
    value: {
      evaluatedAt,
      evaluator,
      methodologyVersion,
      overallScore: overallScoreResult.value,
      results: VECTOR_IDS.map((vectorId) => normalizedById.get(vectorId))
    }
  };
}

export function normalizeVectorSnapshotRow(row) {
  if (!row || typeof row !== "object") {
    throw new Error("INVALID_VECTOR_SNAPSHOT_ROW");
  }

  const validation = validateVectorSnapshotPayload({
    evaluatedAt: row.evaluated_at ?? row.evaluatedAt,
    evaluator: row.evaluator,
    methodologyVersion: row.methodology_version ?? row.methodologyVersion,
    overallScore: row.overall_score ?? row.overallScore,
    results: row.results ?? row.kleos_vector_snapshot_results ?? []
  });

  if (!validation.ok) {
    throw new Error(`INVALID_VECTOR_SNAPSHOT_ROW:${validation.message}`);
  }

  return {
    id: row.id || null,
    userId: row.user_id ?? row.userId ?? null,
    ...validation.value,
    createdAt: normalizeTimestamp(row.created_at ?? row.createdAt) || null
  };
}

export function compareVectorSnapshotsNewestFirst(left, right) {
  const evaluatedDifference = timestampValue(right?.evaluatedAt ?? right?.evaluated_at)
    - timestampValue(left?.evaluatedAt ?? left?.evaluated_at);
  if (evaluatedDifference !== 0) return evaluatedDifference;
  return timestampValue(right?.createdAt ?? right?.created_at)
    - timestampValue(left?.createdAt ?? left?.created_at);
}

function normalizeVectorResult(rawResult) {
  if (!rawResult || typeof rawResult !== "object") {
    return invalid("Every vector result must be an object.");
  }

  const vectorId = String(rawResult.vectorId ?? rawResult.vector_id ?? "").trim().toLowerCase();
  if (!VECTOR_ID_SET.has(vectorId)) {
    return invalid(`Unknown canonical vector: ${vectorId || "(empty)"}.`);
  }

  const status = String(rawResult.status || "").trim().toLowerCase();
  if (status !== "assessed" && status !== "unknown") {
    return invalid(`Vector ${vectorId} status must be assessed or unknown.`);
  }

  const commentary = String(rawResult.commentary || "").trim();
  if (!commentary) {
    return invalid(`Vector ${vectorId} requires concise commentary.`);
  }

  const confidence = String(rawResult.confidence || "").trim().toLowerCase();
  const rawScore = rawResult.score;

  if (status === "unknown") {
    if (!isNullishScore(rawScore)) {
      return invalid(`Unknown vector ${vectorId} must not contain a numeric score.`);
    }
    if (confidence !== "unknown") {
      return invalid(`Unknown vector ${vectorId} must use confidence=unknown.`);
    }
    return {
      ok: true,
      value: { vectorId, status, score: null, confidence: "unknown", commentary }
    };
  }

  const score = Number(rawScore);
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    return invalid(`Assessed vector ${vectorId} requires a score between 0 and 100.`);
  }
  if (!ASSESSED_CONFIDENCE_SET.has(confidence)) {
    return invalid(`Assessed vector ${vectorId} confidence must be low, medium, or high.`);
  }

  return {
    ok: true,
    value: { vectorId, status, score, confidence, commentary }
  };
}

function normalizeOptionalScore(value) {
  if (value === null || value === undefined || value === "") {
    return { ok: true, value: null };
  }
  const score = Number(value);
  return Number.isFinite(score) && score >= 0 && score <= 100
    ? { ok: true, value: score }
    : { ok: false, value: null };
}

function normalizeTimestamp(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function timestampValue(value) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function isNullishScore(value) {
  return value === null || value === undefined || value === "";
}

function invalid(message) {
  return { ok: false, message };
}

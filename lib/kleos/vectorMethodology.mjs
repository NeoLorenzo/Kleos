export const KLEOS_VECTOR_METHODOLOGY_VERSION = "2.0.1";
export const KLEOS_SUBDOMAIN_ANCHOR_SCORES = Object.freeze([0, 25, 50, 70, 85, 95, 100]);

const ANCHOR_SCORE_SET = new Set(KLEOS_SUBDOMAIN_ANCHOR_SCORES);

export const KLEOS_VECTOR_METHODOLOGY = Object.freeze({
  version: KLEOS_VECTOR_METHODOLOGY_VERSION,
  normalization: "absolute",
  allowedSubdomainScores: KLEOS_SUBDOMAIN_ANCHOR_SCORES,
  vectorUnknownBelowCoveragePct: 50,
  coverageScoreCaps: Object.freeze([
    Object.freeze({ min: 50, max: 64.999, cap: 70 }),
    Object.freeze({ min: 65, max: 79.999, cap: 82 }),
    Object.freeze({ min: 80, max: 89.999, cap: 90 }),
    Object.freeze({ min: 90, max: 99.999, cap: 95 }),
    Object.freeze({ min: 100, max: 100, cap: 100 })
  ]),
  vectors: Object.freeze([
    vector("physical", [
      subdomain("clinical_health", 20),
      subdomain("cardiorespiratory_activity", 20),
      subdomain("strength_function", 20),
      subdomain("sleep_recovery", 20),
      subdomain("nutrition_body_composition", 20)
    ]),
    vector("psychological", [
      subdomain("wellbeing_symptoms", 25),
      subdomain("emotional_regulation_resilience", 20),
      subdomain("agency_followthrough", 20),
      subdomain("stress_load_recovery", 20),
      subdomain("meaning_self_regard", 15)
    ]),
    vector("intellectual", [
      subdomain("reasoning_learning", 20),
      subdomain("knowledge_academic_mastery", 25),
      subdomain("applied_problem_solving", 20),
      subdomain("research_epistemic_rigor", 20),
      subdomain("intellectual_output_growth", 15)
    ]),
    vector("professional", [
      subdomain("role_responsibility", 25),
      subdomain("demonstrated_execution", 20),
      subdomain("career_capital_skills", 20),
      subdomain("external_validation_reputation", 20),
      subdomain("network_optionality", 15)
    ]),
    vector("financial", [
      subdomain("balance_sheet_security", 25),
      subdomain("liquidity_resilience", 20),
      subdomain("cash_flow_independence", 20),
      subdomain("capital_allocation_stewardship", 20),
      subdomain("financial_systems_risk", 15)
    ]),
    vector("relational", [
      subdomain("romantic_intimacy", 20),
      subdomain("friendships_peer_support", 20),
      subdomain("family_support", 20),
      subdomain("community_belonging", 15),
      subdomain("relationship_maintenance_quality", 25)
    ]),
    vector("creative", [
      subdomain("original_ideation", 20),
      subdomain("craft_capability", 20),
      subdomain("output_cadence", 25),
      subdomain("quality_external_reception", 20),
      subdomain("range_experimentation", 15)
    ]),
    vector("experiential", [
      subdomain("accumulated_breadth", 30),
      subdomain("recent_novelty", 25),
      subdomain("challenge_adventure", 20),
      subdomain("immersion_depth", 15),
      subdomain("reflection_integration", 10)
    ])
  ])
});

export function aggregateVectorSubdomains(subdomains) {
  if (!Array.isArray(subdomains) || subdomains.length === 0) {
    return { status: "unknown", score: null, rawScore: null, confidence: "unknown", coveragePct: 0, scoreCap: null };
  }

  let coverage = 0;
  let weightedScore = 0;
  let weightedConfidence = 0;

  for (const result of subdomains) {
    if (result?.status !== "assessed") continue;
    const weight = Number(result.weight);
    const score = Number(result.score);
    const confidenceValue = confidenceNumber(result.confidence);
    if (
      !Number.isFinite(weight)
      || weight <= 0
      || !ANCHOR_SCORE_SET.has(score)
      || !confidenceValue
    ) {
      throw new Error("INVALID_KLEOS_SUBDOMAIN_RESULT");
    }
    coverage += weight;
    weightedScore += weight * score;
    weightedConfidence += weight * confidenceValue;
  }

  if (coverage < KLEOS_VECTOR_METHODOLOGY.vectorUnknownBelowCoveragePct) {
    return { status: "unknown", score: null, rawScore: null, confidence: "unknown", coveragePct: round1(coverage), scoreCap: null };
  }

  const rawScore = weightedScore / coverage;
  const confidenceMean = weightedConfidence / coverage;
  const scoreCap = scoreCapForCoverage(coverage);
  const score = round1(Math.min(rawScore, scoreCap));
  const confidence = coverage >= 85 && confidenceMean >= 2.5
    ? "high"
    : coverage >= 65 && confidenceMean >= 1.75
      ? "medium"
      : "low";

  return {
    status: "assessed",
    score,
    rawScore: round1(rawScore),
    confidence,
    coveragePct: round1(coverage),
    scoreCap,
    confidenceMean: Math.round(confidenceMean * 100) / 100
  };
}

export function scoreCapForCoverage(coveragePct) {
  const coverage = Number(coveragePct);
  const rule = KLEOS_VECTOR_METHODOLOGY.coverageScoreCaps.find(
    ({ min, max }) => coverage >= min && coverage <= max
  );
  return rule?.cap ?? null;
}

function vector(id, subdomains) {
  const weight = subdomains.reduce((sum, item) => sum + item.weight, 0);
  if (weight !== 100) throw new Error(`INVALID_KLEOS_VECTOR_WEIGHT:${id}:${weight}`);
  return Object.freeze({ id, subdomains: Object.freeze(subdomains) });
}

function subdomain(id, weight) {
  return Object.freeze({ id, weight });
}

function confidenceNumber(value) {
  if (value === "low") return 1;
  if (value === "medium") return 2;
  if (value === "high") return 3;
  return 0;
}

function round1(value) {
  return Math.round(Number(value) * 10) / 10;
}

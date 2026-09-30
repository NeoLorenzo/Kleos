import {
  KLEOS_VECTOR_METHODOLOGY,
  KLEOS_VECTOR_METHODOLOGY_VERSION,
  aggregateVectorSubdomains
} from "@/lib/kleos/vectorMethodology.mjs";

/*
 * Synthetic public example.
 *
 * Nothing in this file is private Kleos evidence. Subdomain anchors are
 * invented for "Alex Example"; vector scores are calculated with the same
 * deterministic aggregation Kleos uses for real snapshots, so every number
 * on the public surface obeys Methodology 2.0.1.
 */

export const METHODOLOGY_VERSION = KLEOS_VECTOR_METHODOLOGY_VERSION;
export const ANCHORS = KLEOS_VECTOR_METHODOLOGY.allowedSubdomainScores;
export const COVERAGE_CAPS = KLEOS_VECTOR_METHODOLOGY.coverageScoreCaps;
export { aggregateVectorSubdomains };

export const ANCHOR_MEANINGS = Object.freeze({
  0: "Severe impairment or an effectively absent state",
  25: "Clearly weak, with substantial deficits",
  50: "Functional but ordinary, mixed, or constrained",
  70: "Clearly strong, beyond merely adequate",
  85: "Very strong, sustained, and well supported",
  95: "Exceptional, rare, and strongly evidenced",
  100: "The practical ceiling"
});

const SUBDOMAIN_LABELS = Object.freeze({
  clinical_health: "Clinical health",
  cardiorespiratory_activity: "Cardiorespiratory & activity",
  strength_function: "Strength & function",
  sleep_recovery: "Sleep & recovery",
  nutrition_body_composition: "Nutrition & body composition",
  wellbeing_symptoms: "Wellbeing & symptoms",
  emotional_regulation_resilience: "Regulation & resilience",
  agency_followthrough: "Agency & follow-through",
  stress_load_recovery: "Stress load & recovery",
  meaning_self_regard: "Meaning & self-regard",
  reasoning_learning: "Reasoning & learning",
  knowledge_academic_mastery: "Knowledge & academic mastery",
  applied_problem_solving: "Applied problem solving",
  research_epistemic_rigor: "Research & epistemic rigor",
  intellectual_output_growth: "Intellectual output & growth",
  role_responsibility: "Role & responsibility",
  demonstrated_execution: "Demonstrated execution",
  career_capital_skills: "Career capital & skills",
  external_validation_reputation: "External validation",
  network_optionality: "Network & optionality",
  balance_sheet_security: "Balance-sheet security",
  liquidity_resilience: "Liquidity & resilience",
  cash_flow_independence: "Cash-flow independence",
  capital_allocation_stewardship: "Capital stewardship",
  financial_systems_risk: "Financial systems & risk",
  romantic_intimacy: "Romantic intimacy",
  friendships_peer_support: "Friendships & peer support",
  family_support: "Family relationships",
  community_belonging: "Community & belonging",
  relationship_maintenance_quality: "Maintenance & skill",
  original_ideation: "Original ideation",
  craft_capability: "Creative craft",
  output_cadence: "Output cadence",
  quality_external_reception: "Quality & reception",
  range_experimentation: "Range & experimentation",
  accumulated_breadth: "Accumulated breadth",
  recent_novelty: "Recent novelty & engagement",
  challenge_adventure: "Challenge & adventure",
  immersion_depth: "Immersion & depth",
  reflection_integration: "Reflection & integration"
});

const VECTOR_COPY = {
  physical: {
    label: "Physical",
    question: "How capable is my body right now?",
    definition: "Absolute physical health and functional capacity, weighted to the recent 90 days.",
    evidence: ["Apple Health · HRV, resting HR, sleep stages", "Heracles · estimated 1RM", "Nutrition · 7-day macros", "Clinical records"],
    commentary: "Strong resistance-training and activity evidence with favourable clinical markers. Sleep is not assessable from a single night."
  },
  psychological: {
    label: "Psychological",
    question: "How well am I functioning inside?",
    definition: "Absolute psychological wellbeing and self-regulatory functioning.",
    evidence: ["Big Five inventory", "WHO-5 & SWLS wellbeing", "GAD-7 & PHQ-9 screening"],
    commentary: "Validated assessments show stable wellbeing, high conscientiousness, and strong follow-through."
  },
  intellectual: {
    label: "Intellectual",
    question: "What can my mind demonstrably do?",
    definition: "Absolute intellectual capability and demonstrated mastery — not education-stage relative.",
    evidence: ["Academic transcripts · stage & module results", "Cognitive test results", "Research notes & publications"],
    commentary: "Exceptional reasoning evidence and sustained first-class academic results; research output still maturing."
  },
  professional: {
    label: "Professional",
    question: "What have I actually built and earned?",
    definition: "Absolute professional capital and demonstrated responsibility.",
    evidence: ["CV & role history", "Shipped projects", "References & recognition"],
    commentary: "Clear execution record and growing responsibility. Network evidence is too thin to characterise."
  },
  financial: {
    label: "Financial",
    question: "How secure am I, honestly?",
    definition: "Absolute financial health — wealth is not the same as liquidity or independence.",
    evidence: ["Open banking · connected accounts", "Asset & liability register", "Categorised transactions"],
    commentary: "Asset-rich and debt-free, but highly illiquid, and current inflows are externally supported."
  },
  relational: {
    label: "Relational",
    question: "How strong is the web of people around me?",
    definition: "The quality and resilience of the whole relationship ecosystem.",
    evidence: ["Relationship notes", "Contact cadence", "Community involvement"],
    commentary: "Strong partnership and family evidence. Community and maintenance are unknown, so the score is coverage-capped."
  },
  creative: {
    label: "Creative",
    question: "Am I making original things?",
    definition: "Creative capability and practice. Difficulty alone is not creative evidence.",
    evidence: ["Portfolio of original work", "Release cadence", "External reception"],
    commentary: "Distinctive ideation and craft with a steady output rhythm; external reception is still limited."
  },
  experiential: {
    label: "Experiential",
    question: "How richly am I living?",
    definition: "Cumulative breadth combined with recent novelty, challenge, and immersion.",
    evidence: ["Places & immersion log", "Challenges undertaken", "Written reflections"],
    commentary: "Only historical breadth is evidenced. Recent engagement cannot be established, so the vector stays unknown."
  }
};

// [anchor | null, confidence]
const EXAMPLE_JUDGMENTS = {
  physical: [[70, "medium"], [70, "medium"], [85, "high"], [null], [50, "medium"]],
  psychological: [[70, "high"], [70, "high"], [85, "high"], [70, "medium"], [85, "high"]],
  intellectual: [[95, "high"], [85, "high"], [85, "high"], [70, "medium"], [70, "medium"]],
  professional: [[70, "medium"], [85, "high"], [70, "medium"], [50, "medium"], [null]],
  financial: [[85, "high"], [25, "high"], [25, "medium"], [70, "medium"], [null]],
  relational: [[85, "medium"], [70, "low"], [70, "medium"], [null], [null]],
  creative: [[85, "medium"], [85, "high"], [70, "medium"], [50, "low"], [85, "medium"]],
  experiential: [[70, "medium"], [null], [null], [null], [50, "low"]]
};

// Earlier Methodology 2.0.1 snapshots (oldest first), synthetic.
const EXAMPLE_HISTORY = {
  physical: [58.2, 60.5, 61.9, 64.4, 66.1, 68.8],
  psychological: [71.0, 72.4, 73.3, 72.9, 74.6, 75.3],
  intellectual: [76.4, 77.9, 79.0, 80.3, 81.1, 81.8],
  professional: [60.1, 62.8, 64.5, 66.0, 67.9, 68.8],
  financial: [55.6, 55.1, 54.4, 53.9, 53.5, 53.2],
  relational: [null, null, 66.3, 68.0, 70.0, 70.0],
  creative: [68.7, 70.2, 71.8, 72.5, 73.9, 74.3],
  experiential: [null, null, null, null, null, null]
};

export const SNAPSHOT_DATES = ["Apr 2026", "May 2026", "Jun 2026", "Jul 2026", "Aug 2026", "Sep 2026"];

export function buildSubdomains(vectorId, judgments = EXAMPLE_JUDGMENTS[vectorId]) {
  const definition = KLEOS_VECTOR_METHODOLOGY.vectors.find((vector) => vector.id === vectorId);
  return definition.subdomains.map((subdomain, index) => {
    const [score, confidence] = judgments[index] || [null];
    const assessed = score !== null && score !== undefined;
    return {
      id: subdomain.id,
      label: SUBDOMAIN_LABELS[subdomain.id] || subdomain.id,
      weight: subdomain.weight,
      status: assessed ? "assessed" : "unknown",
      score: assessed ? score : null,
      confidence: assessed ? confidence : "unknown"
    };
  });
}

export function getExampleJudgments(vectorId) {
  return EXAMPLE_JUDGMENTS[vectorId].map(([score, confidence]) => ({
    score: score ?? null,
    confidence: confidence || "medium"
  }));
}

export const PUBLIC_VECTORS = Object.freeze(
  KLEOS_VECTOR_METHODOLOGY.vectors.map((vector, index) => {
    const subdomains = buildSubdomains(vector.id);
    const result = aggregateVectorSubdomains(subdomains);
    const history = EXAMPLE_HISTORY[vector.id];
    const previous = history[history.length - 2];
    return Object.freeze({
      id: vector.id,
      index,
      ...VECTOR_COPY[vector.id],
      subdomains,
      result,
      history,
      delta:
        result.status === "assessed" && previous !== null
          ? Math.round((result.score - previous) * 10) / 10
          : null
    });
  })
);

export function formatScore(value) {
  if (value === null || value === undefined) return "—";
  return Number(value).toFixed(1).replace(/\.0$/, "");
}

export function confidenceLabel(confidence) {
  if (!confidence || confidence === "unknown") return "Not assessable";
  return `${confidence[0].toUpperCase()}${confidence.slice(1)} confidence`;
}

/** Polar helpers shared by the radial visualisations. Physical sits at 12 o'clock. */
export function polar(index, radius, count = 8) {
  const angle = (Math.PI * 2 * index) / count - Math.PI / 2;
  return [Math.cos(angle) * radius, Math.sin(angle) * radius];
}

export function angleDeg(index, count = 8) {
  return (360 * index) / count;
}

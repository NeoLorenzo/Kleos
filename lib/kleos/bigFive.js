export const BIG_FIVE_DOMAINS = [
  {
    id: "neuroticism",
    label: "Neuroticism",
    column: "neuroticism_score",
    facets: [
      ["anxiety", "Anxiety", "anxiety_score"],
      ["anger", "Anger", "anger_score"],
      ["depression", "Depression", "depression_score"],
      ["self-consciousness", "Self-Consciousness", "self_consciousness_score"],
      ["immoderation", "Immoderation", "immoderation_score"],
      ["vulnerability", "Vulnerability", "vulnerability_score"]
    ]
  },
  {
    id: "extraversion",
    label: "Extraversion",
    column: "extraversion_score",
    facets: [
      ["friendliness", "Friendliness", "friendliness_score"],
      ["gregariousness", "Gregariousness", "gregariousness_score"],
      ["assertiveness", "Assertiveness", "assertiveness_score"],
      ["activity-level", "Activity Level", "activity_level_score"],
      ["excitement-seeking", "Excitement-Seeking", "excitement_seeking_score"],
      ["cheerfulness", "Cheerfulness", "cheerfulness_score"]
    ]
  },
  {
    id: "openness",
    label: "Openness to Experience",
    column: "openness_score",
    facets: [
      ["imagination", "Imagination", "imagination_score"],
      ["artistic-interests", "Artistic Interests", "artistic_interests_score"],
      ["emotionality", "Emotionality", "emotionality_score"],
      ["adventurousness", "Adventurousness", "adventurousness_score"],
      ["intellect", "Intellect", "intellect_score"],
      ["liberalism", "Liberalism", "liberalism_score"]
    ]
  },
  {
    id: "agreeableness",
    label: "Agreeableness",
    column: "agreeableness_score",
    facets: [
      ["trust", "Trust", "trust_score"],
      ["morality", "Morality", "morality_score"],
      ["altruism", "Altruism", "altruism_score"],
      ["cooperation", "Cooperation", "cooperation_score"],
      ["modesty", "Modesty", "modesty_score"],
      ["sympathy", "Sympathy", "sympathy_score"]
    ]
  },
  {
    id: "conscientiousness",
    label: "Conscientiousness",
    column: "conscientiousness_score",
    facets: [
      ["self-efficacy", "Self-Efficacy", "self_efficacy_score"],
      ["orderliness", "Orderliness", "orderliness_score"],
      ["dutifulness", "Dutifulness", "dutifulness_score"],
      ["achievement-striving", "Achievement-Striving", "achievement_striving_score"],
      ["self-discipline", "Self-Discipline", "self_discipline_score"],
      ["cautiousness", "Cautiousness", "cautiousness_score"]
    ]
  }
].map((domain) => ({
  ...domain,
  facets: domain.facets.map(([id, label, column]) => ({ id, label, column }))
}));

export const BIG_FIVE_SCORE_COLUMNS = BIG_FIVE_DOMAINS.flatMap((domain) => [
  domain.column,
  ...domain.facets.map((facet) => facet.column)
]);

export const BIG_FIVE_SELECT_COLUMNS = [
  "id",
  "test_date",
  ...BIG_FIVE_SCORE_COLUMNS,
  "created_at"
].join(",");

export function createEmptyBigFiveDraft() {
  return BIG_FIVE_SCORE_COLUMNS.reduce(
    (draft, column) => ({ ...draft, [column]: "" }),
    { testDate: "" }
  );
}

export function validateBigFiveDraft(draft) {
  const testDate = String(draft?.testDate || "").trim();
  if (!isValidCalendarDate(testDate)) {
    return {
      ok: false,
      message: "Enter the actual test date shown on the BigFive-Test report."
    };
  }

  const payload = { test_date: testDate };
  for (const column of BIG_FIVE_SCORE_COLUMNS) {
    const rawValue = draft?.[column];
    if (rawValue === "" || rawValue === null || rawValue === undefined) {
      return {
        ok: false,
        message: "Enter all 5 domain scores and all 30 facet scores."
      };
    }

    const score = Number(rawValue);
    if (!Number.isFinite(score) || score < 0) {
      return {
        ok: false,
        message: "Big Five scores must be non-negative numbers exactly as reported by the test."
      };
    }
    payload[column] = score;
  }

  return { ok: true, payload };
}

export function sortBigFiveAssessments(assessments) {
  return [...(assessments || [])].sort((left, right) => {
    const byDate = String(right?.test_date || "").localeCompare(String(left?.test_date || ""));
    if (byDate !== 0) return byDate;
    return String(right?.created_at || "").localeCompare(String(left?.created_at || ""));
  });
}

export function formatBigFiveTestDate(value, locale) {
  if (!isValidCalendarDate(value)) return "-";
  const [year, month, day] = String(value).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: "UTC"
  }).format(date);
}

export function isValidCalendarDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

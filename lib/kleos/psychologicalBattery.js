export const PSYCHOLOGICAL_BATTERY_VERSION = "1.0.0";

export const PSYCHOLOGICAL_INSTRUMENT_VERSIONS = Object.freeze({
  who5: "WHO-5 English original, WHO 2024 open-access republication",
  swls: "SWLS English original, Diener et al. 1985",
  pss10: "PSS-10 English original; scoring rules per official distribution",
  gad7: "GAD-7 English original, Spitzer et al. 2006",
  phq9: "PHQ-9 English original, Kroenke et al. 2001",
  kleos: "Kleos psychological facets v1.0.0"
});

export const WHO5_RESPONSE_OPTIONS = Object.freeze([
  { value: 5, label: "All of the time" },
  { value: 4, label: "Most of the time" },
  { value: 3, label: "More than half of the time" },
  { value: 2, label: "Less than half of the time" },
  { value: 1, label: "Some of the time" },
  { value: 0, label: "At no time" }
]);

export const AGREEMENT_7_OPTIONS = Object.freeze([
  { value: 7, label: "Strongly agree" },
  { value: 6, label: "Agree" },
  { value: 5, label: "Slightly agree" },
  { value: 4, label: "Neither agree nor disagree" },
  { value: 3, label: "Slightly disagree" },
  { value: 2, label: "Disagree" },
  { value: 1, label: "Strongly disagree" }
]);

export const FREQUENCY_4_OPTIONS = Object.freeze([
  { value: 0, label: "Not at all" },
  { value: 1, label: "Several days" },
  { value: 2, label: "More than half the days" },
  { value: 3, label: "Nearly every day" }
]);

export const PSS10_RESPONSE_OPTIONS = Object.freeze([
  { value: 0, label: "Never" },
  { value: 1, label: "Almost never" },
  { value: 2, label: "Sometimes" },
  { value: 3, label: "Fairly often" },
  { value: 4, label: "Very often" }
]);

export const KLEOS_FACET_OPTIONS = Object.freeze([
  { value: 0, label: "Strongly disagree" },
  { value: 1, label: "Disagree" },
  { value: 2, label: "Neither agree nor disagree" },
  { value: 3, label: "Agree" },
  { value: 4, label: "Strongly agree" }
]);

export const PSYCHOLOGICAL_INSTRUMENTS = Object.freeze([
  {
    id: "who5",
    shortLabel: "WHO-5",
    title: "WHO-5 Well-Being Index",
    timeframe: "Over the last two weeks",
    responseOptions: WHO5_RESPONSE_OPTIONS,
    attribution: "© World Health Organization 2024. CC BY-NC-SA 3.0 IGO.",
    sourceUrl: "https://www.who.int/publications/m/item/WHO-UCN-MSD-MHE-2024.01",
    items: [
      "I have felt cheerful and in good spirits",
      "I have felt calm and relaxed",
      "I have felt active and vigorous",
      "I woke up feeling fresh and rested",
      "My daily life has been filled with things that interest me"
    ]
  },
  {
    id: "swls",
    shortLabel: "SWLS",
    title: "Satisfaction With Life Scale",
    timeframe: "Current global life satisfaction",
    responseOptions: AGREEMENT_7_OPTIONS,
    attribution: "Diener, Emmons, Larsen & Griffin (1985). Non-commercial use with attribution.",
    sourceUrl: "https://eddiener.com/satisfaction-with-life-scale-swls/",
    items: [
      "In most ways my life is close to my ideal.",
      "The conditions of my life are excellent.",
      "I am satisfied with my life.",
      "So far I have gotten the important things I want in life.",
      "If I could live my life over, I would change almost nothing."
    ]
  },
  {
    id: "pss10",
    shortLabel: "PSS-10",
    title: "Perceived Stress Scale (PSS-10)",
    timeframe: "During the last month — use the exact wording on the authorized PSS-10 form",
    responseOptions: PSS10_RESPONSE_OPTIONS,
    attribution: "PSS-10 is distributed by Mapi Research Trust on behalf of its copyright owner.",
    sourceUrl: "https://www.cmu.edu/dietrich/psychology/stress-immunity-disease-lab/scales/index.html",
    licensedTextExternal: true,
    items: Array.from({ length: 10 }, (_, index) => `PSS-10 item ${index + 1}`)
  },
  {
    id: "gad7",
    shortLabel: "GAD-7",
    title: "Generalized Anxiety Disorder 7-item scale",
    timeframe: "Over the last two weeks",
    responseOptions: FREQUENCY_4_OPTIONS,
    attribution: "Developed by Spitzer, Williams, Kroenke and colleagues with an educational grant from Pfizer; no permission required to reproduce, translate, display or distribute.",
    sourceUrl: "https://www.nih.gov/node/19876",
    items: [
      "Feeling nervous, anxious or on edge",
      "Not being able to stop or control worrying",
      "Worrying too much about different things",
      "Trouble relaxing",
      "Being so restless that it is hard to sit still",
      "Becoming easily annoyed or irritable",
      "Feeling afraid as if something awful might happen"
    ]
  },
  {
    id: "phq9",
    shortLabel: "PHQ-9",
    title: "Patient Health Questionnaire-9",
    timeframe: "Over the last two weeks",
    responseOptions: FREQUENCY_4_OPTIONS,
    attribution: "Developed by Spitzer, Williams, Kroenke and colleagues with an educational grant from Pfizer; no permission required to reproduce, translate, display or distribute.",
    sourceUrl: "https://www.nih.gov/node/19946",
    items: [
      "Little interest or pleasure in doing things",
      "Feeling down, depressed, or hopeless",
      "Trouble falling or staying asleep, or sleeping too much",
      "Feeling tired or having little energy",
      "Poor appetite or overeating",
      "Feeling bad about yourself — or that you are a failure or have let yourself or your family down",
      "Trouble concentrating on things, such as reading the newspaper or watching television",
      "Moving or speaking so slowly that other people could have noticed, or the opposite — being so fidgety or restless that you have been moving around a lot more than usual",
      "Thoughts that you would be better off dead, or of hurting yourself in some way"
    ]
  }
]);

export const KLEOS_PSYCHOLOGICAL_FACETS = Object.freeze([
  { id: "agency", label: "Agency / perceived control", item: "I feel able to influence what happens in my life." },
  { id: "task_initiation", label: "Motivation / task initiation", item: "I can get myself started on important tasks when I intend to." },
  { id: "follow_through", label: "Procrastination resistance", item: "I follow through on important tasks without repeatedly delaying them." },
  { id: "resilience", label: "Resilience", item: "I recover effectively after setbacks." },
  { id: "rumination_control", label: "Rumination control", item: "I can disengage from repetitive, unproductive thoughts." },
  { id: "self_respect", label: "Self-esteem / self-respect", item: "I respect and value myself." },
  { id: "meaning_coherence", label: "Meaning / coherence", item: "My life feels meaningful and internally coherent." },
  { id: "intrinsic_motivation", label: "Intrinsic motivation", item: "A substantial share of what I do feels self-chosen rather than merely obligatory." },
  { id: "psychological_energy", label: "Burnout / psychological energy", item: "I have enough psychological energy for my responsibilities." },
  { id: "guilt_free_relaxation", label: "Ability to relax", item: "I can relax without feeling guilty that I should be doing something productive." },
  { id: "social_connection", label: "Loneliness / social connection", item: "I feel meaningfully connected to other people." }
]);

export const PSYCHOLOGICAL_SELECT_COLUMNS = [
  "id",
  "assessed_at",
  "battery_version",
  "instrument_versions",
  "responses",
  "who5_raw_score",
  "who5_percentage",
  "swls_score",
  "pss10_score",
  "gad7_score",
  "phq9_score",
  "phq9_item_9",
  "kleos_facets",
  "created_at",
  "updated_at"
].join(",");

export function createEmptyPsychologicalDraft() {
  return {
    who5: Array(5).fill(""),
    swls: Array(5).fill(""),
    pss10: Array(10).fill(""),
    gad7: Array(7).fill(""),
    phq9: Array(9).fill(""),
    kleos: Object.fromEntries(KLEOS_PSYCHOLOGICAL_FACETS.map((facet) => [facet.id, ""]))
  };
}

export function psychologicalAssessmentToDraft(assessment) {
  const draft = createEmptyPsychologicalDraft();
  const responses = assessment?.responses || {};

  for (const key of ["who5", "swls", "pss10", "gad7", "phq9"]) {
    if (Array.isArray(responses[key]) && responses[key].length === draft[key].length) {
      draft[key] = responses[key].map((value) => String(value));
    }
  }

  const facets = responses.kleos || assessment?.kleos_facets || {};
  for (const facet of KLEOS_PSYCHOLOGICAL_FACETS) {
    if (facets[facet.id] !== undefined && facets[facet.id] !== null) {
      draft.kleos[facet.id] = String(facets[facet.id]);
    }
  }

  return draft;
}

export function countPsychologicalAnswers(draft) {
  const instrumentAnswers = ["who5", "swls", "pss10", "gad7", "phq9"].reduce(
    (count, key) => count + (Array.isArray(draft?.[key]) ? draft[key].filter(isAnswered).length : 0),
    0
  );
  const facetAnswers = KLEOS_PSYCHOLOGICAL_FACETS.reduce(
    (count, facet) => count + (isAnswered(draft?.kleos?.[facet.id]) ? 1 : 0),
    0
  );
  return instrumentAnswers + facetAnswers;
}

export function getPsychologicalQuestionCount() {
  return 5 + 5 + 10 + 7 + 9 + KLEOS_PSYCHOLOGICAL_FACETS.length;
}

export function validatePsychologicalDraft(draft) {
  const normalized = {};
  const schemas = {
    who5: { length: 5, min: 0, max: 5 },
    swls: { length: 5, min: 1, max: 7 },
    pss10: { length: 10, min: 0, max: 4 },
    gad7: { length: 7, min: 0, max: 3 },
    phq9: { length: 9, min: 0, max: 3 }
  };

  for (const [key, schema] of Object.entries(schemas)) {
    const result = normalizeResponseArray(draft?.[key], schema);
    if (!result.ok) {
      return { ok: false, message: `Complete every ${key.toUpperCase()} item using the provided response scale.` };
    }
    normalized[key] = result.values;
  }

  const kleos = {};
  for (const facet of KLEOS_PSYCHOLOGICAL_FACETS) {
    const raw = draft?.kleos?.[facet.id];
    const value = Number(raw);
    if (!isAnswered(raw) || !Number.isInteger(value) || value < 0 || value > 4) {
      return { ok: false, message: "Complete every Kleos-specific psychological facet." };
    }
    kleos[facet.id] = value;
  }

  const scores = scorePsychologicalResponses({ ...normalized, kleos });
  return {
    ok: true,
    payload: {
      battery_version: PSYCHOLOGICAL_BATTERY_VERSION,
      instrument_versions: PSYCHOLOGICAL_INSTRUMENT_VERSIONS,
      responses: { ...normalized, kleos },
      who5_raw_score: scores.who5.raw,
      who5_percentage: scores.who5.percentage,
      swls_score: scores.swls.raw,
      pss10_score: scores.pss10.raw,
      gad7_score: scores.gad7.raw,
      phq9_score: scores.phq9.raw,
      phq9_item_9: normalized.phq9[8],
      kleos_facets: kleos
    },
    scores
  };
}

export function scorePsychologicalResponses(responses) {
  const who5Raw = sum(responses.who5);
  const swlsRaw = sum(responses.swls);
  const pss10Raw = responses.pss10.reduce(
    (total, value, index) => total + (PSS10_REVERSE_INDEXES.has(index) ? 4 - value : value),
    0
  );
  const gad7Raw = sum(responses.gad7);
  const phq9Raw = sum(responses.phq9);

  return {
    who5: { raw: who5Raw, percentage: who5Raw * 4, category: who5Raw < 13 ? "Below suggested wellbeing cut-off" : "At or above suggested wellbeing cut-off" },
    swls: { raw: swlsRaw, category: getSwlsCategory(swlsRaw) },
    pss10: { raw: pss10Raw, category: null },
    gad7: { raw: gad7Raw, category: getGad7Category(gad7Raw) },
    phq9: { raw: phq9Raw, category: getPhq9Category(phq9Raw) },
    kleos: { ...responses.kleos }
  };
}

export function getSwlsCategory(score) {
  if (score >= 31) return "Extremely satisfied";
  if (score >= 26) return "Satisfied";
  if (score >= 21) return "Slightly satisfied";
  if (score === 20) return "Neutral";
  if (score >= 15) return "Slightly dissatisfied";
  if (score >= 10) return "Dissatisfied";
  return "Extremely dissatisfied";
}

export function getGad7Category(score) {
  if (score >= 15) return "Severe screening range";
  if (score >= 10) return "Moderate screening range";
  if (score >= 5) return "Mild screening range";
  return "Minimal screening range";
}

export function getPhq9Category(score) {
  if (score >= 20) return "Severe screening range";
  if (score >= 15) return "Moderately severe screening range";
  if (score >= 10) return "Moderate screening range";
  if (score >= 5) return "Mild screening range";
  return "Minimal screening range";
}

export function sortPsychologicalAssessments(assessments = []) {
  return [...assessments].sort((left, right) => {
    const leftTime = new Date(left?.assessed_at || left?.created_at || 0).getTime();
    const rightTime = new Date(right?.assessed_at || right?.created_at || 0).getTime();
    return rightTime - leftTime;
  });
}

export function formatPsychologicalAssessmentDate(value, locale = undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
}

const PSS10_REVERSE_INDEXES = new Set([3, 4, 6, 7]);

function normalizeResponseArray(values, { length, min, max }) {
  if (!Array.isArray(values) || values.length !== length) return { ok: false };
  const normalized = values.map(Number);
  const valid = normalized.every(
    (value, index) => isAnswered(values[index]) && Number.isInteger(value) && value >= min && value <= max
  );
  return valid ? { ok: true, values: normalized } : { ok: false };
}

function sum(values) {
  return values.reduce((total, value) => total + Number(value), 0);
}

function isAnswered(value) {
  return value !== "" && value !== null && value !== undefined;
}

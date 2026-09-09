const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { test, before } = require("node:test");
const path = require("node:path");

let helpers;

before(async () => {
  const sourcePath = path.join(process.cwd(), "lib/kleos/psychologicalBattery.js");
  const source = await readFile(sourcePath, "utf8");
  helpers = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
});

test("battery contains 36 validated response slots plus 11 Kleos facets", () => {
  const validatedCount = helpers.PSYCHOLOGICAL_INSTRUMENTS.reduce(
    (count, instrument) => count + instrument.items.length,
    0
  );
  assert.equal(validatedCount, 36);
  assert.equal(helpers.KLEOS_PSYCHOLOGICAL_FACETS.length, 11);
  assert.equal(helpers.getPsychologicalQuestionCount(), 47);
});

test("PSS-10 wording stays outside the public source while preserving ten response slots", () => {
  const pss = helpers.PSYCHOLOGICAL_INSTRUMENTS.find((instrument) => instrument.id === "pss10");
  assert.equal(pss.licensedTextExternal, true);
  assert.equal(pss.items.length, 10);
  assert.ok(pss.items.every((item, index) => item === `PSS-10 item ${index + 1}`));
});

test("WHO-5 scoring returns raw and official 0-100 transform", () => {
  const responses = completeResponses();
  responses.who5 = [5, 4, 3, 2, 1];
  const result = helpers.scorePsychologicalResponses(responses);
  assert.equal(result.who5.raw, 15);
  assert.equal(result.who5.percentage, 60);
});

test("PSS-10 reverse scores items 4, 5, 7 and 8", () => {
  const responses = completeResponses();
  responses.pss10 = [0, 1, 2, 3, 4, 0, 1, 2, 3, 4];
  const result = helpers.scorePsychologicalResponses(responses);
  // 0 + 1 + 2 + (4-3) + (4-4) + 0 + (4-1) + (4-2) + 3 + 4 = 16
  assert.equal(result.pss10.raw, 16);
});

test("validated scales remain independent and no aggregate psychological score is created", () => {
  const responses = completeResponses();
  const result = helpers.scorePsychologicalResponses(responses);
  assert.deepEqual(Object.keys(result).sort(), ["gad7", "kleos", "phq9", "pss10", "swls", "who5"]);
  assert.equal("overall" in result, false);
  assert.equal("psychological" in result, false);
});

test("validation rejects partial submissions and preserves PHQ-9 item 9 separately", () => {
  const draft = helpers.createEmptyPsychologicalDraft();
  assert.equal(helpers.validatePsychologicalDraft(draft).ok, false);

  fillDraft(draft, 0);
  draft.swls = Array(5).fill("4");
  draft.phq9[8] = "2";
  const validation = helpers.validatePsychologicalDraft(draft);
  assert.equal(validation.ok, true);
  assert.equal(validation.payload.phq9_item_9, 2);
  assert.equal(validation.payload.phq9_score, 2);
  assert.equal(validation.payload.swls_score, 20);
  assert.equal(validation.scores.swls.category, "Neutral");
});

test("stored responses can deterministically repopulate an editable draft", () => {
  const draft = helpers.createEmptyPsychologicalDraft();
  fillDraft(draft, 1);
  draft.swls = Array(5).fill("5");
  const validation = helpers.validatePsychologicalDraft(draft);
  const restored = helpers.psychologicalAssessmentToDraft({
    responses: validation.payload.responses,
    kleos_facets: validation.payload.kleos_facets
  });
  assert.equal(restored.gad7[0], "1");
  assert.equal(restored.swls[4], "5");
  assert.equal(restored.kleos.agency, "1");
});

function completeResponses() {
  return {
    who5: [0, 0, 0, 0, 0],
    swls: [1, 1, 1, 1, 1],
    pss10: Array(10).fill(0),
    gad7: Array(7).fill(0),
    phq9: Array(9).fill(0),
    kleos: Object.fromEntries(helpers.KLEOS_PSYCHOLOGICAL_FACETS.map((facet) => [facet.id, 0]))
  };
}

function fillDraft(draft, value) {
  draft.who5 = Array(5).fill(String(value));
  draft.pss10 = Array(10).fill(String(value));
  draft.gad7 = Array(7).fill(String(value));
  draft.phq9 = Array(9).fill(String(value));
  for (const facet of helpers.KLEOS_PSYCHOLOGICAL_FACETS) {
    draft.kleos[facet.id] = String(value);
  }
}

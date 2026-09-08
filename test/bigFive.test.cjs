const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { test, before } = require("node:test");
const path = require("node:path");

let helpers;

before(async () => {
  const sourcePath = path.join(process.cwd(), "lib/kleos/bigFive.js");
  const source = await readFile(sourcePath, "utf8");
  helpers = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
});

test("Big Five schema defines exactly five domains and thirty facets", () => {
  assert.equal(helpers.BIG_FIVE_DOMAINS.length, 5);
  assert.equal(
    helpers.BIG_FIVE_DOMAINS.reduce((count, domain) => count + domain.facets.length, 0),
    30
  );
  assert.equal(helpers.BIG_FIVE_SCORE_COLUMNS.length, 35);
  assert.equal(new Set(helpers.BIG_FIVE_SCORE_COLUMNS).size, 35);
});

test("new Big Five drafts never substitute the current/import date", () => {
  const draft = helpers.createEmptyBigFiveDraft();
  assert.equal(draft.testDate, "");
  assert.equal(Object.keys(draft).length, 36);
});

test("validation preserves the report test date and all numeric scores", () => {
  const draft = helpers.createEmptyBigFiveDraft();
  draft.testDate = "2024-03-06";
  helpers.BIG_FIVE_SCORE_COLUMNS.forEach((column, index) => {
    draft[column] = String(index + 1);
  });

  const result = helpers.validateBigFiveDraft(draft);
  assert.equal(result.ok, true);
  assert.equal(result.payload.test_date, "2024-03-06");
  assert.equal(Object.keys(result.payload).length, 36);
  assert.equal(result.payload.neuroticism_score, 1);
  assert.equal(result.payload.cautiousness_score, 35);
  assert.equal("description" in result.payload, false);
  assert.equal("result_id" in result.payload, false);
});

test("validation rejects impossible dates, missing scores, and negative values", () => {
  const draft = helpers.createEmptyBigFiveDraft();
  draft.testDate = "2024-02-30";
  assert.equal(helpers.validateBigFiveDraft(draft).ok, false);

  draft.testDate = "2024-03-06";
  assert.equal(helpers.validateBigFiveDraft(draft).ok, false);

  helpers.BIG_FIVE_SCORE_COLUMNS.forEach((column) => {
    draft[column] = "10";
  });
  draft.anxiety_score = "-1";
  assert.equal(helpers.validateBigFiveDraft(draft).ok, false);
});

test("date-only formatting does not drift across time zones", () => {
  assert.equal(helpers.formatBigFiveTestDate("2024-03-06", "en-GB"), "6 Mar 2024");
  assert.equal(helpers.formatBigFiveTestDate("not-a-date", "en-GB"), "-");
});

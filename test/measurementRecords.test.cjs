const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { test, before } = require("node:test");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

let helpers;

before(async () => {
  const sourcePath = path.join(process.cwd(), "lib/kleos/measurementRecords.js");
  const source = await readFile(sourcePath, "utf8");
  helpers = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
});

test("score corrections enforce the create-flow range and preserve commentary", () => {
  assert.equal(helpers.validateScoreDraft({ score: -1, entryDate: "2026-09-06", commentary: "" }).ok, false);
  assert.equal(helpers.validateScoreDraft({ score: 101, entryDate: "2026-09-06", commentary: "" }).ok, false);

  assert.deepEqual(
    helpers.validateScoreDraft({ score: "82.5", entryDate: "2026-09-06", commentary: "  revised  " }),
    {
      ok: true,
      payload: { score: 82.5, entry_date: "2026-09-06", llm_commentary: "revised" }
    }
  );
});

test("lift corrections reject invalid reps and normalize valid payloads", () => {
  assert.equal(
    helpers.validateLiftDraft({ exerciseName: "Bench", weightKg: "80", reps: "4.5", performedAt: "2026-09-06" }).ok,
    false
  );

  const result = helpers.validateLiftDraft({
    exerciseName: " Flat Barbell Bench ",
    weightKg: "90",
    reps: "5",
    performedAt: "2026-09-06"
  });

  assert.equal(result.ok, true);
  assert.equal(result.payload.exercise_name, "Flat Barbell Bench");
  assert.equal(result.payload.weight_kg, 90);
  assert.equal(result.payload.reps, 5);
  assert.match(result.payload.performed_at, /^2026-09-06T/);
});

test("cognitive corrections enforce every 0-10 context rating", () => {
  const draft = {
    testName: "Mensa Norway",
    score: "128",
    takenAt: "2026-09-06T12:30",
    hunger: "3",
    distractions: "2",
    wakefulness: "8",
    mood: "7"
  };

  assert.equal(helpers.validateCognitiveDraft({ ...draft, mood: "11" }).ok, false);

  const result = helpers.validateCognitiveDraft(draft);
  assert.equal(result.ok, true);
  assert.deepEqual(
    {
      test_name: result.payload.test_name,
      score_text: result.payload.score_text,
      hunger: result.payload.hunger,
      distractions: result.payload.distractions,
      wakefulness: result.payload.wakefulness,
      mood: result.payload.mood
    },
    {
      test_name: "Mensa Norway",
      score_text: "128",
      hunger: 3,
      distractions: 2,
      wakefulness: 8,
      mood: 7
    }
  );
  assert.equal(Number.isNaN(new Date(result.payload.taken_at).getTime()), false);
});

test("row-to-draft conversion keeps editable canonical values", () => {
  assert.deepEqual(
    helpers.scoreRowToDraft({ score: 75, entry_date: "2026-09-01", llm_commentary: "note" }),
    { score: "75", entryDate: "2026-09-01", commentary: "note" }
  );

  assert.deepEqual(
    helpers.liftRowToDraft({
      exercise_name: "Bench",
      weight_kg: 80,
      reps: 6,
      performed_at: "2026-09-02T00:00:00.000Z"
    }),
    { exerciseName: "Bench", weightKg: "80", reps: "6", performedAt: "2026-09-02" }
  );
});

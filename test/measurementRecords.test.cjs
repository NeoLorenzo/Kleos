const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { test, before } = require("node:test");
const path = require("node:path");

process.env.TZ = "Europe/Lisbon";

let helpers;

before(async () => {
  const sourcePath = path.join(process.cwd(), "lib/kleos/measurementRecords.js");
  const source = await readFile(sourcePath, "utf8");
  helpers = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
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
  assert.match(result.payload.performed_at, /^2026-09-05T23:00:00\.000Z$/);
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

test("row-to-draft conversion keeps canonical local dates editable", () => {
  assert.deepEqual(
    helpers.liftRowToDraft({
      exercise_name: "Bench",
      weight_kg: 80,
      reps: 6,
      performed_at: "2026-09-05T23:00:00.000Z"
    }),
    { exerciseName: "Bench", weightKg: "80", reps: "6", performedAt: "2026-09-06" }
  );

  assert.deepEqual(
    helpers.cognitiveRowToDraft({
      test_name: "Mensa Norway",
      score_text: "128",
      taken_at: "2026-09-06T11:30:00.000Z",
      hunger: 3,
      distractions: 2,
      wakefulness: 8,
      mood: 7
    }),
    {
      testName: "Mensa Norway",
      score: "128",
      takenAt: "2026-09-06T12:30",
      hunger: "3",
      distractions: "2",
      wakefulness: "8",
      mood: "7"
    }
  );
});

test("successful edits reconcile only the matching local record", () => {
  const records = {
    lift: [{ id: 1, weight_kg: 80 }, { id: 2, weight_kg: 90 }],
    cognitive: [{ id: 3, score_text: "120" }]
  };
  const updated = { id: 2, weight_kg: 92.5 };

  const next = helpers.replaceMeasurementRecord(records, "lift", updated);

  assert.deepEqual(next.lift, [{ id: 1, weight_kg: 80 }, updated]);
  assert.equal(next.cognitive, records.cognitive);
  assert.deepEqual(records.lift, [{ id: 1, weight_kg: 80 }, { id: 2, weight_kg: 90 }]);
});

test("successful deletions immediately remove only the matching local record", () => {
  const records = {
    lift: [{ id: 1, weight_kg: 90 }, { id: 2, weight_kg: 100 }],
    cognitive: [{ id: 3, score_text: "120" }]
  };

  const next = helpers.removeMeasurementRecord(records, "lift", 1);

  assert.deepEqual(next.lift, [{ id: 2, weight_kg: 100 }]);
  assert.equal(next.cognitive, records.cognitive);
  assert.deepEqual(records.lift, [{ id: 1, weight_kg: 90 }, { id: 2, weight_kg: 100 }]);
});

test("legacy GOAT score records are no longer accepted as editable measurements", () => {
  assert.throws(
    () => helpers.replaceMeasurementRecord({ score: [{ id: 1 }] }, "score", { id: 1 }),
    /Unknown measurement kind: score/
  );
});

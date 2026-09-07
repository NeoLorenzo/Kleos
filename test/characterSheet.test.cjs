const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { test, before } = require("node:test");
const path = require("node:path");

let helpers;

before(async () => {
  const vectorsSource = await readFile(path.join(process.cwd(), "lib/kleos/vectorSnapshots.js"), "utf8");
  const vectorsUrl = `data:text/javascript;base64,${Buffer.from(vectorsSource).toString("base64")}`;
  const helperSource = await readFile(path.join(process.cwd(), "lib/kleos/characterSheet.js"), "utf8");
  const patched = helperSource.replace(
    'from "@/lib/kleos/vectorSnapshots";',
    `from "${vectorsUrl}";`
  );
  helpers = await import(`data:text/javascript;base64,${Buffer.from(patched).toString("base64")}`);
});

test("character sheet maps representative raw evidence without inventing missing domains", () => {
  const evidence = helpers.buildCharacterEvidence({
    strengthProfile: { heightCm: 190, bodyWeightKg: 88.9 },
    strengthLifts: [{ exercise_name: "Flat Barbell Bench", weight_kg: 95, reps: 6 }],
    cognitiveTests: [{ test_name: "Mensa Norway", score_text: "135" }],
    academicStages: [{ stage: 2, stage_mean: 75 }],
    academicModules: [{ module_name: "Example" }],
    healthProfile: { bloodTestText: "recorded", miscText: "" },
    cvText: "Professional record",
    miscText: "",
    academicNotes: ""
  });

  assert.ok(evidence.physical.some((item) => item.includes("190 cm")));
  assert.ok(evidence.intellectual.some((item) => item.includes("75%")));
  assert.ok(evidence.professional.some((item) => item.includes("CV")));
  assert.ok(evidence.psychological.some((item) => item.includes("No dedicated psychological")));
});

test("vector trajectory preserves assessed, unknown, and missing historical states", () => {
  const snapshots = [
    {
      id: "new",
      evaluatedAt: "2026-09-07T10:00:00Z",
      results: [{ vectorId: "physical", status: "assessed", score: 72, confidence: "medium" }]
    },
    {
      id: "middle",
      evaluatedAt: "2026-08-31T10:00:00Z",
      results: [{ vectorId: "physical", status: "unknown", score: null, confidence: "unknown" }]
    },
    {
      id: "old",
      evaluatedAt: "2026-08-24T10:00:00Z",
      results: []
    }
  ];

  const trajectory = helpers.buildVectorTrajectory(snapshots, "physical");
  assert.deepEqual(trajectory.map((point) => point.status), ["assessed", "unknown", "missing"]);
  assert.equal(helpers.formatTrajectorySummary(trajectory), "— → ? → 72");
});

test("trajectory rejects non-canonical vector identifiers", () => {
  assert.deepEqual(helpers.buildVectorTrajectory([], "made-up-vector"), []);
});

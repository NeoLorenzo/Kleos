const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { test, before } = require("node:test");
const path = require("node:path");

let model;

before(async () => {
  const sourcePath = path.join(process.cwd(), "lib/kleos/vectorSnapshots.js");
  const source = await readFile(sourcePath, "utf8");
  model = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
});

function representativeResults() {
  return model.VECTOR_IDS.map((vectorId, index) => index === 1
    ? {
        vectorId,
        status: "unknown",
        score: null,
        confidence: "unknown",
        commentary: "Insufficient canonical evidence for a defensible assessment."
      }
    : {
        vectorId,
        status: "assessed",
        score: 60 + index,
        confidence: index % 2 ? "medium" : "high",
        commentary: `Representative evidence supports ${vectorId}.`
      });
}

test("canonical vector identifiers match the shared Ariadne contract", () => {
  assert.deepEqual(model.VECTOR_IDS, [
    "physical",
    "psychological",
    "intellectual",
    "professional",
    "financial",
    "relational",
    "creative",
    "experiential"
  ]);
});

test("snapshot validation preserves assessed and explicit unknown states", () => {
  const result = model.validateVectorSnapshotPayload({
    evaluatedAt: "2026-09-07T10:30:00Z",
    evaluator: "kleos-bot",
    methodologyVersion: "1.0.0",
    results: representativeResults()
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.results.length, 8);
  assert.deepEqual(result.value.results[1], {
    vectorId: "psychological",
    status: "unknown",
    score: null,
    confidence: "unknown",
    commentary: "Insufficient canonical evidence for a defensible assessment."
  });
});

test("snapshot validation rejects missing or duplicate canonical vectors", () => {
  const missing = representativeResults().slice(0, 7);
  assert.equal(model.validateVectorSnapshotPayload({
    evaluatedAt: "2026-09-07T10:30:00Z",
    evaluator: "kleos-bot",
    methodologyVersion: "1.0.0",
    results: missing
  }).ok, false);

  const duplicate = representativeResults();
  duplicate[7] = { ...duplicate[7], vectorId: "physical" };
  assert.equal(model.validateVectorSnapshotPayload({
    evaluatedAt: "2026-09-07T10:30:00Z",
    evaluator: "kleos-bot",
    methodologyVersion: "1.0.0",
    results: duplicate
  }).ok, false);
});

test("unknown vectors cannot silently become zero and assessed vectors require confidence", () => {
  const unknownWithZero = representativeResults();
  unknownWithZero[1] = { ...unknownWithZero[1], score: 0 };
  assert.equal(model.validateVectorSnapshotPayload({
    evaluatedAt: "2026-09-07T10:30:00Z",
    evaluator: "kleos-bot",
    methodologyVersion: "1.0.0",
    results: unknownWithZero
  }).ok, false);

  const assessedWithoutConfidence = representativeResults();
  assessedWithoutConfidence[0] = { ...assessedWithoutConfidence[0], confidence: "unknown" };
  assert.equal(model.validateVectorSnapshotPayload({
    evaluatedAt: "2026-09-07T10:30:00Z",
    evaluator: "kleos-bot",
    methodologyVersion: "1.0.0",
    results: assessedWithoutConfidence
  }).ok, false);
});

test("persisted Supabase rows map into canonical vector order", () => {
  const rows = representativeResults()
    .map((result) => ({
      vector_id: result.vectorId,
      status: result.status,
      score: result.score,
      confidence: result.confidence,
      commentary: result.commentary
    }))
    .reverse();

  const snapshot = model.normalizeVectorSnapshotRow({
    id: "snapshot-1",
    user_id: "user-1",
    evaluated_at: "2026-09-07T10:30:00Z",
    evaluator: "kleos-bot",
    methodology_version: "1.0.0",
    overall_score: null,
    created_at: "2026-09-07T10:31:00Z",
    results: rows
  });

  assert.deepEqual(snapshot.results.map((result) => result.vectorId), model.VECTOR_IDS);
  assert.equal(snapshot.results[1].status, "unknown");
});

test("history ordering uses evaluation time then creation time without overwriting older snapshots", () => {
  const snapshots = [
    { id: "older", evaluatedAt: "2026-09-01T10:00:00Z", createdAt: "2026-09-01T10:01:00Z" },
    { id: "newer-created-later", evaluatedAt: "2026-09-07T10:00:00Z", createdAt: "2026-09-07T10:02:00Z" },
    { id: "newer-created-earlier", evaluatedAt: "2026-09-07T10:00:00Z", createdAt: "2026-09-07T10:01:00Z" }
  ];

  snapshots.sort(model.compareVectorSnapshotsNewestFirst);
  assert.deepEqual(snapshots.map((snapshot) => snapshot.id), [
    "newer-created-later",
    "newer-created-earlier",
    "older"
  ]);
});

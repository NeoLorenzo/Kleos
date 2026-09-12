const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const path = require("node:path");
const { before, test } = require("node:test");

let methodology;
let migration;
let writerGuardMigration;
let fixedAnchorMigration;
let assessabilityMigration;
let snapshotRepository;
let prompt;
let docs;

before(async () => {
  methodology = await import("../lib/kleos/vectorMethodology.mjs");
  [migration, writerGuardMigration, fixedAnchorMigration, assessabilityMigration, snapshotRepository, prompt, docs] = await Promise.all([
    readFile(path.join(process.cwd(), "supabase/migrations/20260912_0028_kleos_vector_methodology_2_0.sql"), "utf8"),
    readFile(path.join(process.cwd(), "supabase/migrations/20260912_0029_enforce_current_methodology_server_writer.sql"), "utf8"),
    readFile(path.join(process.cwd(), "supabase/migrations/20260912_0030_restrict_methodology_2_to_fixed_anchor_scores.sql"), "utf8"),
    readFile(path.join(process.cwd(), "supabase/migrations/20260912_0032_kleos_methodology_2_0_1_affirmative_evidence.sql"), "utf8"),
    readFile(path.join(process.cwd(), "lib/kleos/vectorSnapshotRepository.js"), "utf8"),
    readFile(path.join(process.cwd(), "documentation/kleos-bot-shortcuts-prompt.md"), "utf8"),
    readFile(path.join(process.cwd(), "documentation/kleos-vector-methodology-2.0.md"), "utf8")
  ]);
});

test("Methodology 2.0.1 has exactly eight vectors and every vector sums to 100%", () => {
  assert.equal(methodology.KLEOS_VECTOR_METHODOLOGY_VERSION, "2.0.1");
  assert.deepEqual(methodology.KLEOS_SUBDOMAIN_ANCHOR_SCORES, [0, 25, 50, 70, 85, 95, 100]);
  const vectors = methodology.KLEOS_VECTOR_METHODOLOGY.vectors;
  assert.equal(vectors.length, 8);
  assert.deepEqual(vectors.map((vector) => vector.id), [
    "physical", "psychological", "intellectual", "professional",
    "financial", "relational", "creative", "experiential"
  ]);
  for (const vector of vectors) {
    assert.equal(vector.subdomains.length, 5, `${vector.id} should have five fixed subdomains`);
    assert.equal(vector.subdomains.reduce((sum, item) => sum + item.weight, 0), 100, `${vector.id} weights must sum to 100`);
  }
});

test("100% coverage makes deterministic final score equal the weighted raw anchor score", () => {
  const result = methodology.aggregateVectorSubdomains([
    { weight: 20, status: "assessed", score: 85, confidence: "high" },
    { weight: 20, status: "assessed", score: 85, confidence: "high" },
    { weight: 20, status: "assessed", score: 85, confidence: "high" },
    { weight: 20, status: "assessed", score: 85, confidence: "high" },
    { weight: 20, status: "assessed", score: 85, confidence: "high" }
  ]);
  assert.deepEqual(result, {
    status: "assessed",
    score: 85,
    rawScore: 85,
    confidence: "high",
    coveragePct: 100,
    scoreCap: 100,
    confidenceMean: 3
  });
});

test("weighted fixed anchors still produce granular deterministic vector scores", () => {
  const result = methodology.aggregateVectorSubdomains([
    { weight: 25, status: "assessed", score: 85, confidence: "high" },
    { weight: 20, status: "assessed", score: 70, confidence: "high" },
    { weight: 20, status: "assessed", score: 85, confidence: "medium" },
    { weight: 20, status: "assessed", score: 95, confidence: "high" },
    { weight: 15, status: "assessed", score: 70, confidence: "medium" }
  ]);
  assert.equal(result.coveragePct, 100);
  assert.equal(result.rawScore, 81.8);
  assert.equal(result.score, 81.8);
});

test("non-anchor model scores are rejected rather than creating false precision", () => {
  assert.throws(() => methodology.aggregateVectorSubdomains([
    { weight: 100, status: "assessed", score: 82, confidence: "high" }
  ]), /INVALID_KLEOS_SUBDOMAIN_RESULT/);
  assert.match(fixedAnchorMigration, /score is null or score in \(0,25,50,70,85,95,100\)/i);
  assert.match(fixedAnchorMigration, /Do not interpolate/i);
});

test("incomplete evidence is not scored negatively but caps the whole-vector result", () => {
  const result = methodology.aggregateVectorSubdomains([
    { weight: 20, status: "unknown", score: null, confidence: "unknown" },
    { weight: 20, status: "assessed", score: 95, confidence: "high" },
    { weight: 20, status: "assessed", score: 95, confidence: "high" },
    { weight: 20, status: "assessed", score: 95, confidence: "high" },
    { weight: 20, status: "assessed", score: 95, confidence: "high" }
  ]);
  assert.equal(result.coveragePct, 80);
  assert.equal(result.rawScore, 95);
  assert.equal(result.scoreCap, 90);
  assert.equal(result.score, 90);
  assert.equal(result.confidence, "medium");
});

test("less than half of vector weight assessed produces unknown rather than an invented low score", () => {
  const result = methodology.aggregateVectorSubdomains([
    { weight: 25, status: "assessed", score: 95, confidence: "high" },
    { weight: 20, status: "assessed", score: 95, confidence: "high" },
    { weight: 20, status: "unknown", score: null, confidence: "unknown" },
    { weight: 20, status: "unknown", score: null, confidence: "unknown" },
    { weight: 15, status: "unknown", score: null, confidence: "unknown" }
  ]);
  assert.equal(result.coveragePct, 45);
  assert.equal(result.status, "unknown");
  assert.equal(result.score, null);
  assert.equal(result.confidence, "unknown");
});

test("coverage score caps make 95+ impossible without near-complete domain coverage", () => {
  assert.equal(methodology.scoreCapForCoverage(60), 70);
  assert.equal(methodology.scoreCapForCoverage(70), 82);
  assert.equal(methodology.scoreCapForCoverage(85), 90);
  assert.equal(methodology.scoreCapForCoverage(95), 95);
  assert.equal(methodology.scoreCapForCoverage(100), 100);
});

test("database migration persists explicit methodology, subdomains, anchors and deterministic aggregation", () => {
  assert.match(migration, /Kleos Vector Methodology 2\.0/i);
  assert.match(migration, /age_or_career_stage_normalization',false/i);
  assert.match(migration, /kleos_vector_snapshot_subdomain_results/i);
  assert.match(migration, /weighted_assessed_subdomains_with_coverage_cap/i);
  assert.match(migration, /overall_score,execution_key\)\s*values\(v_owner_id,now\(\),'kleos-bot',v_methodology_version,null/i);
  assert.match(fixedAnchorMigration, /score is null or score in \(0,25,50,70,85,95,100\)/i);
});

test("Methodology 2.0.1 requires affirmative evidence before any anchor is selected", () => {
  assert.match(assessabilityMigration, /'2\.0\.1'/i);
  assert.match(assessabilityMigration, /affirmative_anchor_evidence/i);
  assert.match(assessabilityMigration, /Failure to establish a higher anchor is never evidence for a lower anchor/i);
  assert.match(assessabilityMigration, /missing_vs_mediocre/i);
  assert.match(assessabilityMigration, /Do not use 50, 25, or any other lower anchor merely because evidence is sparse/i);
  assert.match(assessabilityMigration, /partial_subdomain_observation/i);
  assert.match(assessabilityMigration, /absence_not_zero_value/i);
  assert.match(assessabilityMigration, /assessment_gate/i);
  assert.match(assessabilityMigration, /This is not a default score for uncertainty, sparse evidence, or inability to justify a higher anchor/i);
});

test("current methodology cannot be written through the older authenticated holistic writer", () => {
  assert.match(writerGuardMigration, /new\.methodology_version = v_current_version/i);
  assert.match(writerGuardMigration, /session_user <> 'postgres'/i);
  assert.match(writerGuardMigration, /KLEOS_CURRENT_METHODOLOGY_SERVER_WRITER_REQUIRED/i);
  assert.match(writerGuardMigration, /before insert on public\.kleos_vector_snapshots/i);
  assert.match(snapshotRepository, /snapshot\.methodologyVersion\.startsWith\("2\."\)/i);
  assert.match(snapshotRepository, /KLEOS_CURRENT_METHODOLOGY_SERVER_WRITER_REQUIRED/i);
});

test("runtime prompt cannot silently turn missing evidence into a mediocre anchor", () => {
  assert.match(prompt, /Before selecting any anchor, decide whether the subdomain is \*\*assessable at all\*\*/i);
  assert.match(prompt, /Failure to establish a higher anchor is never evidence for a lower anchor/i);
  assert.match(prompt, /do not use `50`, `25`, or any other lower anchor merely because evidence is sparse/i);
  assert.match(prompt, /`50` requires affirmative evidence/i);
  assert.match(prompt, /absence of a recorded, classified, or connected value is not evidence/i);
  assert.match(prompt, /do not average unobserved components in as neutral or weak/i);
  assert.match(prompt, /Use confidence for uncertainty about an otherwise supportable anchor/i);
  assert.match(prompt, /Do not choose final vector scores yourself/i);
  assert.match(prompt, /do \*\*not\*\* interpolate/i);
  assert.match(prompt, /do not age-normalize or career-stage-normalize/i);
  assert.match(docs, /`2\.0\.1` is the current Kleos vector methodology/i);
  assert.match(docs, /assessability gate before anchor selection/i);
  assert.match(docs, /`2\.0\.1` is the new baseline/i);
});

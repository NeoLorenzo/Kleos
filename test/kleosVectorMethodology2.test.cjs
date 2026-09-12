const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const path = require("node:path");
const { before, test } = require("node:test");

let methodology;
let migration;
let prompt;
let docs;

before(async () => {
  methodology = await import("../lib/kleos/vectorMethodology.mjs");
  [migration, prompt, docs] = await Promise.all([
    readFile(path.join(process.cwd(), "supabase/migrations/20260912_0028_kleos_vector_methodology_2_0.sql"), "utf8"),
    readFile(path.join(process.cwd(), "documentation/kleos-bot-shortcuts-prompt.md"), "utf8"),
    readFile(path.join(process.cwd(), "documentation/kleos-vector-methodology-2.0.md"), "utf8")
  ]);
});

test("Methodology 2.0 has exactly eight vectors and every vector sums to 100%", () => {
  assert.equal(methodology.KLEOS_VECTOR_METHODOLOGY_VERSION, "2.0.0");
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

test("100% coverage makes deterministic final score equal the weighted raw score", () => {
  const result = methodology.aggregateVectorSubdomains([
    { weight: 20, status: "assessed", score: 80, confidence: "high" },
    { weight: 20, status: "assessed", score: 80, confidence: "high" },
    { weight: 20, status: "assessed", score: 80, confidence: "high" },
    { weight: 20, status: "assessed", score: 80, confidence: "high" },
    { weight: 20, status: "assessed", score: 80, confidence: "high" }
  ]);
  assert.deepEqual(result, {
    status: "assessed",
    score: 80,
    rawScore: 80,
    confidence: "high",
    coveragePct: 100,
    scoreCap: 100,
    confidenceMean: 3
  });
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
  assert.match(migration, /'0','No functional evidence/i);
  assert.match(migration, /'25','Very weak/i);
  assert.match(migration, /'50','Basic\/adequate/i);
  assert.match(migration, /'70','Strong/i);
  assert.match(migration, /'85','Very strong/i);
  assert.match(migration, /'95','Exceptional/i);
  assert.match(migration, /'100','Practical ceiling/i);
  assert.match(migration, /kleos_vector_snapshot_subdomain_results/i);
  assert.match(migration, /weighted_assessed_subdomains_with_coverage_cap/i);
  assert.match(migration, /overall_score,execution_key\)\s*values\(v_owner_id,now\(\),'kleos-bot',v_methodology_version,null/i);
});

test("runtime prompt cannot silently revert to holistic vector scoring", () => {
  assert.match(prompt, /assess every subdomain/i);
  assert.match(prompt, /Do not choose final vector scores yourself/i);
  assert.match(prompt, /explicit anchors/i);
  assert.match(prompt, /do not age-normalize or career-stage-normalize/i);
  assert.match(prompt, /calculate vector scores deterministically/i);
  assert.match(prompt, /p_vectors/i);
  assert.doesNotMatch(prompt, /90–100: exceptionally strong/i);
  assert.match(docs, /Snapshots from 1\.x remain immutable historical records/i);
});

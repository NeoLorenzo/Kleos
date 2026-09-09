const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { test, before } = require("node:test");
const path = require("node:path");

let source;

before(async () => {
  source = await readFile(
    path.join(process.cwd(), "supabase/functions/kleos-bot-evidence/index.ts"),
    "utf8"
  );
});

test("edge evidence endpoint uses a one-way committed token hash, never a plaintext bot token", () => {
  assert.match(source, /EXPECTED_TOKEN_HASH\s*=\s*"[0-9a-f]{64}"/i);
  assert.match(source, /SHA-256/i);
  assert.match(source, /constantTimeEqual/i);
  assert.doesNotMatch(source, /kleos_[A-Za-z0-9_-]{30,}/);
});

test("edge evidence endpoint authenticates before retrieval and does not allow caching", () => {
  assert.match(source, /x-kleos-bot-token/i);
  assert.match(source, /req\.method\s*!==\s*"POST"/i);
  assert.match(source, /UNAUTHORIZED/i);
  assert.match(source, /Cache-Control[\s\S]*no-store/i);
  assert.match(source, /Pragma[\s\S]*no-cache/i);
});

test("edge evidence endpoint keeps database credentials server-side and reuses the canonical admin reader", () => {
  assert.match(source, /Deno\.env\.get\("SUPABASE_DB_URL"\)/i);
  assert.match(source, /get_kleos_bot_evidence_admin\(\)/i);
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY\s*=\s*["']/i);
  assert.doesNotMatch(source, /SUPABASE_SECRET_KEYS\s*=\s*["']/i);
});

test("edge evidence endpoint returns the registry-driven evidence payload without hard-coded methodology filtering", () => {
  assert.match(source, /EVIDENCE_SCHEMA_VERSION\s*=\s*"2\.0\.0"/i);
  assert.match(source, /evidence_groups:\s*evidenceGroups/i);
  assert.doesNotMatch(source, /methodologyEvidence/i);
  assert.doesNotMatch(source, /goat_big_five_assessments/i);
});

test("edge evidence endpoint does not duplicate raw evidence-table selection or expose owner identity", () => {
  assert.doesNotMatch(source, /from\s+public\.goat_/i);
  assert.doesNotMatch(source, /kleos_vector_snapshots/i);
  assert.doesNotMatch(source, /goat_score_entries/i);
  assert.doesNotMatch(source, /theneolorenzo@gmail\.com/i);
  assert.doesNotMatch(source, /user_id/i);
});

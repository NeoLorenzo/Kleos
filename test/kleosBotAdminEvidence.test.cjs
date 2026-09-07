const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { test, before } = require("node:test");
const path = require("node:path");

let migration;

before(async () => {
  migration = await readFile(
    path.join(process.cwd(), "supabase/migrations/20260907_0005_kleos_bot_admin_evidence.sql"),
    "utf8"
  );
});

test("admin evidence reader is privileged and avoids JWT impersonation", () => {
  assert.match(migration, /create or replace function public\.get_kleos_bot_evidence_admin\(\)/i);
  assert.match(migration, /if session_user <> 'postgres'/i);
  assert.doesNotMatch(migration, /auth\.uid\s*\(/i);
  assert.doesNotMatch(migration, /auth\.jwt\s*\(/i);
  assert.doesNotMatch(migration, /request\.jwt\.claims/i);
});

test("admin evidence reader resolves the fixed owner internally", () => {
  assert.match(migration, /from auth\.users/i);
  assert.match(migration, /lower\(email\)/i);
  assert.doesNotMatch(migration, /p_user_id/i);
});

test("admin evidence payload contains exactly the canonical methodology 1.0.0 evidence groups", () => {
  const groups = [
    "goat_strength_lifts",
    "goat_strength_profile",
    "goat_cognitive_tests",
    "goat_academic_stage_results",
    "goat_academic_module_results",
    "goat_academic_notes",
    "goat_health_characteristics",
    "goat_cv_characteristics",
    "goat_immutable_characteristics",
    "goat_misc_characteristics"
  ];

  for (const group of groups) {
    assert.match(migration, new RegExp(`'${group}'`, "i"));
    assert.match(migration, new RegExp(`from public\\.${group}`, "i"));
  }

  assert.doesNotMatch(migration, /goat_score_entries/i);
  assert.doesNotMatch(migration, /kleos_vector_snapshots/i);
  assert.doesNotMatch(migration, /kleos_vector_snapshot_results/i);
});

test("admin evidence reader strips owner UUID from every returned row", () => {
  assert.match(migration, /to_jsonb\(t\) - 'user_id'/i);
});

test("admin evidence reader is read-only", () => {
  assert.match(migration, /\nstable\n/i);
  assert.doesNotMatch(migration, /\binsert\s+into\b/i);
  assert.doesNotMatch(migration, /\bupdate\s+public\./i);
  assert.doesNotMatch(migration, /\bdelete\s+from\b/i);
});

test("admin evidence reader is not executable by application roles", () => {
  assert.match(migration, /revoke all on function public\.get_kleos_bot_evidence_admin\(\) from public/i);
  assert.match(migration, /revoke all on function public\.get_kleos_bot_evidence_admin\(\) from anon/i);
  assert.match(migration, /revoke all on function public\.get_kleos_bot_evidence_admin\(\) from authenticated/i);
  assert.match(migration, /revoke all on function public\.get_kleos_bot_evidence_admin\(\) from service_role/i);
  assert.doesNotMatch(migration, /grant execute on function public\.get_kleos_bot_evidence_admin/i);
});

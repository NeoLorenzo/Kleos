const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { test, before } = require("node:test");
const path = require("node:path");

let migration;

before(async () => {
  migration = await readFile(
    path.join(process.cwd(), "supabase/migrations/20260907_0004_kleos_bot_admin_persistence.sql"),
    "utf8"
  );
});

test("admin writer is explicitly privileged and does not rely on JWT impersonation", () => {
  assert.match(migration, /create or replace function public\.create_kleos_bot_snapshot_admin/i);
  assert.match(migration, /if session_user <> 'postgres'/i);
  assert.doesNotMatch(migration, /auth\.uid\s*\(/i);
  assert.doesNotMatch(migration, /auth\.jwt\s*\(/i);
  assert.doesNotMatch(migration, /request\.jwt\.claims/i);
});

test("admin writer resolves the fixed owner internally rather than accepting a user id", () => {
  assert.match(migration, /from auth\.users/i);
  assert.match(migration, /lower\(email\)/i);
  assert.doesNotMatch(migration, /p_user_id/i);
});

test("admin writer preserves exact-execution idempotency without cadence gating", () => {
  assert.match(migration, /p_execution_key text/i);
  assert.match(migration, /pg_advisory_xact_lock/i);
  assert.match(migration, /and execution_key = v_execution_key/i);
  assert.match(migration, /'created', false/i);
  assert.match(migration, /'created', true/i);
  assert.doesNotMatch(migration, /date_trunc\s*\(/i);
  assert.doesNotMatch(migration, /extract\s*\(\s*week/i);
});

test("admin writer atomically validates and writes exactly eight canonical results", () => {
  assert.match(migration, /v_result_count <> 8 or v_distinct_vector_count <> 8/i);
  for (const vectorId of [
    "physical",
    "psychological",
    "intellectual",
    "professional",
    "financial",
    "relational",
    "creative",
    "experiential"
  ]) {
    assert.match(migration, new RegExp(`'${vectorId}'`, "i"));
  }
  assert.match(migration, /insert into public\.kleos_vector_snapshots/i);
  assert.match(migration, /insert into public\.kleos_vector_snapshot_results/i);
});

test("admin writer is not executable by application roles", () => {
  assert.match(migration, /revoke all on function public\.create_kleos_bot_snapshot_admin[\s\S]*from public/i);
  assert.match(migration, /revoke all on function public\.create_kleos_bot_snapshot_admin[\s\S]*from anon/i);
  assert.match(migration, /revoke all on function public\.create_kleos_bot_snapshot_admin[\s\S]*from authenticated/i);
  assert.match(migration, /revoke all on function public\.create_kleos_bot_snapshot_admin[\s\S]*from service_role/i);
  assert.doesNotMatch(migration, /grant execute on function public\.create_kleos_bot_snapshot_admin/i);
});

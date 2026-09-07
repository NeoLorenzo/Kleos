const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { test, before } = require("node:test");
const path = require("node:path");

let migration;

before(async () => {
  migration = await readFile(
    path.join(process.cwd(), "supabase/migrations/20260907_0003_kleos_bot_schedule_agnostic.sql"),
    "utf8"
  );
});

test("weekly run keys are replaced with per-execution idempotency", () => {
  assert.match(migration, /rename column run_key to execution_key/i);
  assert.match(migration, /rename to kleos_vector_snapshots_execution_key_idx/i);
  assert.match(migration, /p_execution_key text/i);
  assert.doesNotMatch(migration, /YYYY-W/i);
});

test("bot writer deduplicates only the exact same execution", () => {
  assert.match(migration, /create or replace function public\.create_kleos_bot_snapshot/i);
  assert.match(migration, /pg_advisory_xact_lock/i);
  assert.match(migration, /and evaluator = 'kleos-bot'/i);
  assert.match(migration, /and execution_key = v_execution_key/i);
  assert.match(migration, /'created', false/i);
});

test("distinct executions reuse the atomic snapshot writer without time-window gating", () => {
  assert.match(migration, /public\.create_kleos_vector_snapshot\(/i);
  assert.match(migration, /set execution_key = v_execution_key/i);
  assert.match(migration, /'created', true/i);
  assert.doesNotMatch(migration, /date_trunc\s*\(/i);
  assert.doesNotMatch(migration, /extract\s*\(\s*week/i);
});

test("legacy weekly writer is retired and new RPC remains owner-authenticated", () => {
  assert.match(migration, /drop function if exists public\.create_kleos_bot_weekly_snapshot/i);
  assert.match(migration, /revoke all on function public\.create_kleos_bot_snapshot[\s\S]*from anon/i);
  assert.match(migration, /grant execute on function public\.create_kleos_bot_snapshot[\s\S]*to authenticated/i);
});

const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { test, before } = require("node:test");
const path = require("node:path");

let migration;

before(async () => {
  migration = await readFile(
    path.join(process.cwd(), "supabase/migrations/20260907_0002_kleos_bot_weekly_idempotency.sql"),
    "utf8"
  );
});

test("weekly run keys are unique per owner and evaluator", () => {
  assert.match(migration, /add column if not exists run_key text null/i);
  assert.match(migration, /create unique index if not exists kleos_vector_snapshots_run_key_idx/i);
  assert.match(migration, /\(user_id, evaluator, run_key\)/i);
});

test("bot writer serializes retries before checking for an existing run", () => {
  assert.match(migration, /create or replace function public\.create_kleos_bot_weekly_snapshot/i);
  assert.match(migration, /pg_advisory_xact_lock/i);
  assert.match(migration, /and evaluator = 'kleos-bot'/i);
  assert.match(migration, /and run_key = btrim\(p_run_key\)/i);
  assert.match(migration, /'created', false/i);
});

test("new weekly snapshots reuse the #4 atomic snapshot writer", () => {
  assert.match(migration, /public\.create_kleos_vector_snapshot\(/i);
  assert.match(migration, /set run_key = btrim\(p_run_key\)/i);
  assert.match(migration, /'created', true/i);
});

test("bot RPC remains unavailable to anonymous clients", () => {
  assert.match(migration, /revoke all on function public\.create_kleos_bot_weekly_snapshot[\s\S]*from anon/i);
  assert.match(migration, /grant execute on function public\.create_kleos_bot_weekly_snapshot[\s\S]*to authenticated/i);
});

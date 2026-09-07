const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { test, before } = require("node:test");
const path = require("node:path");

let migration;

before(async () => {
  migration = await readFile(
    path.join(process.cwd(), "supabase/migrations/20260907_0001_vector_snapshots.sql"),
    "utf8"
  );
});

test("migration creates normalized immutable snapshot and result tables", () => {
  assert.match(migration, /create table if not exists public\.kleos_vector_snapshots/i);
  assert.match(migration, /create table if not exists public\.kleos_vector_snapshot_results/i);
  assert.match(migration, /primary key \(snapshot_id, vector_id\)/i);
  assert.match(migration, /revoke insert, update, delete on table public\.kleos_vector_snapshots from authenticated/i);
  assert.match(migration, /revoke insert, update, delete on table public\.kleos_vector_snapshot_results from authenticated/i);
});

test("owner-only RLS protects both snapshot tables", () => {
  assert.match(migration, /alter table public\.kleos_vector_snapshots enable row level security/i);
  assert.match(migration, /alter table public\.kleos_vector_snapshot_results enable row level security/i);
  assert.match(migration, /auth\.uid\(\) = user_id/i);
  assert.match(migration, /theneolorenzo@gmail\.com/i);
  assert.match(migration, /exists \(\s*select 1\s*from public\.kleos_vector_snapshots snapshot/is);
});

test("trusted write contract creates all vector results inside one database function", () => {
  assert.match(migration, /create or replace function public\.create_kleos_vector_snapshot/i);
  assert.match(migration, /security definer/i);
  assert.match(migration, /v_result_count <> 8 or v_distinct_vector_count <> 8/i);
  assert.match(migration, /insert into public\.kleos_vector_snapshots/i);
  assert.match(migration, /insert into public\.kleos_vector_snapshot_results/i);
  assert.match(migration, /grant execute on function public\.create_kleos_vector_snapshot[\s\S]*to authenticated/i);
});

test("migration keeps legacy raw evidence and GOAT score tables untouched", () => {
  assert.doesNotMatch(migration, /drop table/i);
  assert.doesNotMatch(migration, /alter table public\.goat_/i);
  assert.doesNotMatch(migration, /delete from public\.goat_/i);
  assert.doesNotMatch(migration, /update public\.goat_/i);
});

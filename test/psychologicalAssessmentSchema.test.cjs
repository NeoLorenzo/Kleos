const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { test, before } = require("node:test");
const path = require("node:path");

let migration;

before(async () => {
  migration = await readFile(
    path.join(process.cwd(), "supabase/migrations/20260909_0013_psychological_assessments.sql"),
    "utf8"
  );
});

test("psychological assessments are dated, versioned canonical records", () => {
  assert.match(migration, /create table if not exists public\.goat_psychological_assessments/i);
  assert.match(migration, /assessed_at timestamptz not null/i);
  assert.match(migration, /battery_version text not null/i);
  assert.match(migration, /instrument_versions jsonb not null/i);
  assert.match(migration, /responses jsonb not null/i);
  assert.match(migration, /kleos_facets jsonb not null/i);
});

test("validated instruments remain independently scored", () => {
  for (const column of [
    "who5_raw_score",
    "who5_percentage",
    "swls_score",
    "pss10_score",
    "gad7_score",
    "phq9_score",
    "phq9_item_9"
  ]) {
    assert.match(migration, new RegExp(`${column}\\s+smallint\\s+not\\s+null`, "i"));
  }
  assert.doesNotMatch(migration, /psychological_score/i);
  assert.doesNotMatch(migration, /overall_score/i);
  assert.match(migration, /who5_percentage = who5_raw_score \* 4/i);
});

test("owner-only browser permissions are preserved", () => {
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /grant select, insert, update, delete[\s\S]*to authenticated/i);
  assert.match(migration, /revoke all[\s\S]*from anon/i);
  assert.match(migration, /auth\.uid\(\) = user_id/i);
  assert.match(migration, /auth\.jwt\(\)->>'email'/i);
});

test("new assessment source joins the dynamic Kleos Bot evidence registry", () => {
  assert.match(migration, /insert into public\.kleos_evidence_sources/i);
  assert.match(migration, /'goat_psychological_assessments'/i);
  assert.match(migration, /'public\.goat_psychological_assessments'::regclass/i);
  assert.doesNotMatch(migration, /create or replace function public\.get_kleos_bot_evidence_admin/i);
});

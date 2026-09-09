const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { test, before } = require("node:test");
const path = require("node:path");

let createMigration;
let removalMigration;

before(async () => {
  [createMigration, removalMigration] = await Promise.all([
    readFile(
      path.join(process.cwd(), "supabase/migrations/20260909_0013_psychological_assessments.sql"),
      "utf8"
    ),
    readFile(
      path.join(process.cwd(), "supabase/migrations/20260909_0014_remove_pss10_expand_kleos_facets.sql"),
      "utf8"
    )
  ]);
});

test("psychological assessments are dated, versioned canonical records", () => {
  assert.match(createMigration, /create table if not exists public\.goat_psychological_assessments/i);
  assert.match(createMigration, /assessed_at timestamptz not null/i);
  assert.match(createMigration, /battery_version text not null/i);
  assert.match(createMigration, /instrument_versions jsonb not null/i);
  assert.match(createMigration, /responses jsonb not null/i);
  assert.match(createMigration, /kleos_facets jsonb not null/i);
});

test("effective schema keeps active validated instruments independently scored and removes PSS-10", () => {
  for (const column of [
    "who5_raw_score",
    "who5_percentage",
    "swls_score",
    "gad7_score",
    "phq9_score",
    "phq9_item_9"
  ]) {
    assert.match(createMigration, new RegExp(`${column}\\s+smallint\\s+not\\s+null`, "i"));
  }
  assert.match(removalMigration, /drop column if exists pss10_score/i);
  assert.match(removalMigration, /responses\s*=\s*responses\s*-\s*'pss10'/i);
  assert.match(removalMigration, /instrument_versions\s*=\s*instrument_versions\s*-\s*'pss10'/i);
  assert.doesNotMatch(removalMigration, /psychological_score/i);
  assert.doesNotMatch(removalMigration, /overall_score/i);
  assert.match(createMigration, /who5_percentage = who5_raw_score \* 4/i);
});

test("owner-only browser permissions are preserved", () => {
  assert.match(createMigration, /enable row level security/i);
  assert.match(createMigration, /grant select, insert, update, delete[\s\S]*to authenticated/i);
  assert.match(createMigration, /revoke all[\s\S]*from anon/i);
  assert.match(createMigration, /auth\.uid\(\) = user_id/i);
  assert.match(createMigration, /auth\.jwt\(\)->>'email'/i);
});

test("psychological assessment source remains in the dynamic Kleos Bot evidence registry", () => {
  assert.match(createMigration, /insert into public\.kleos_evidence_sources/i);
  assert.match(createMigration, /'goat_psychological_assessments'/i);
  assert.match(createMigration, /'public\.goat_psychological_assessments'::regclass/i);
  assert.doesNotMatch(removalMigration, /delete from public\.kleos_evidence_sources/i);
  assert.doesNotMatch(removalMigration, /create or replace function public\.get_kleos_bot_evidence_admin/i);
});

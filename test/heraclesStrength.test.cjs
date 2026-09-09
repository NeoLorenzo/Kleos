const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { test, before } = require("node:test");
const path = require("node:path");

let migration;
let syncFunction;
let dataSource;
let pageSource;
let correctionsSource;
let promptSource;

before(async () => {
  [migration, syncFunction, dataSource, pageSource, correctionsSource, promptSource] = await Promise.all([
    readFile(path.join(process.cwd(), "supabase/migrations/20260909_0010_heracles_strength_metrics.sql"), "utf8"),
    readFile(path.join(process.cwd(), "supabase/functions/sync-heracles-strength/index.ts"), "utf8"),
    readFile(path.join(process.cwd(), "lib/kleos/data.js"), "utf8"),
    readFile(path.join(process.cwd(), "app/page.js"), "utf8"),
    readFile(path.join(process.cwd(), "components/MeasurementCorrections.jsx"), "utf8"),
    readFile(path.join(process.cwd(), "lib/kleos/prompt.js"), "utf8")
  ]);
});

test("Heracles metrics persist current and stale state without deleting last-known values", () => {
  assert.match(migration, /create table public\.heracles_strength_metrics/i);
  assert.match(migration, /is_current boolean not null default true/i);
  assert.match(migration, /synced_at timestamptz not null/i);
  assert.match(migration, /last_checked_at timestamptz not null/i);
  assert.match(migration, /update public\.heracles_strength_metrics[\s\S]*set is_current = false/i);
  assert.match(migration, /on conflict \(user_id, source_exercise_id\) do update/i);
  assert.doesNotMatch(migration, /delete from public\.heracles_strength_metrics/i);
});

test("snapshot replacement is backend-only and validates the Heracles contract", () => {
  assert.match(migration, /qualifying_sessions < 3/i);
  assert.match(migration, /estimation_basis is distinct from 'observed_e1rm_high'/i);
  assert.match(migration, /revoke all on function public\.replace_heracles_strength_snapshot[\s\S]*from authenticated/i);
  assert.match(migration, /grant execute on function public\.replace_heracles_strength_snapshot[\s\S]*to service_role/i);
  assert.match(migration, /grant select on table public\.heracles_strength_metrics to authenticated/i);
});

test("Kleos Bot switches canonical strength evidence away from the manual table", () => {
  assert.match(migration, /where group_key = 'goat_strength_lifts'/i);
  assert.match(migration, /set enabled = false/i);
  assert.match(migration, /'heracles_strength_metrics', 'public\.heracles_strength_metrics'::regclass, true/i);
});

test("sync function preserves the existing snapshot when Heracles cannot supply a valid complete snapshot", () => {
  assert.match(syncFunction, /preserved_existing_snapshot: true/g);
  const fetchIndex = syncFunction.indexOf("fetch(HERACLES_STRENGTH_URL");
  const rpcIndex = syncFunction.indexOf('admin.rpc("replace_heracles_strength_snapshot"');
  assert.ok(fetchIndex >= 0 && rpcIndex > fetchIndex, "persistence happens only after the Heracles fetch");
  assert.match(syncFunction, /window_days === 30/);
  assert.match(syncFunction, /minimum_sessions === 3/);
  assert.match(syncFunction, /estimation_basis === "observed_e1rm_high"/);
});

test("active Kleos UI and data loading no longer read or write manual strength lifts", () => {
  assert.match(dataSource, /from\("heracles_strength_metrics"\)/);
  assert.doesNotMatch(dataSource, /from\("goat_strength_lifts"\)/);
  assert.match(pageSource, /sync-heracles-strength/);
  assert.match(pageSource, /Strength — Heracles/);
  assert.doesNotMatch(pageSource, /Save Lift/);
  assert.doesNotMatch(pageSource, /goat_strength_lifts/);
  assert.doesNotMatch(correctionsSource, /goat_strength_lifts/);
  assert.doesNotMatch(correctionsSource, /Strength History/);
});

test("Kleos prompt distinguishes current and stale estimated strength evidence", () => {
  assert.match(promptSource, /CURRENT exercise appears only when it was trained in at least 3 distinct completed sessions/i);
  assert.match(promptSource, /STALE value is the last qualifying value retained by Kleos/i);
  assert.match(promptSource, /estimated 1RM/i);
  assert.match(promptSource, /per dumbbell/i);
});

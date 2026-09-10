const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { test, before } = require("node:test");
const path = require("node:path");

let migration;
let equipmentMigration;
let bodyWeightMigration;
let syncFunction;
let verifierFunction;
let dataSource;
let workspaceSource;
let correctionsSource;
let promptSource;

before(async () => {
  [
    migration,
    equipmentMigration,
    bodyWeightMigration,
    syncFunction,
    verifierFunction,
    dataSource,
    workspaceSource,
    correctionsSource,
    promptSource
  ] = await Promise.all([
    readFile(path.join(process.cwd(), "supabase/migrations/20260909_0010_heracles_strength_metrics.sql"), "utf8"),
    readFile(path.join(process.cwd(), "supabase/migrations/20260909_0012_heracles_strength_equipment.sql"), "utf8"),
    readFile(path.join(process.cwd(), "supabase/migrations/20260910_0015_heracles_body_weight_relative_strength.sql"), "utf8"),
    readFile(path.join(process.cwd(), "supabase/functions/sync-heracles-strength/index.ts"), "utf8"),
    readFile(path.join(process.cwd(), "supabase/functions/verify-heracles-caller/index.ts"), "utf8"),
    readFile(path.join(process.cwd(), "lib/kleos/data.js"), "utf8"),
    readFile(path.join(process.cwd(), "components/KleosWorkspace.jsx"), "utf8"),
    readFile(path.join(process.cwd(), "components/MeasurementCorrections.jsx"), "utf8"),
    readFile(path.join(process.cwd(), "lib/kleos/prompt.js"), "utf8")
  ]);
});

test("Heracles metrics persist current and stale state without deleting last-known values", () => {
  assert.match(migration, /create table public\.heracles_strength_metrics/i);
  assert.match(migration, /is_current boolean not null default true/i);
  assert.match(migration, /synced_at timestamptz not null/i);
  assert.match(migration, /last_checked_at timestamptz not null/i);
  assert.match(bodyWeightMigration, /update public\.heracles_strength_metrics[\s\S]*set is_current = false/i);
  assert.match(bodyWeightMigration, /on conflict \(user_id, source_exercise_id\) do update/i);
  assert.doesNotMatch(bodyWeightMigration, /delete from public\.heracles_strength_metrics/i);
});

test("Heracles metrics persist equipment and bodyweight context attached to the winning e1RM", () => {
  assert.match(equipmentMigration, /add column if not exists equipment_name text/i);
  assert.match(bodyWeightMigration, /add column if not exists body_weight_kg_at_achieved numeric/i);
  assert.match(bodyWeightMigration, /add column if not exists body_weight_kind text/i);
  assert.match(bodyWeightMigration, /add column if not exists best_1rm_relative_bw numeric/i);
  assert.match(bodyWeightMigration, /incoming\.equipment_name/i);
  assert.match(bodyWeightMigration, /body_weight_kg_at_achieved = excluded\.body_weight_kg_at_achieved/i);
  assert.match(bodyWeightMigration, /best_1rm_relative_bw = excluded\.best_1rm_relative_bw/i);
  assert.match(dataSource, /best_1rm,body_weight_kg_at_achieved,body_weight_kind,best_1rm_relative_bw/i);
  assert.match(workspaceSource, /Relative to BW/);
  assert.match(workspaceSource, /metric\.equipment_name \|\| "Not recorded"/);
});

test("snapshot replacement atomically persists current body weight and validates relative strength", () => {
  assert.match(bodyWeightMigration, /security invoker/i);
  assert.match(bodyWeightMigration, /p_current_body_weight jsonb/i);
  assert.match(bodyWeightMigration, /insert into public\.goat_strength_profile/i);
  assert.match(bodyWeightMigration, /body_weight_measured_on/i);
  assert.match(bodyWeightMigration, /qualifying_sessions < 3/i);
  assert.match(bodyWeightMigration, /estimation_basis is distinct from 'observed_e1rm_high'/i);
  assert.match(bodyWeightMigration, /body_weight_kind not in \('measured', 'interpolated'\)/i);
  assert.match(bodyWeightMigration, /incoming\.best_1rm \/ incoming\.body_weight_kg_at_achieved/i);
  assert.match(bodyWeightMigration, /revoke all on function public\.replace_heracles_strength_snapshot[\s\S]*from authenticated/i);
  assert.match(bodyWeightMigration, /grant execute on function public\.replace_heracles_strength_snapshot[\s\S]*to service_role/i);
  assert.match(migration, /grant select on table public\.heracles_strength_metrics to authenticated/i);
  assert.doesNotMatch(bodyWeightMigration, /from auth\.users/i);
});

test("body weight is Heracles-owned while height remains user-editable", () => {
  assert.match(bodyWeightMigration, /revoke all on table public\.goat_strength_profile from authenticated/i);
  assert.match(bodyWeightMigration, /grant select on table public\.goat_strength_profile to authenticated/i);
  assert.match(bodyWeightMigration, /grant insert \(user_id, height_cm, updated_at\)/i);
  assert.match(bodyWeightMigration, /grant update \(height_cm, updated_at\)/i);
  assert.match(dataSource, /body_weight_kg,body_weight_measured_on,height_cm/);
  assert.match(workspaceSource, /Body Weight KG \(Heracles\)/);
  assert.match(workspaceSource, /readOnly/);
  assert.match(workspaceSource, /Save Height/);
  assert.doesNotMatch(workspaceSource, /body_weight_kg: bodyWeightKg/);
  assert.doesNotMatch(workspaceSource, /bodyWeightKg: event\.target\.value/);
});

test("Kleos Bot switches canonical strength evidence away from the manual table", () => {
  assert.match(migration, /where group_key = 'goat_strength_lifts'/i);
  assert.match(migration, /set enabled = false/i);
  assert.match(migration, /'heracles_strength_metrics', 'public\.heracles_strength_metrics'::regclass, true/i);
});

test("Kleos verifier authenticates the user through the local Auth project and restricts the authorized account", () => {
  assert.match(verifierFunction, /auth\.getUser\(\)/);
  assert.match(verifierFunction, /theneolorenzo@gmail\.com/);
  assert.match(verifierFunction, /authorized: true/);
  assert.doesNotMatch(verifierFunction, /SUPABASE_SERVICE_ROLE_KEY/);
});

test("sync function preserves the existing snapshot when Heracles cannot supply a valid complete snapshot", () => {
  assert.match(syncFunction, /preserved_existing_snapshot: true/g);
  const fetchIndex = syncFunction.indexOf("fetch(HERACLES_STRENGTH_URL");
  const rpcIndex = syncFunction.indexOf('admin.rpc("replace_heracles_strength_snapshot"');
  assert.ok(fetchIndex >= 0 && rpcIndex > fetchIndex, "persistence happens only after the Heracles fetch");
  assert.match(syncFunction, /p_user_id: caller\.id/);
  assert.match(syncFunction, /p_current_body_weight: sourcePayload\.current_body_weight/);
  assert.match(syncFunction, /contract_version !== "1\.2\.0"/);
  assert.match(syncFunction, /window_days !== 30/);
  assert.match(syncFunction, /minimum_sessions !== 3/);
  assert.match(syncFunction, /estimation_basis !== "observed_e1rm_high"/);
  assert.match(syncFunction, /current_body_weight/);
  assert.match(syncFunction, /body_weight_kg_at_achieved/);
  assert.match(syncFunction, /body_weight_kind/);
  assert.match(syncFunction, /best_1rm_relative_bw/);
});

test("active Kleos UI and data loading use Heracles strength and body weight", () => {
  assert.match(dataSource, /from\("heracles_strength_metrics"\)/);
  assert.doesNotMatch(dataSource, /from\("goat_strength_lifts"\)/);
  assert.match(workspaceSource, /sync-heracles-strength/);
  assert.match(workspaceSource, /Strength & Body Metrics/);
  assert.match(workspaceSource, /synced from Heracles/i);
  assert.doesNotMatch(workspaceSource, /Save Lift/);
  assert.doesNotMatch(workspaceSource, /goat_strength_lifts/);
  assert.doesNotMatch(correctionsSource, /goat_strength_lifts/);
  assert.doesNotMatch(correctionsSource, /Strength History/);
});

test("Kleos prompt distinguishes current and stale strength and explains bodyweight-relative evidence", () => {
  assert.match(promptSource, /CURRENT exercise appears only when it was trained in at least 3 distinct completed sessions/i);
  assert.match(promptSource, /STALE value is the last qualifying value retained by Kleos/i);
  assert.match(promptSource, /historical machine\/equipment snapshot/i);
  assert.match(promptSource, /bodyweight-relative e1RM/i);
  assert.match(promptSource, /not an independently selected relative-strength PR/i);
  assert.match(promptSource, /× BW/);
  assert.match(promptSource, /source Heracles \(read-only synchronized value\)/i);
  assert.match(promptSource, /per dumbbell/i);
});

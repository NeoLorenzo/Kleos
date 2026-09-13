const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const migrationPath = path.join(process.cwd(), "supabase/migrations/20260913_0033_financial_balance_sheet.sql");
const currencyFixMigrationPath = path.join(process.cwd(), "supabase/migrations/20260913_0034_financial_balance_sheet_unvalued_currency.sql");
const positionPath = path.join(process.cwd(), "components/FinancialPosition.jsx");
const dimensionPath = path.join(process.cwd(), "components/DimensionState.jsx");

test("balance-sheet migration separates identities from append-only observations", () => {
  const sql = fs.readFileSync(migrationPath, "utf8");
  for (const table of [
    "financial_assets",
    "financial_asset_valuations",
    "financial_liabilities",
    "financial_liability_balances",
    "financial_liability_attestations"
  ]) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}`, "i"));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }

  assert.match(sql, /grant select, insert, update, delete on table public\.financial_assets to authenticated/i);
  assert.match(sql, /grant select, insert on table public\.financial_asset_valuations to authenticated/i);
  assert.doesNotMatch(sql, /grant[^;]*(?:update|delete)[^;]*financial_asset_valuations[^;]*authenticated/i);
  assert.match(sql, /grant select, insert on table public\.financial_liability_balances to authenticated/i);
  assert.doesNotMatch(sql, /grant[^;]*(?:update|delete)[^;]*financial_liability_balances[^;]*authenticated/i);
  assert.match(sql, /attestation_type = 'no_known_liabilities'/i);
  assert.match(sql, /unique \(user_id, attestation_type, scope, as_of_date\)/i);
});

test("derived balance-sheet views remain currency-native and preserve provenance", () => {
  const sql = fs.readFileSync(migrationPath, "utf8");
  for (const view of [
    "financial_current_assets",
    "financial_current_liabilities",
    "financial_liability_status",
    "financial_balance_sheet_current",
    "financial_asset_allocation_current",
    "financial_net_worth_history"
  ]) {
    assert.match(sql, new RegExp(`view public\\.${view}`, "i"));
    assert.match(sql, new RegExp(`grant select on table public\\.${view} to authenticated`, "i"));
  }

  assert.match(sql, /group by user_id, currency/i);
  assert.match(sql, /'bank_synced'::text as source_type/i);
  assert.match(sql, /liquidity_class in \('immediate', 'within_30_days'\)/i);
  assert.match(sql, /observation_complete/i);
  assert.doesNotMatch(sql, /exchange_rate|fx_rate|convert_currency/i);

  const currencyFixSql = fs.readFileSync(currencyFixMigrationPath, "utf8");
  assert.match(currencyFixSql, /coalesce\(v\.currency, a\.currency\) as currency/i);
  assert.match(currencyFixSql, /coalesce\(b\.currency, l\.currency\) as currency/i);
});

test("only compact balance-sheet relations are registered for Kleos Bot", () => {
  const sql = fs.readFileSync(migrationPath, "utf8");
  for (const key of [
    "financial_balance_sheet_current",
    "financial_asset_allocation_current",
    "financial_liability_status"
  ]) {
    assert.match(sql, new RegExp(`'${key}'`, "i"));
  }
  assert.doesNotMatch(sql, /\('financial_assets'\s*,\s*'public\.financial_assets'/i);
  assert.doesNotMatch(sql, /\('financial_asset_valuations'\s*,/i);
  assert.doesNotMatch(sql, /\('financial_liability_balances'\s*,/i);
});

test("Financial UI supports manual assets, liabilities, archival, and affirmative debt attestation", () => {
  const source = fs.readFileSync(positionPath, "utf8");
  assert.match(source, /financial_balance_sheet_current/);
  assert.match(source, /financial_current_assets/);
  assert.match(source, /financial_current_liabilities/);
  assert.match(source, /financial_asset_valuations/);
  assert.match(source, /financial_liability_balances/);
  assert.match(source, /financial_liability_attestations/);
  assert.match(source, /Confirm no known liabilities today/);
  assert.match(source, /ended_on: todayKey\(\)/);
  assert.match(source, /currencies are never silently converted/i);

  const dimension = fs.readFileSync(dimensionPath, "utf8");
  assert.match(dimension, /FinancialPosition/);
  assert.match(dimension, /vectorId === "financial"/);
});

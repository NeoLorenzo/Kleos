const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const migrationPaths = [
  "supabase/migrations/20260913_0036_transaction_correction_schema.sql",
  "supabase/migrations/20260913_0037_transaction_correction_trigger.sql",
  "supabase/migrations/20260913_0038_transaction_correction_api.sql",
  "supabase/migrations/20260914_0039_financial_transaction_rule_amount_scope.sql"
].map((value) => path.join(process.cwd(), value));

function migrationSql() {
  return migrationPaths.map((value) => fs.readFileSync(value, "utf8")).join("\n");
}

const componentPath = path.join(process.cwd(), "components/FinancialTransactionCorrections.jsx");
const dimensionPath = path.join(process.cwd(), "components/DimensionState.jsx");

test("transaction corrections preserve canonical bank rows and store separate provenance", () => {
  const sql = migrationSql();
  assert.match(sql, /create table if not exists public\.financial_transaction_overrides/i);
  assert.match(sql, /create table if not exists public\.financial_counterparty_rules/i);
  assert.match(sql, /transaction_id uuid not null unique references public\.financial_transactions/i);
  assert.doesNotMatch(sql, /update\s+public\.financial_transactions\s+set/i);

  assert.match(sql, /alter table public\.financial_transaction_overrides enable row level security/i);
  assert.match(sql, /alter table public\.financial_counterparty_rules enable row level security/i);
  assert.match(sql, /grant select on table public\.financial_transaction_overrides to authenticated/i);
  assert.match(sql, /grant select on table public\.financial_counterparty_rules to authenticated/i);
  assert.doesNotMatch(sql, /grant[^;]*(?:insert|update|delete|all)[^;]*financial_transaction_overrides[^;]*authenticated/i);
  assert.doesNotMatch(sql, /grant[^;]*(?:insert|update|delete|all)[^;]*financial_counterparty_rules[^;]*authenticated/i);
});

test("correction rules are narrow, amount-scopeable, provenance-tracked, and survive refreshes", () => {
  const sql = migrationSql();
  assert.match(sql, /match_amount numeric/i);
  assert.match(sql, /unique nulls not distinct \(user_id, match_normalized_label, currency, amount_direction, match_amount\)/i);
  assert.match(sql, /amount_direction in \('credit','debit','zero'\)/i);
  assert.match(sql, /r\.match_amount is null or r\.match_amount = abs\(v_amount\)/i);
  assert.match(sql, /order by \(r\.match_amount is not null\) desc/i);
  assert.match(sql, /base_normalized_label text/i);
  assert.match(sql, /interpretation_source text not null default 'deterministic'/i);
  assert.match(sql, /before insert or update on public\.financial_transaction_classifications/i);

  const rulePosition = sql.indexOf("select r.*");
  const overridePosition = sql.indexOf("select o.*");
  assert.ok(rulePosition >= 0 && overridePosition > rulePosition, "transaction override must have precedence over reusable rule");
  assert.match(sql, /user_confirmed_transaction_override/i);
  assert.match(sql, /user_confirmed_counterparty_rule/i);
});

test("inflow semantics are affirmative and the server normalizes their flow", () => {
  const sql = migrationSql();
  for (const semantic of [
    "earned_income",
    "business_income",
    "investment_income",
    "trust_distribution",
    "family_support",
    "internal_transfer",
    "sale_proceeds",
    "refund_reimbursement",
    "other_inflow"
  ]) {
    assert.match(sql, new RegExp(`'${semantic}'`, "i"));
  }
  assert.match(sql, /when 'family_support' then 'external_support'/i);
  assert.match(sql, /when 'trust_distribution' then 'owned_capital_distribution'/i);
  assert.match(sql, /when 'earned_income' then 'independent_earned'/i);
  assert.match(sql, /v_flow_type := public\.financial_flow_type_for_inflow_semantic\(v_semantic\)/i);
  assert.match(sql, /FINANCIAL_CORRECTION_INFLOW_REQUIRES_CREDIT/i);
  assert.match(sql, /create or replace view public\.financial_inflow_source_summary/i);
  assert.match(sql, /'financial_inflow_source_summary'/i);
});

test("authorized RPCs and review UI expose safe rule scope", () => {
  const sql = migrationSql();
  assert.match(sql, /p_match_exact_amount boolean default false/i);
  assert.match(sql, /create function public\.save_financial_transaction_correction/i);
  assert.match(sql, /create or replace function public\.clear_financial_transaction_correction/i);
  assert.match(sql, /v_email <> 'theneolorenzo@gmail\.com'/i);
  assert.match(sql, /interpretation_rule_match_amount/i);

  const source = fs.readFileSync(componentPath, "utf8");
  assert.match(source, /financial_transaction_review_queue/);
  assert.match(source, /p_match_exact_amount/);
  assert.match(source, /Require the same amount/i);
  assert.match(source, /disabled=\{Boolean\(form\.economic_inflow_type\)\}/);
  assert.match(source, /Derived from inflow meaning/i);
  assert.match(source, /Apply to matching historical and future transactions/i);
  assert.match(source, /No fuzzy matching is used/i);
  assert.match(source, /User confirmed/);
  assert.match(source, /family_support/);

  const dimension = fs.readFileSync(dimensionPath, "utf8");
  assert.match(dimension, /FinancialTransactionCorrections/);
  assert.match(dimension, /<FinancialTransactionCorrections userId=\{userId\}/);
});

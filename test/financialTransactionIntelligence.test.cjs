const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const intelligenceMigration = path.join(
  process.cwd(),
  "supabase/migrations/20260912_0019_transaction_intelligence.sql"
);
const syncTriggerMigration = path.join(
  process.cwd(),
  "supabase/migrations/20260912_0020_transaction_classification_sync_trigger.sql"
);
const preferredConnectionMigration = path.join(
  process.cwd(),
  "supabase/migrations/20260912_0021_preferred_connection_analytics.sql"
);
const workspacePath = path.join(process.cwd(), "components/FinancialWorkspace.jsx");

function read(file) {
  return fs.readFileSync(file, "utf8");
}

test("transaction intelligence is a separate derived layer and remains browser read-only", () => {
  const sql = read(intelligenceMigration);
  assert.match(sql, /create table if not exists public\.financial_transaction_classifications/i);
  assert.match(sql, /transaction_id uuid primary key references public\.financial_transactions\(id\) on delete cascade/i);
  assert.match(sql, /classifier_version text not null/i);
  assert.match(sql, /confidence numeric\(4,3\) not null/i);
  assert.match(sql, /alter table public\.financial_transaction_classifications enable row level security/i);
  assert.match(sql, /grant select on table public\.financial_transaction_classifications to authenticated/i);
  assert.doesNotMatch(sql, /grant\s+(?:insert|update|delete|all)\s+on table public\.financial_transaction_classifications to authenticated/i);
  assert.doesNotMatch(sql, /alter table public\.financial_transactions[\s\S]{0,120}add column[\s\S]{0,80}(flow_type|category|classifier)/i);
});

test("deterministic classifier excludes FX and zero-value records from economic spending", () => {
  const sql = read(intelligenceMigration);
  assert.match(sql, /when n\.amount = 0 then 'zero_value'/i);
  assert.match(sql, /when n\.bank_code = 'EXCHANGE' then 'transfer'/i);
  assert.match(sql, /when n\.bank_code = 'EXCHANGE' then 'currency_exchange'/i);
  assert.match(sql, /case when n\.bank_code in \('EXCHANGE', 'ATM'\) then true else false end as is_internal_transfer/i);
  assert.match(sql, /case when n\.bank_code = 'EXCHANGE' then true else false end as is_fx_conversion/i);
  assert.match(sql, /when n\.bank_code = 'CARD_REFUND' then 'refund'/i);
  assert.match(sql, /when n\.bank_code in \('CARD_PAYMENT', 'REV_PAYMENT'\) and n\.amount < 0 then 'expense'/i);
  assert.match(sql, /when n\.bank_code in \('TRANSFER', 'TOPUP', 'ATM'\) then 'transfer'/i);
});

test("cash-flow views keep currencies separate and exclude transfers from income and spending", () => {
  const sql = read(preferredConnectionMigration);
  assert.match(sql, /create or replace view public\.financial_cash_flow_monthly/i);
  assert.match(sql, /group by t\.user_id,[\s\S]*t\.currency/i);
  assert.match(sql, /flow_type in \('income','interest'\)[\s\S]*income_amount/i);
  assert.match(sql, /flow_type in \('expense','fee','tax'\)[\s\S]*spending_amount/i);
  assert.match(sql, /flow_type = 'transfer'[\s\S]*transfer_in/i);
  assert.match(sql, /flow_type = 'transfer'[\s\S]*transfer_out/i);
  assert.match(sql, /cross join \(values \(30\), \(90\), \(365\)\)/i);
  assert.doesNotMatch(sql, /exchange_rate|fx_rate|converted_amount/i);
});

test("analytics use the preferred usable bank connection so reconnects cannot double-count history", () => {
  const sql = read(preferredConnectionMigration);
  assert.match(sql, /create or replace view public\.financial_preferred_bank_connection/i);
  assert.match(sql, /provider_session_id is not null/i);
  assert.match(sql, /last_synced_at is not null/i);
  assert.match(sql, /not in \('EXPIRED','REVOKED','CLOSED','INVALID','CANCELLED'\)/i);
  for (const view of [
    "financial_cash_flow_monthly",
    "financial_spending_by_category",
    "financial_cash_flow_rolling",
    "financial_top_merchants",
    "financial_recurring_expenses",
    "financial_classification_coverage"
  ]) {
    const start = sql.indexOf(`create or replace view public.${view}`);
    assert.ok(start >= 0, `${view} must exist`);
    const next = sql.indexOf("create or replace view public.", start + 1);
    const block = sql.slice(start, next === -1 ? sql.length : next);
    assert.match(block, /join public\.financial_preferred_bank_connection p/i, `${view} must scope to preferred connections`);
  }
});

test("recurrence detection requires repeated cadence evidence or a known subscription merchant", () => {
  const sql = read(intelligenceMigration);
  assert.match(sql, /active_months >= 3[\s\S]*occurrences >= 3/i);
  assert.match(sql, /average_gap_days between 25 and 36/i);
  assert.match(sql, /amount_stddev \/ nullif\(s\.average_amount, 0\)[\s\S]*<= 0\.20/i);
  assert.match(sql, /average_gap_days between 330 and 400/i);
  assert.match(sql, /is_recurring = true/i);
  assert.match(sql, /recurrence_interval_days/i);
  assert.match(sql, /recurrence_occurrences/i);
});

test("classification refresh after bank sync cannot roll back canonical synchronization", () => {
  const sql = read(syncTriggerMigration);
  assert.match(sql, /after update of last_synced_at on public\.financial_bank_connections/i);
  assert.match(sql, /refresh_financial_transaction_classifications\(new\.user_id, new\.id\)/i);
  assert.match(sql, /exception when others then[\s\S]*null;/i);
});

test("Financial workspace loads and displays classified cash-flow intelligence", () => {
  const source = read(workspacePath);
  for (const relation of [
    "financial_cash_flow_monthly",
    "financial_spending_by_category",
    "financial_cash_flow_rolling",
    "financial_recurring_expenses",
    "financial_classification_coverage",
    "financial_top_merchants",
    "financial_transaction_classifications"
  ]) {
    assert.match(source, new RegExp(relation));
  }
  assert.match(source, /setSelectedCurrency/);
  assert.match(source, /Net cash flow · month/);
  assert.match(source, /Transfers excluded from cash-flow KPIs/i);
  assert.match(source, /Raw bank rows remain canonical evidence/i);
});

test("derived financial summaries are registered as Kleos Bot evidence", () => {
  const sql = read(intelligenceMigration);
  for (const group of [
    "financial_cash_flow_monthly",
    "financial_spending_by_category",
    "financial_recurring_expenses",
    "financial_classification_coverage"
  ]) {
    assert.match(sql, new RegExp(`'${group}'`));
  }
});

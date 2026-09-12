const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260912_0023_transaction_remittance_metadata.sql"
);
const workspacePath = path.join(process.cwd(), "components/FinancialWorkspace.jsx");

function read(file) {
  return fs.readFileSync(file, "utf8");
}

test("canonical transactions promote remittance and provider transaction-code metadata", () => {
  const sql = read(migrationPath);
  for (const column of [
    "remittance_information text[]",
    "transaction_note text",
    "bank_transaction_code text",
    "bank_transaction_subcode text",
    "bank_transaction_description text",
    "provider_reference_number text"
  ]) {
    assert.match(sql, new RegExp(column.replace(/[\[\]]/g, "\\$&"), "i"));
  }
  assert.match(sql, /update public\.financial_transactions[\s\S]*raw_data->'remittance_information'/i);
  assert.match(sql, /raw_data->'bank_transaction_code'->>'code'/i);
});

test("bank sync persistence upserts promoted metadata while retaining raw evidence", () => {
  const sql = read(migrationPath);
  const functionStart = sql.indexOf("create or replace function public.persist_financial_bank_sync");
  assert.ok(functionStart >= 0);
  const block = sql.slice(functionStart);
  assert.match(block, /remittance_information,/i);
  assert.match(block, /bank_transaction_code,/i);
  assert.match(block, /provider_reference_number,/i);
  assert.match(block, /raw_data,/i);
  assert.match(block, /remittance_information = excluded\.remittance_information/i);
  assert.match(block, /raw_data = excluded\.raw_data/i);
});

test("remittance context enriches derived classification without turning transfers into income", () => {
  const sql = read(migrationPath);
  assert.match(sql, /enhance_financial_transaction_classifications/i);
  assert.match(sql, /array_to_string\(t\.remittance_information, ' '\)/i);
  assert.match(sql, /when c\.flow_type = 'transfer'[\s\S]*then i\.context_subcategory/i);
  assert.match(sql, /remittance_rent_context/i);
  assert.match(sql, /classifier_version = '1\.1\.0'/i);
  assert.doesNotMatch(sql, /flow_type\s*=\s*'income'[\s\S]{0,120}remittance/i);
});

test("future successful bank syncs run remittance enrichment after baseline classification", () => {
  const sql = read(migrationPath);
  const triggerFunction = sql.slice(sql.indexOf("create or replace function public.refresh_financial_classifications_after_bank_sync"));
  assert.match(triggerFunction, /refresh_financial_transaction_classifications\(new\.user_id, new\.id\)/i);
  assert.match(triggerFunction, /enhance_financial_transaction_classifications\(new\.user_id, new\.id\)/i);
  assert.match(triggerFunction, /exception when others then[\s\S]*null;/i);
});

test("Financial workspace fetches and displays remittance context without obvious duplicates", () => {
  const source = read(workspacePath);
  assert.match(source, /remittance_information,transaction_note,bank_transaction_code/i);
  assert.match(source, /transactionContextNote\(transaction, primaryLabel\)/i);
  assert.match(source, /isRedundantTransactionContext/i);
  assert.match(source, /candidate === primary \|\| candidate\.startsWith\(primary\) \|\| primary\.startsWith\(candidate\)/i);
  assert.match(source, /\^\(from\|to\)\\s\+/i);
  assert.match(source, /transaction\.bank_transaction_code \? <small>/i);
  assert.match(source, /classification\?\.subcategory/i);
});

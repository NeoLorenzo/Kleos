const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260912_0017_financial_open_banking.sql"
);
const functionPath = path.join(
  process.cwd(),
  "supabase/functions/sync-financial-bank/index.ts"
);

async function helpers() {
  return import("../supabase/functions/_shared/financial.mjs");
}

test("selectRevolutInstitution discovers Revolut without a hard-coded institution id", async () => {
  const { selectRevolutInstitution } = await helpers();
  const institution = selectRevolutInstitution([
    { id: "BANK_PT", name: "Example Bank" },
    { id: "REVOLUT_REVOGB21", name: "Revolut" }
  ]);
  assert.equal(institution.id, "REVOLUT_REVOGB21");
});

test("account identifiers are irreversibly reduced to the final four visible characters", async () => {
  const { maskAccountIdentifier } = await helpers();
  assert.equal(maskAccountIdentifier("PT50 0002 0123 1234 5678 9015 4"), "•••• 0154");
  assert.equal(maskAccountIdentifier(""), null);
});

test("normalization preserves currency and separates booked and pending transactions", async () => {
  const { normalizeAccount } = await helpers();
  const account = normalizeAccount({
    providerAccountId: "provider-account-1",
    metadata: { status: "READY", iban: "PT50000000000000000123456", owner_name: "Owner" },
    details: { account: { name: "Personal", currency: "EUR", cashAccountType: "CACC" } },
    balances: {
      balances: [{
        balanceAmount: { amount: "1234.56", currency: "EUR" },
        balanceType: "interimAvailable",
        referenceDate: "2026-09-12"
      }]
    },
    transactions: {
      transactions: {
        booked: [{
          transactionId: "txn-1",
          transactionAmount: { amount: "-12.34", currency: "EUR" },
          bookingDate: "2026-09-11",
          creditorName: "Merchant",
          remittanceInformationUnstructured: "Lunch"
        }],
        pending: [{
          transactionAmount: { amount: "-4.20", currency: "EUR" },
          valueDate: "2026-09-12",
          merchantName: "Coffee"
        }]
      }
    }
  });

  assert.equal(account.currency, "EUR");
  assert.equal(account.masked_identifier, "•••• 3456");
  assert.equal(account.balances[0].amount, 1234.56);
  assert.deepEqual(account.transactions.map((row) => row.status), ["booked", "pending"]);
  assert.equal(account.transactions[0].counterparty_name, "Merchant");
  assert.equal(account.transactions[1].merchant_name, "Coffee");
});

test("fallback transaction identities are deterministic and hashed before persistence", async () => {
  const { finalizeTransactionKeys, normalizeAccount } = await helpers();
  const raw = {
    transactionAmount: { amount: "-9.99", currency: "EUR" },
    valueDate: "2026-09-12",
    merchantName: "Example"
  };
  const account = normalizeAccount({
    providerAccountId: "provider-account-1",
    metadata: {},
    details: {},
    balances: { balances: [] },
    transactions: { transactions: { booked: [], pending: [raw] } }
  });

  const first = await finalizeTransactionKeys(account);
  const second = await finalizeTransactionKeys(account);
  assert.equal(first.transactions[0].provider_transaction_key, second.transactions[0].provider_transaction_key);
  assert.match(first.transactions[0].provider_transaction_key, /^sha256:[0-9a-f]{64}$/);
  assert.ok(!("provider_transaction_key_material" in first.transactions[0]));
});

test("migration makes synchronized financial tables browser read-only and registers safe evidence relations", () => {
  const sql = fs.readFileSync(migrationPath, "utf8");
  for (const table of [
    "financial_bank_connections",
    "financial_accounts",
    "financial_account_balances",
    "financial_transactions"
  ]) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
    assert.match(sql, new RegExp(`grant select on table public\\.${table} to authenticated`, "i"));
  }
  assert.doesNotMatch(sql, /grant\s+(?:insert|update|delete|all).*financial_(?:bank_connections|accounts|account_balances|transactions).*authenticated/i);
  assert.match(sql, /financial_current_balances/);
  assert.match(sql, /financial_recent_transactions/);
  assert.match(sql, /grant execute on function public\.persist_financial_bank_sync[\s\S]*to service_role/i);
});

test("Edge Function keeps GoCardless credentials server-side and validates callback destinations", () => {
  const source = fs.readFileSync(functionPath, "utf8");
  assert.match(source, /Deno\.env\.get\("GOCARDLESS_SECRET_ID"\)/);
  assert.match(source, /Deno\.env\.get\("GOCARDLESS_SECRET_KEY"\)/);
  assert.match(source, /hostname === "neolorenzo\.github\.io"/);
  assert.match(source, /financial_bank_connections/);
  assert.match(source, /persist_financial_bank_sync/);
  assert.doesNotMatch(source, /REVOLUT_[A-Z0-9]+"\s*;/);
});

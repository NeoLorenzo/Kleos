const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { webcrypto } = require("node:crypto");

if (!globalThis.crypto) globalThis.crypto = webcrypto;
if (!globalThis.btoa) globalThis.btoa = (value) => Buffer.from(value, "binary").toString("base64");
if (!globalThis.atob) globalThis.atob = (value) => Buffer.from(value, "base64").toString("binary");

const baseMigrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260912_0017_financial_open_banking.sql"
);
const providerMigrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260912_0018_enable_banking_provider.sql"
);
const functionPath = path.join(
  process.cwd(),
  "supabase/functions/sync-financial-bank/index.ts"
);

async function helpers() {
  return import("../supabase/functions/_shared/financial.mjs");
}

function base64UrlJson(segment) {
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
}

function toPem(bytes, label) {
  const body = Buffer.from(bytes).toString("base64").match(/.{1,64}/g).join("\n");
  return `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----`;
}

test("selectRevolutInstitution discovers Revolut Portugal from Enable Banking ASPSPs", async () => {
  const { selectRevolutInstitution } = await helpers();
  const institution = selectRevolutInstitution({
    aspsps: [
      { name: "Example Bank", country: "PT", beta: false },
      { name: "Revolut", country: "PT", beta: false, maximum_consent_validity: 7776000 },
      { name: "Revolut", country: "LT", beta: false }
    ]
  }, "PT");
  assert.equal(institution.name, "Revolut");
  assert.equal(institution.country, "PT");
});

test("Enable Banking JWT uses RS256 application identity and expected claims", async () => {
  const { createEnableBankingJwt } = await helpers();
  const keyPair = await webcrypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"]
  );
  const privatePkcs8 = await webcrypto.subtle.exportKey("pkcs8", keyPair.privateKey);
  const privatePem = toPem(privatePkcs8, "PRIVATE KEY");
  const appId = "123e4567-e89b-42d3-a456-426614174000";
  const jwt = await createEnableBankingJwt({
    appId,
    privateKeyPem: privatePem,
    nowSeconds: 1700000000,
    ttlSeconds: 900
  });
  const [headerSegment, payloadSegment, signatureSegment] = jwt.split(".");
  const header = base64UrlJson(headerSegment);
  const payload = base64UrlJson(payloadSegment);

  assert.deepEqual(header, { typ: "JWT", alg: "RS256", kid: appId });
  assert.equal(payload.iss, "enablebanking.com");
  assert.equal(payload.aud, "api.enablebanking.com");
  assert.equal(payload.iat, 1700000000);
  assert.equal(payload.exp, 1700000900);

  const verified = await webcrypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    keyPair.publicKey,
    Buffer.from(signatureSegment, "base64url"),
    Buffer.from(`${headerSegment}.${payloadSegment}`)
  );
  assert.equal(verified, true);
});

test("account identifiers are reduced to the final four visible characters", async () => {
  const { maskAccountIdentifier } = await helpers();
  assert.equal(maskAccountIdentifier("PT50 0002 0123 1234 5678 9015 4"), "•••• 0154");
  assert.equal(maskAccountIdentifier(""), null);
});

test("Enable Banking normalization preserves currency, signs debits, and separates booked/pending", async () => {
  const { normalizeAccount } = await helpers();
  const account = normalizeAccount({
    providerAccountId: "07cc67f4-45d6-494b-adac-09b5cbc7e2b5",
    metadata: {
      uid: "07cc67f4-45d6-494b-adac-09b5cbc7e2b5",
      name: "Owner",
      product: "Personal",
      currency: "EUR",
      cash_account_type: "CACC",
      account_id: { iban: "PT50000000000000000123456" }
    },
    details: null,
    balances: {
      balances: [{
        balance_amount: { amount: "1234.56", currency: "EUR" },
        balance_type: "CLAV",
        reference_date: "2026-09-12"
      }]
    },
    transactions: {
      transactions: [{
        entry_reference: "entry-1",
        transaction_amount: { amount: "12.34", currency: "EUR" },
        credit_debit_indicator: "DBIT",
        status: "BOOK",
        booking_date: "2026-09-11",
        creditor: { name: "Merchant" },
        creditor_account: { iban: "PT50000000000000000999999" },
        remittance_information: ["Lunch"]
      }, {
        transaction_amount: { amount: "4.20", currency: "EUR" },
        credit_debit_indicator: "DBIT",
        status: "PDNG",
        value_date: "2026-09-12",
        creditor: { name: "Coffee" }
      }]
    }
  });

  assert.equal(account.currency, "EUR");
  assert.equal(account.masked_identifier, "•••• 3456");
  assert.equal(account.balances[0].amount, 1234.56);
  assert.deepEqual(account.transactions.map((row) => row.status), ["booked", "pending"]);
  assert.deepEqual(account.transactions.map((row) => row.amount), [-12.34, -4.2]);
  assert.equal(account.transactions[0].counterparty_name, "Merchant");
  assert.equal(account.transactions[0].description, "Lunch");
  assert.ok(!("creditor_account" in account.transactions[0].raw_data));
});

test("fallback transaction identity ignores volatile provider transaction_id", async () => {
  const { finalizeTransactionKeys, normalizeAccount } = await helpers();
  const makeAccount = (transactionId) => normalizeAccount({
    providerAccountId: "provider-account-1",
    metadata: { uid: "provider-account-1", currency: "EUR" },
    details: null,
    balances: { balances: [] },
    transactions: {
      transactions: [{
        transaction_id: transactionId,
        transaction_amount: { amount: "9.99", currency: "EUR" },
        credit_debit_indicator: "DBIT",
        status: "PDNG",
        value_date: "2026-09-12",
        creditor: { name: "Example" }
      }]
    }
  });

  const first = await finalizeTransactionKeys(makeAccount("volatile-1"));
  const second = await finalizeTransactionKeys(makeAccount("volatile-2"));
  assert.equal(first.transactions[0].provider_transaction_key, second.transactions[0].provider_transaction_key);
  assert.match(first.transactions[0].provider_transaction_key, /^sha256:[0-9a-f]{64}$/);
});

test("financial migrations preserve browser read-only access and add Enable Banking session metadata", () => {
  const baseSql = fs.readFileSync(baseMigrationPath, "utf8");
  const providerSql = fs.readFileSync(providerMigrationPath, "utf8");
  for (const table of [
    "financial_bank_connections",
    "financial_accounts",
    "financial_account_balances",
    "financial_transactions"
  ]) {
    assert.match(baseSql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
    assert.match(baseSql, new RegExp(`grant select on table public\\.${table} to authenticated`, "i"));
  }
  assert.doesNotMatch(baseSql, /grant\s+(?:insert|update|delete|all).*financial_(?:bank_connections|accounts|account_balances|transactions).*authenticated/i);
  assert.match(baseSql, /grant execute on function public\.persist_financial_bank_sync[\s\S]*to service_role/i);
  assert.match(providerSql, /provider_session_id text/i);
  assert.match(providerSql, /consent_valid_until timestamptz/i);
  assert.match(providerSql, /provider in \('gocardless', 'enable_banking'\)/i);
});

test("Edge Function keeps Enable Banking private key server-side and validates state-bound callback flow", () => {
  const source = fs.readFileSync(functionPath, "utf8");
  assert.match(source, /Deno\.env\.get\("ENABLE_BANKING_APP_ID"\)/);
  assert.match(source, /Deno\.env\.get\("ENABLE_BANKING_PRIVATE_KEY"\)/);
  assert.match(source, /\/aspsps\?country=/);
  assert.match(source, /provider_reference !== state/);
  assert.match(source, /provider_session_id/);
  assert.match(source, /\/sessions/);
  assert.match(source, /persist_financial_bank_sync/);
  assert.doesNotMatch(source, /GOCARDLESS_SECRET_ID|GOCARDLESS_SECRET_KEY/);
});

test("public privacy and terms routes exist for Enable Banking production registration", () => {
  const privacy = path.join(process.cwd(), "app/privacy/page.js");
  const terms = path.join(process.cwd(), "app/terms/page.js");
  assert.ok(fs.existsSync(privacy));
  assert.ok(fs.existsSync(terms));
  assert.match(fs.readFileSync(privacy, "utf8"), /Enable Banking/);
  assert.match(fs.readFileSync(terms, "utf8"), /Enable Banking/);
});

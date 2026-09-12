const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;

export function normalizeCountry(value, fallback = "PT") {
  const country = String(value || fallback).trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) throw new Error("INVALID_COUNTRY");
  return country;
}

export function selectRevolutInstitution(payload, expectedCountry = "PT") {
  const institutions = Array.isArray(payload) ? payload : payload?.aspsps;
  if (!Array.isArray(institutions)) return null;

  const country = normalizeCountry(expectedCountry);
  const candidates = institutions.filter((institution) => {
    const name = String(institution?.name || "").trim().toLowerCase();
    const institutionCountry = String(institution?.country || country).trim().toUpperCase();
    return institutionCountry === country && (name === "revolut" || name.includes("revolut"));
  });

  if (!candidates.length) return null;
  return candidates.sort((left, right) => {
    const leftExact = String(left?.name || "").trim().toLowerCase() === "revolut" ? 0 : 1;
    const rightExact = String(right?.name || "").trim().toLowerCase() === "revolut" ? 0 : 1;
    if (leftExact !== rightExact) return leftExact - rightExact;
    if (Boolean(left?.beta) !== Boolean(right?.beta)) return left?.beta ? 1 : -1;
    return String(left?.name || "").localeCompare(String(right?.name || ""));
  })[0];
}

export async function createEnableBankingJwt({
  appId,
  privateKeyPem,
  nowSeconds = Math.floor(Date.now() / 1000),
  ttlSeconds = 900
}) {
  const kid = String(appId || "").trim();
  if (!kid) throw new Error("ENABLE_BANKING_APP_ID_REQUIRED");
  if (!Number.isInteger(nowSeconds) || nowSeconds <= 0) throw new Error("INVALID_JWT_TIME");
  if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0 || ttlSeconds > 3600) {
    throw new Error("INVALID_JWT_TTL");
  }

  const privateKey = await importPrivateKey(privateKeyPem);
  const header = base64UrlJson({ typ: "JWT", alg: "RS256", kid });
  const payload = base64UrlJson({
    iss: "enablebanking.com",
    aud: "api.enablebanking.com",
    iat: nowSeconds,
    exp: nowSeconds + ttlSeconds
  });
  const signingInput = `${header}.${payload}`;
  const signature = await globalThis.crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(signingInput)
  );
  return `${signingInput}.${base64UrlBytes(new Uint8Array(signature))}`;
}

export function maskAccountIdentifier(value) {
  const compact = String(value || "").replace(/\s+/g, "").trim();
  if (!compact) return null;
  return `•••• ${compact.slice(-4)}`;
}

export function normalizeBalances(payload) {
  const balances = Array.isArray(payload?.balances) ? payload.balances : [];
  return balances.flatMap((balance) => {
    const amountData = balance?.balance_amount || balance?.balanceAmount || {};
    const amount = parseAmount(amountData?.amount);
    const currency = normalizeCurrency(amountData?.currency);
    const balanceType = cleanText(balance?.balance_type || balance?.balanceType || balance?.name, 80);
    if (amount === null || !currency || !balanceType) return [];

    return [{
      balance_type: balanceType,
      amount,
      currency,
      reference_date: normalizeDate(balance?.reference_date || balance?.referenceDate),
      provider_changed_at: normalizeDateTime(
        balance?.last_change_date_time || balance?.lastChangeDateTime
      )
    }];
  });
}

export function normalizeAccount({ providerAccountId, metadata, details, balances, transactions }) {
  const account = isPlainObject(details) && Object.keys(details).length ? details : (metadata || {});
  const identifier = extractAccountIdentifier(account) || extractAccountIdentifier(metadata || {});
  const currency = normalizeCurrency(account?.currency || metadata?.currency || firstBalanceCurrency(balances));
  const accountName = cleanText(account?.details || account?.product || metadata?.details || metadata?.product, 240);
  const ownerName = cleanText(account?.name || metadata?.name, 240);

  return {
    provider_account_id: cleanText(providerAccountId || account?.uid || metadata?.uid, 160),
    provider_status: cleanText(account?.psu_status || metadata?.psu_status, 80),
    account_name: accountName || ownerName || "Revolut account",
    owner_name: ownerName,
    currency,
    cash_account_type: cleanText(account?.cash_account_type || metadata?.cash_account_type, 120),
    masked_identifier: maskAccountIdentifier(identifier),
    balances: normalizeBalances(balances),
    transactions: normalizeTransactions(transactions)
  };
}

export function normalizeTransactions(payload) {
  const transactions = Array.isArray(payload?.transactions) ? payload.transactions : [];
  return transactions.flatMap((transaction) => normalizeTransaction(transaction));
}

export function normalizeTransaction(raw) {
  if (!isPlainObject(raw)) return [];
  const amountData = raw?.transaction_amount || raw?.transactionAmount || {};
  const unsignedAmount = parseAmount(amountData?.amount);
  const currency = normalizeCurrency(amountData?.currency);
  const status = normalizeTransactionStatus(raw?.status, raw?.booking_date || raw?.bookingDate);
  if (unsignedAmount === null || !currency || !status) return [];

  const indicator = String(raw?.credit_debit_indicator || raw?.creditDebitIndicator || "").toUpperCase();
  const amount = indicator === "DBIT"
    ? -Math.abs(unsignedAmount)
    : indicator === "CRDT"
      ? Math.abs(unsignedAmount)
      : unsignedAmount;
  const counterpartyName = indicator === "DBIT"
    ? cleanText(raw?.creditor?.name, 300)
    : cleanText(raw?.debtor?.name, 300);
  const entryReference = cleanText(raw?.entry_reference, 300);
  const fallbackIdentity = {
    amount,
    currency,
    indicator,
    booking_date: normalizeDate(raw?.booking_date || raw?.bookingDate),
    value_date: normalizeDate(raw?.value_date || raw?.valueDate),
    transaction_date: normalizeDate(raw?.transaction_date || raw?.transactionDate),
    reference_number: cleanText(raw?.reference_number, 300),
    remittance_information: normalizeRemittance(raw?.remittance_information),
    counterparty_name: counterpartyName,
    merchant_category_code: cleanText(raw?.merchant_category_code, 40)
  };

  return [{
    provider_transaction_key_material: entryReference
      ? `entry:${entryReference}`
      : `fallback:${stableStringify(fallbackIdentity)}`,
    provider_transaction_id: entryReference,
    status,
    booking_date: normalizeDate(raw?.booking_date || raw?.bookingDate),
    value_date: normalizeDate(raw?.value_date || raw?.valueDate),
    amount,
    currency,
    counterparty_name: counterpartyName,
    merchant_name: null,
    description: transactionDescription(raw, counterpartyName),
    raw_data: sanitizeTransactionRawData(raw)
  }];
}

export async function finalizeTransactionKeys(account) {
  const transactions = [];
  for (const transaction of account.transactions || []) {
    const material = transaction.provider_transaction_key_material;
    const provider_transaction_key = material.startsWith("entry:")
      ? material
      : `sha256:${await sha256Hex(material)}`;
    const { provider_transaction_key_material: _material, ...rest } = transaction;
    transactions.push({ provider_transaction_key, ...rest });
  }
  return { ...account, transactions };
}

export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  if (isPlainObject(value)) {
    const entries = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

function normalizeTransactionStatus(value, bookingDate) {
  const status = String(value || "").trim().toUpperCase();
  if (status === "BOOK") return "booked";
  if (["PDNG", "HOLD", "SCHD"].includes(status)) return "pending";
  if (status === "OTHR") return bookingDate ? "booked" : "pending";
  return null;
}

function sanitizeTransactionRawData(raw) {
  return {
    entry_reference: cleanText(raw?.entry_reference, 300),
    merchant_category_code: cleanText(raw?.merchant_category_code, 40),
    transaction_amount: isPlainObject(raw?.transaction_amount) ? raw.transaction_amount : undefined,
    creditor: raw?.creditor?.name ? { name: cleanText(raw.creditor.name, 300) } : undefined,
    debtor: raw?.debtor?.name ? { name: cleanText(raw.debtor.name, 300) } : undefined,
    bank_transaction_code: isPlainObject(raw?.bank_transaction_code) ? raw.bank_transaction_code : undefined,
    credit_debit_indicator: cleanText(raw?.credit_debit_indicator, 20),
    status: cleanText(raw?.status, 20),
    booking_date: normalizeDate(raw?.booking_date),
    value_date: normalizeDate(raw?.value_date),
    transaction_date: normalizeDate(raw?.transaction_date),
    balance_after_transaction: isPlainObject(raw?.balance_after_transaction)
      ? raw.balance_after_transaction
      : undefined,
    reference_number: cleanText(raw?.reference_number, 300),
    remittance_information: normalizeRemittance(raw?.remittance_information),
    note: cleanText(raw?.note, 1000),
    transaction_id: cleanText(raw?.transaction_id, 300)
  };
}

function extractAccountIdentifier(account) {
  return account?.account_id?.iban
    || account?.account_id?.other?.identification
    || account?.all_account_ids?.find?.((item) => item?.identification)?.identification
    || null;
}

function firstBalanceCurrency(payload) {
  const balance = Array.isArray(payload?.balances) ? payload.balances[0] : null;
  const amountData = balance?.balance_amount || balance?.balanceAmount || {};
  return amountData?.currency || null;
}

function transactionDescription(raw, counterpartyName) {
  const remittance = normalizeRemittance(raw?.remittance_information);
  if (remittance.length) return cleanText(remittance.join(" · "), 1000);
  return cleanText(
    raw?.note
      || raw?.reference_number
      || raw?.bank_transaction_code?.description
      || counterpartyName,
    1000
  );
}

function normalizeRemittance(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  if (value === null || value === undefined || value === "") return [];
  return [String(value).trim()].filter(Boolean);
}

async function importPrivateKey(privateKeyPem) {
  const pem = String(privateKeyPem || "").replace(/\\n/g, "\n").trim();
  if (!pem.includes("BEGIN PRIVATE KEY")) throw new Error("ENABLE_BANKING_PRIVATE_KEY_INVALID");
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  let binary;
  try {
    binary = globalThis.atob(base64);
  } catch (_error) {
    throw new Error("ENABLE_BANKING_PRIVATE_KEY_INVALID");
  }
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return globalThis.crypto.subtle.importKey(
    "pkcs8",
    bytes,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

function base64UrlJson(value) {
  return base64UrlBytes(new TextEncoder().encode(JSON.stringify(value)));
}

function base64UrlBytes(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return globalThis.btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function parseAmount(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeCurrency(value) {
  const currency = String(value || "").trim().toUpperCase();
  return CURRENCY_PATTERN.test(currency) ? currency : null;
}

function normalizeDate(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const direct = text.slice(0, 10);
  return DATE_PATTERN.test(direct) ? direct : null;
}

function normalizeDateTime(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const timestamp = new Date(text);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString();
}

function cleanText(value, maxLength) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.slice(0, maxLength);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

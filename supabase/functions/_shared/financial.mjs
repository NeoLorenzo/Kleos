const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;

export function normalizeCountry(value, fallback = "PT") {
  const country = String(value || fallback).trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) {
    throw new Error("INVALID_COUNTRY");
  }
  return country;
}

export function selectRevolutInstitution(institutions) {
  if (!Array.isArray(institutions)) return null;

  const candidates = institutions.filter((institution) => {
    const id = String(institution?.id || "").toUpperCase();
    const name = String(institution?.name || "").trim().toLowerCase();
    return id.startsWith("REVOLUT_") || name === "revolut" || name.includes("revolut");
  });

  if (!candidates.length) return null;
  return candidates.sort((left, right) => {
    const leftExact = String(left?.name || "").trim().toLowerCase() === "revolut" ? 0 : 1;
    const rightExact = String(right?.name || "").trim().toLowerCase() === "revolut" ? 0 : 1;
    if (leftExact !== rightExact) return leftExact - rightExact;
    return String(left?.id || "").localeCompare(String(right?.id || ""));
  })[0];
}

export function maskAccountIdentifier(value) {
  const compact = String(value || "").replace(/\s+/g, "").trim();
  if (!compact) return null;
  return `•••• ${compact.slice(-4)}`;
}

export function normalizeBalances(payload) {
  const balances = Array.isArray(payload?.balances) ? payload.balances : [];
  return balances.flatMap((balance) => {
    const amount = parseAmount(balance?.balanceAmount?.amount);
    const currency = normalizeCurrency(balance?.balanceAmount?.currency);
    const balanceType = cleanText(balance?.balanceType, 80);
    if (amount === null || !currency || !balanceType) return [];

    return [{
      balance_type: balanceType,
      amount,
      currency,
      reference_date: normalizeDate(balance?.referenceDate),
      provider_changed_at: normalizeDateTime(balance?.lastChangeDateTime)
    }];
  });
}

export function normalizeAccount({ providerAccountId, metadata, details, balances, transactions }) {
  const accountDetails = details?.account && typeof details.account === "object"
    ? details.account
    : {};
  const identifier = metadata?.iban || accountDetails?.iban || metadata?.bban || accountDetails?.bban;
  const currency = normalizeCurrency(
    accountDetails?.currency || metadata?.currency || firstBalanceCurrency(balances)
  );

  return {
    provider_account_id: cleanText(providerAccountId, 160),
    provider_status: cleanText(metadata?.status, 80),
    account_name: cleanText(
      accountDetails?.name || metadata?.name || accountDetails?.product || metadata?.product,
      240
    ),
    owner_name: cleanText(metadata?.owner_name || accountDetails?.ownerName, 240),
    currency,
    cash_account_type: cleanText(
      accountDetails?.cashAccountType || metadata?.cash_account_type,
      120
    ),
    masked_identifier: maskAccountIdentifier(identifier),
    balances: normalizeBalances(balances),
    transactions: normalizeTransactions(transactions)
  };
}

export function normalizeTransactions(payload) {
  const booked = Array.isArray(payload?.transactions?.booked)
    ? payload.transactions.booked
    : [];
  const pending = Array.isArray(payload?.transactions?.pending)
    ? payload.transactions.pending
    : [];

  return [
    ...booked.flatMap((transaction) => normalizeTransaction(transaction, "booked")),
    ...pending.flatMap((transaction) => normalizeTransaction(transaction, "pending"))
  ];
}

export function normalizeTransaction(raw, status) {
  const amount = parseAmount(raw?.transactionAmount?.amount);
  const currency = normalizeCurrency(raw?.transactionAmount?.currency);
  if (amount === null || !currency || !["booked", "pending"].includes(status)) return [];

  const providerId = cleanText(raw?.transactionId, 300);
  const keyMaterial = providerId
    ? `id:${providerId}`
    : `fallback:${stableStringify({ status, raw })}`;

  return [{
    provider_transaction_key_material: keyMaterial,
    provider_transaction_id: providerId,
    status,
    booking_date: normalizeDate(raw?.bookingDate || raw?.bookingDateTime),
    value_date: normalizeDate(raw?.valueDate || raw?.valueDateTime),
    amount,
    currency,
    counterparty_name: cleanText(
      raw?.creditorName || raw?.debtorName || raw?.ultimateCreditor || raw?.ultimateDebtor,
      300
    ),
    merchant_name: cleanText(raw?.merchantName, 300),
    description: transactionDescription(raw),
    raw_data: isPlainObject(raw) ? raw : {}
  }];
}

export async function finalizeTransactionKeys(account) {
  const transactions = [];
  for (const transaction of account.transactions || []) {
    const material = transaction.provider_transaction_key_material;
    const provider_transaction_key = material.startsWith("id:")
      ? material
      : `sha256:${await sha256Hex(material)}`;
    const { provider_transaction_key_material: _material, ...rest } = transaction;
    transactions.push({ provider_transaction_key, ...rest });
  }
  return { ...account, transactions };
}

export function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (isPlainObject(value)) {
    const entries = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function firstBalanceCurrency(payload) {
  const balance = Array.isArray(payload?.balances) ? payload.balances[0] : null;
  return balance?.balanceAmount?.currency || null;
}

function transactionDescription(raw) {
  const remittance = raw?.remittanceInformationUnstructured;
  if (Array.isArray(remittance)) {
    const joined = remittance.map((item) => String(item || "").trim()).filter(Boolean).join(" · ");
    if (joined) return cleanText(joined, 1000);
  }

  return cleanText(
    remittance
      || raw?.remittanceInformationUnstructuredArray?.join?.(" · ")
      || raw?.additionalInformation
      || raw?.merchantName
      || raw?.creditorName
      || raw?.debtorName,
    1000
  );
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

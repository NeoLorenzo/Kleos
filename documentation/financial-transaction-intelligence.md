# Financial Transaction Intelligence

Kleos separates canonical Open Banking evidence from derived financial interpretation.

`financial_transactions` remains the normalized factual bank feed. Transaction flow/category/recurrence judgments live in `financial_transaction_classifications`, which records the deterministic classifier name/version, confidence, and a machine-readable reason for each interpretation.

## Canonical transaction context

Useful bank context is promoted out of opaque provider JSON into explicit canonical fields while `raw_data` remains intact for auditability.

`financial_transactions` stores, when supplied:

- ordered `remittance_information` strings;
- `transaction_note`;
- structured `bank_transaction_code` / subcode / description;
- provider reference number.

For Enable Banking/Revolut, remittance strings often contain the human-entered payment purpose or message that is not visible in the merchant/counterparty label. The Financial UI therefore treats merchant/counterparty as the primary label and shows distinct remittance/note text as secondary bank-provided context. Boilerplate such as `From <name>` / `To <name>` and text equivalent to the primary label is suppressed from display.

These fields remain factual provider evidence. A note does not become an economic classification simply because it contains natural-language text.

## Why the derived layer exists

A signed bank transaction is not automatically economic income or spending. Revolut history includes:

- card purchases;
- card refunds;
- person-to-person/account transfers;
- account top-ups;
- internal currency exchanges;
- ATM cash withdrawals;
- bank/plan fees;
- zero-value authorization/verification records.

Counting every debit as spending and every credit as income would materially distort cash flow. In particular, an EUR -> GBP exchange produces a debit in one currency and a credit in another but no economic income or consumption.

## Baseline classifier

Classifier: `kleos_deterministic_rules`

Baseline version: `1.0.0`; remittance/context enrichment: `1.1.0`.

Provider transaction codes are the highest-confidence signal:

- `EXCHANGE` -> `transfer` / `currency_exchange`, internal transfer + FX;
- `TRANSFER` -> `transfer`;
- `TOPUP` -> `transfer` / `account_topup`;
- `ATM` -> `transfer` / `cash_withdrawal`;
- `FEE` or `CHARGE` -> `fee` / `bank_fees`;
- `CARD_REFUND` -> `refund`;
- negative `CARD_PAYMENT` / `REV_PAYMENT` -> `expense`;
- zero-value records -> `zero_value` regardless of provider code;
- unrecognized provider codes remain `unknown` unless they explicitly indicate salary/income, interest, investment, or tax activity.

Card spending/refunds receive a deterministic merchant category using normalized merchant/counterparty text. Current categories include food & dining, groceries, transport, travel, subscriptions/software, entertainment, fitness/health, education, telecom/utilities, household, housing, shopping, bank fees, transfers, cash withdrawal, currency exchange, and `other`.

Version 1.1.0 may use bank-provided remittance/note context to improve an otherwise generic category or attach a purpose subcategory such as `rent` to a transfer. It does **not** promote a generic positive transfer to income merely because a note exists; structured provider flow evidence remains authoritative.

`other` is intentionally different from `unknown`: the economic flow is known to be spending, but the merchant/context is not specific enough for a narrower category.

## Recurrence detection

Recurring charges are derived, not bank-provided facts.

A transaction group can be marked recurring when either:

1. a recognized subscription/service merchant appears in at least three distinct months; or
2. at least three repeated charges have an average cadence of 25-36 days and amount coefficient of variation <=20%; or
3. at least two repeated charges have annual cadence of roughly 330-400 days with stable amounts.

The classification stores detected occurrence count and average interval. The recurring-expense view also marks whether a series is still recent enough to be treated as active.

## Cash-flow semantics

All analytics are currency-native. EUR, GBP, USD, SGD, and future currencies are never silently combined or converted.

Monthly and rolling cash-flow views report separately:

- income (income + interest inflows);
- refunds;
- gross spending (expenses + fees + taxes);
- investment net flow;
- net economic cash flow;
- transfer inflow/outflow;
- unknown transaction count.

Transfers, FX conversions, ATM cash movements, and zero-value records are excluded from economic income/spending. Refunds affect net cash flow but are not labeled as income.

## Preferred connection rule

A successful reconnect can import the same historical bank ledger under new provider account identifiers. Analytics therefore use `financial_preferred_bank_connection` and only count the most recently synced usable connection for each provider.

A newer pending/abandoned reconnect does not mask the last-known-good synchronized connection, and two successful connections from the same provider do not cause the same history to be counted twice.

## Refresh behavior

`refresh_financial_transaction_classifications(user_id, connection_id)` produces the baseline deterministic interpretation and recurrence state. `enhance_financial_transaction_classifications(user_id, connection_id)` then applies conservative remittance/context enrichment and records classifier version `1.1.0`.

A database trigger runs both stages after a successful bank sync when `last_synced_at` changes. The trigger catches classifier errors deliberately: transaction intelligence is derived data and must never roll back or destroy a successful canonical Open Banking synchronization.

Deployment migration `20260912_0019_transaction_intelligence.sql` backfills baseline classifications. Migration `20260912_0023_transaction_remittance_metadata.sql` promotes existing remittance/code fields from raw evidence and backfills contextual enrichment without requiring a bank reauthorization or resync.

## Derived relations

The primary derived relations are:

- `financial_transaction_classifications`
- `financial_cash_flow_monthly`
- `financial_spending_by_category`
- `financial_cash_flow_rolling`
- `financial_top_merchants`
- `financial_recurring_expenses`
- `financial_classification_coverage`

The monthly cash-flow, category, recurring-expense, and classification-coverage views are registered as canonical Kleos Bot financial evidence. Raw provider payloads and free-form remittance messages are not added to those aggregate evidence relations.

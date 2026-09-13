# Financial transaction corrections

Issue #73 adds a user-confirmed interpretation layer above canonical Open Banking transaction evidence.

## Evidence boundary

`financial_transactions` remains the canonical bank record. User corrections never rewrite provider amounts, currencies, dates, counterparties, remittance text, transaction codes, or other bank facts.

`financial_transaction_classifications` remains the effective derived interpretation consumed by Financial analytics. It now also stores a deterministic baseline (`base_*`) plus provenance for the effective interpretation. The deterministic classifier can refresh normally after a Revolut sync; a database trigger then reapplies any current user rule or transaction override.

Precedence is:

1. canonical bank facts remain immutable evidence;
2. deterministic classifier produces the baseline interpretation;
3. an exact user-confirmed counterparty rule may replace derived fields;
4. a transaction-specific user override has final precedence.

## User-confirmed inflow meaning

Positive credits may be explicitly tagged as one of:

- `earned_income`
- `business_income`
- `investment_income`
- `trust_distribution`
- `family_support`
- `internal_transfer`
- `sale_proceeds`
- `refund_reimbursement`
- `other_inflow`

Generic positive transfers are **not** promoted to income automatically. The semantic must be affirmed by the user.

The semantic deliberately preserves financial-independence meaning. Earned/business income and investment income are independent inflows; a trust distribution is a draw/distribution of owned capital; family support is external support; internal transfers remain transfers; sale proceeds are asset-sale inflows; refunds remain refunds.

## Reusable rules

A reusable rule matches only:

- the deterministic normalized label;
- the same currency; and
- the same amount direction (`credit`, `debit`, or `zero`).

There is no fuzzy matching. This keeps historical/future application conservative and inspectable.

`financial_counterparty_rules` stores reusable rules. `financial_transaction_overrides` stores one-off transaction corrections. Both are provenance records; browser writes occur only through the authorized correction RPCs.

## Analytics

Because the effective fields continue to live in `financial_transaction_classifications`, existing Financial analytics automatically consume corrections:

- monthly and rolling cash flow;
- spending by category;
- recurring expenses;
- top merchants;
- classification coverage;
- the existing Recent Transactions table.

For example, a user-confirmed `earned_income` credit becomes economic income, while `family_support`, `trust_distribution`, and `internal_transfer` remain transfer-type inflows and therefore do not inflate income KPIs.

## Kleos Bot evidence

`financial_inflow_source_summary` is a compact 365-day evidence relation registered with the Kleos evidence registry. It contains only user-confirmed positive-inflow semantics aggregated by currency and semantic class. It does not expose raw transaction text.

This gives the Financial evaluator affirmative evidence distinguishing independent earned/investment inflows, owned-capital distributions, external support, internal transfers, sale proceeds, and refunds.

## UI

The Financial page includes a Review Transactions section. It can filter recent credits, transactions needing review, and already user-confirmed interpretations. The correction editor can update flow/category/subcategory/display label, assign inflow meaning, flag internal transfers, and optionally apply the correction to exact matching historical and future transactions.

The UI visibly labels interpretation provenance as Automatic, Rule, or User confirmed.

# Financial Balance Sheet

Kleos Financial combines two different evidence sources without collapsing their provenance:

- synchronized Open Banking cash balances; and
- manually maintained assets and liabilities.

All balance-sheet calculations remain currency-native. Kleos does not silently convert EUR, GBP, USD, SGD, or any future currency into a single total.

## Canonical records

### Asset identity

`financial_assets` stores relatively stable facts about an asset: name, category, currency, ownership percentage, control level, liquidity class, source, and lifecycle dates.

The active state is derived from `ended_on`. Archiving an asset does not delete its historical valuations.

Supported categories include cash/bank assets, brokerage investments, trust or beneficial interests, property, private-company interests, crypto, vehicles, tangible valuables, receivables, and other assets.

### Asset valuations

`financial_asset_valuations` is append-only. A new valuation is added rather than overwriting a previous valuation.

Each observation records value, currency, valuation date, method, source, and confidence. The current asset view chooses the latest dated observation and applies `ownership_pct` to produce ownership-adjusted value.

### Liability identity and balances

`financial_liabilities` stores liability identities and lifecycle dates. `financial_liability_balances` stores append-only dated outstanding balances.

An empty liability table is **not** interpreted as proof of zero debt.

### No-known-liabilities attestation

`financial_liability_attestations` stores dated affirmative statements that no known personal liabilities exist as of a particular date.

The attestation is append-only and can be reconfirmed on a later date. Historical attestations remain evidence of what was known at that time; they are not replaced by later confirmations.

## Derived relations

`financial_current_assets`
: Active manual assets with the latest valuation and ownership-adjusted value.

`financial_current_liabilities`
: Active liabilities with the latest outstanding-balance observation.

`financial_balance_sheet_current`
: Current assets, liabilities, net worth, liquid assets, and liquid net worth by currency. Preferred-connection bank balances are included as bank-synced cash. Manual Revolut duplicates should therefore not be entered.

`financial_asset_allocation_current`
: Currency-native asset allocation by category with `manual` and `bank_synced` provenance kept separate.

`financial_liability_status`
: Compact evidence distinguishing an empty liability dataset from an affirmative dated no-known-liabilities statement.

`financial_net_worth_history`
: Manual valuation/balance history. It carries forward only observations that existed by each event date and uses asset/liability lifecycle dates. `observation_complete` states whether all in-scope identities had an observation by that date. Synced bank balances are intentionally excluded from this historical view until a broader historical cash model is designed.

## Liquidity semantics

Only assets classified as `immediate` or `within_30_days` count toward manual liquid assets. Synchronized bank cash is treated as liquid.

`liquid_net_worth` is conservative: it subtracts all recorded liabilities from liquid assets rather than assuming that long-dated debt can be ignored.

## Kleos Bot evidence

Only compact derived relations are registered as evaluation evidence:

- `financial_balance_sheet_current`
- `financial_asset_allocation_current`
- `financial_liability_status`

Raw notes and append-only maintenance records are not exposed to the evaluator. This adds affirmative evidence relevant to balance-sheet security, liquidity/resilience, capital allocation, and financial systems/risk while preserving the distinction between missing evidence and a weak financial state.

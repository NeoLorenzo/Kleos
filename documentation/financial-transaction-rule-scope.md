# Financial transaction rule scope

Reusable transaction corrections are intentionally narrow.

Rules match on normalized label, currency, and debit/credit direction. They may additionally require an exact absolute amount. Exact-amount rules take precedence over broader rules for the same label/currency/direction.

For user-confirmed inflow semantics, the server derives the allowed flow type from the semantic. Examples:

- `earned_income` -> `income`
- `business_income` -> `income`
- `investment_income` -> `income`
- `family_support` -> `transfer`
- `trust_distribution` -> `transfer`
- `internal_transfer` -> `transfer`
- `sale_proceeds` -> `transfer`
- `refund_reimbursement` -> `refund`

This prevents external support or owned-capital movements from being counted as independent earned income merely because a client submits an inconsistent flow value.

Canonical Open Banking rows in `financial_transactions` remain unchanged. Only the derived interpretation layer is affected.

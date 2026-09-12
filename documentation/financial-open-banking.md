# Financial Open Banking

Kleos synchronizes Lorenzo's personal Revolut banking evidence through the read-only GoCardless Bank Account Data API (PSD2/Open Banking).

This is an account-information integration. It does **not** use Revolut credentials, initiate payments, place trades, or expose a write-capable banking API.

## Architecture

```text
Kleos /financial (authenticated browser)
        |
        | Supabase JWT
        v
sync-financial-bank Edge Function
        |
        | server-side GoCardless credentials
        v
GoCardless Bank Account Data
        |
        | PSD2 consent
        v
Revolut
```

Kleos is statically exported to GitHub Pages, so all provider credentials and provider API calls live in the Supabase Edge Function. The browser receives only an authorization URL and reads normalized financial evidence through existing Supabase Auth + RLS.

## Required Edge Function secrets

Configure these in the shared Kleos/Ariadne Supabase project before using the connection flow:

- `GOCARDLESS_SECRET_ID`
- `GOCARDLESS_SECRET_KEY`

Do not put either value in `.env.example`, GitHub Actions, frontend code, GitHub Pages settings, database rows, or documentation.

The Edge Function also uses Supabase-provided runtime values:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

The service role remains server-side inside the Edge Function.

## Connect flow

1. Open `/financial/` while authenticated as the authorized Kleos account.
2. Select **Connect Revolut**.
3. The browser invokes `sync-financial-bank` with `action=connect`, country `PT`, and the current Financial-page callback URL.
4. The Edge Function authenticates the Supabase caller.
5. It obtains a short-lived GoCardless access token from the server-side secrets.
6. It discovers the available Revolut institution for Portugal from GoCardless's institutions endpoint. The implementation intentionally does not hard-code a UK or other country-specific Revolut institution ID.
7. It creates a GoCardless requisition with a UUID connection reference and persists only the requisition/connection metadata in `financial_bank_connections`.
8. The browser follows the returned hosted authorization URL and the user authorizes read-only account access.
9. GoCardless redirects back to `/financial/?bank_connection=<uuid>`.
10. The page immediately invokes `action=sync` for that owned connection and removes the callback query parameter afterward.

Selecting **Reconnect Revolut** creates a new requisition/connection rather than mutating a historical provider authorization in place.

## Sync semantics

A successful sync retrieves every account currently returned by the requisition and attempts to retrieve:

- provider account metadata;
- account details;
- balances;
- booked transactions;
- pending transactions.

Account details are optional when the provider reports that resource as unavailable, but account metadata, balances, and transactions are required for a successful snapshot.

The complete upstream payload is normalized in memory first. Kleos then calls `persist_financial_bank_sync(...)`, which updates the synchronized snapshot atomically. If an upstream request or persistence operation fails, the last successful financial evidence remains intact and the connection records an error code/time.

Pending transactions are replaced on each complete successful sync because pending provider records are transient. Booked transactions are upserted idempotently. Provider transaction IDs are used when available; transactions without an ID receive a deterministic SHA-256 fallback identity derived from the provider payload.

## Persistence

Kleos owns:

- `financial_bank_connections` — provider/requisition status and synchronization metadata;
- `financial_accounts` — normalized current accounts;
- `financial_account_balances` — append-only balance observations;
- `financial_transactions` — normalized booked/pending transactions plus raw provider evidence for auditability.

Ordinary authenticated clients have read-only access to their own rows. Synchronization writes are backend-only through the service role and `persist_financial_bank_sync(...)`.

Full IBAN/BBAN values are not persisted. The normalized account table stores at most a masked identifier containing the final four characters.

Currencies are stored explicitly on balances and transactions. Kleos does not silently convert or sum different currencies.

## Kleos Bot evidence

The migration registers these canonical Financial evidence relations:

- `financial_accounts`
- `financial_current_balances`
- `financial_recent_transactions`

`financial_current_balances` exposes only the latest observation for each account/balance-type/currency combination. `financial_recent_transactions` exposes normalized transaction fields from the most recent 90 days and deliberately excludes `raw_data`.

## Deployment

Apply `supabase/migrations/20260912_0017_financial_open_banking.sql` to the shared Supabase project, configure the two GoCardless secrets, then deploy the `sync-financial-bank` Edge Function with JWT verification enabled.

The static Kleos frontend requires no provider secret or server runtime.

## Reauthorization

Open Banking consent can expire or be revoked. A failed/expired provider authorization never deletes existing evidence. The Financial page surfaces the connection/provider state and offers **Reconnect Revolut** to create a fresh requisition.

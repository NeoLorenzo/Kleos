# Financial Open Banking

Kleos synchronizes Lorenzo's personal Revolut banking evidence through Enable Banking using read-only Open Banking account-information access.

This integration does **not** use Revolut credentials, initiate payments, place trades, or expose a write-capable banking API.

## Architecture

```text
Kleos /financial (authenticated browser)
        |
        | Supabase JWT
        v
sync-financial-bank Edge Function
        |
        | server-side Enable Banking app ID + RSA private key
        v
Enable Banking API
        |
        | Open Banking consent
        v
Revolut
```

Kleos is statically exported to GitHub Pages. The Enable Banking private key and all provider API calls remain inside the Supabase Edge Function. The browser receives only provider authorization URLs and reads normalized financial evidence through Supabase Auth and RLS.

## Enable Banking production application registration

Register a **Production** application in the Enable Banking Control Panel using browser-generated key material.

Use these production URLs:

- Application name: `Kleos`
- Allowed redirect URL: `https://neolorenzo.github.io/Kleos/financial/`
- Privacy URL: `https://neolorenzo.github.io/Kleos/privacy/`
- Terms URL: `https://neolorenzo.github.io/Kleos/terms/`

Suggested description:

> Private personal finance dashboard for the account owner. Uses read-only account information access to synchronize balances and transactions from the owner's linked bank accounts into Kleos. Not available to third parties.

The browser-generated private RSA key is downloaded locally when the application is registered. Treat that PEM file as a secret. The file is not committed to this repository.

For restricted personal use, activate the production application through Enable Banking's **Activate by linking accounts** flow and link every Revolut account that Kleos should be able to retrieve. Restricted applications can only return accounts that were explicitly linked/whitelisted.

## Required Edge Function secrets

Configure these in the shared Kleos/Ariadne Supabase project:

- `ENABLE_BANKING_APP_ID` — the UUID assigned to the Enable Banking application;
- `ENABLE_BANKING_PRIVATE_KEY` — the complete browser-generated PEM private key.

Do not put either value in `.env.example`, GitHub Actions, frontend code, GitHub Pages settings, database rows, issues, or documentation.

The Edge Function also uses Supabase-provided runtime values:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Provider authentication

Every Enable Banking API request is authenticated with a short-lived RS256 JWT generated server-side. The JWT contains:

- header `typ=JWT`;
- header `alg=RS256`;
- header `kid=<ENABLE_BANKING_APP_ID>`;
- issuer `enablebanking.com`;
- audience `api.enablebanking.com`;
- short `iat`/`exp` lifetime.

The RSA private key never reaches the browser.

## Connect flow

1. Open `/financial/` while authenticated as the authorized Kleos account.
2. Select **Connect Revolut**.
3. The browser invokes `sync-financial-bank` with `action=connect`, country `PT`, and the current Financial-page callback URL.
4. The Edge Function authenticates the Supabase caller and signs an Enable Banking JWT.
5. It calls `GET /aspsps?country=PT&psu_type=personal&service=AIS` and selects the Revolut ASPSP returned by Enable Banking rather than hard-coding a bank identifier.
6. It creates a random Kleos connection/state UUID and calls `POST /auth`, requesting balances and transactions with a consent expiry no longer than the provider-reported maximum consent validity.
7. Kleos persists the pending authorization metadata in `financial_bank_connections` and returns the provider authorization URL.
8. The browser follows that URL and the owner completes the Revolut authorization flow.
9. Enable Banking redirects to `/financial/?code=<code>&state=<connection-uuid>` or returns OAuth-style error parameters.
10. Kleos validates the state against the authenticated owner's pending connection, then sends the callback code to `POST /sessions`.
11. The returned Enable Banking `session_id` is stored server-side with the connection and the authorized accounts are synchronized.

Selecting **Reconnect Revolut** starts a new authorization rather than rewriting historical provider authorization metadata.

## Sync semantics

On initial authorization and later manual syncs, Kleos retrieves:

- session/account identifiers;
- account details;
- account balances;
- all transaction pages returned by the account transactions endpoint.

Enable Banking `entry_reference` is used as the preferred stable transaction identity. When it is unavailable, Kleos creates a deterministic SHA-256 fallback identity from normalized transaction characteristics. Debit transactions are stored with negative amounts and credits with positive amounts.

Provider statuses are normalized to Kleos's `booked` or `pending` model. Cancelled and rejected provider transactions are not persisted as active financial evidence.

The complete upstream snapshot is normalized in memory before `persist_financial_bank_sync(...)` updates the current financial evidence. If provider retrieval or persistence fails, the previously successful evidence remains intact and the connection records an error code/time.

Pending transactions are replaced on each successful complete sync because they are transient. Booked transactions are upserted idempotently.

## Privacy handling

Kleos does not persist full account IBAN/BBAN values. The normalized account record stores only a masked final-four representation.

Transaction `raw_data` is reduced before persistence. Counterparty names and transaction metadata useful for auditability may be retained, while creditor/debtor account identifiers, additional account identifiers, and postal-address structures are deliberately omitted from the stored raw payload.

Currencies are stored explicitly on balances and transactions. Kleos does not silently convert or sum different currencies.

## Persistence

Kleos owns:

- `financial_bank_connections` — provider authorization/session and synchronization metadata;
- `financial_accounts` — normalized current accounts;
- `financial_account_balances` — append-only balance observations;
- `financial_transactions` — normalized booked/pending transactions plus privacy-reduced provider evidence.

Ordinary authenticated clients have read-only access to their own synchronized financial rows. Provider synchronization writes remain backend-only through the service role and `persist_financial_bank_sync(...)`.

## Kleos Bot evidence

The canonical Financial evidence relations remain:

- `financial_accounts`
- `financial_current_balances`
- `financial_recent_transactions`

`financial_current_balances` exposes only the latest observation for each account/balance-type/currency combination. `financial_recent_transactions` exposes normalized transaction fields from the most recent 90 days and deliberately excludes `raw_data`.

## Deployment

Apply the financial migrations in order, including `20260912_0018_enable_banking_provider.sql`, configure the two Enable Banking secrets, then deploy `sync-financial-bank` with JWT verification enabled.

The static Kleos frontend requires no provider private key or server runtime.

## Reauthorization

Open Banking consent can expire or be revoked. A failed or expired provider session does not delete existing evidence. The Financial page surfaces the provider state and offers **Reconnect Revolut** to start a fresh authorization.

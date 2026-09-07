# Kleos Bot Apple Shortcuts evidence transport

Kleos Bot uses Apple Shortcuts as the transport for canonical evidence because the ChatGPT Supabase connector may block returning sensitive personal evidence even when it is wrapped in a privileged SQL RPC.

## Production flow

```text
Apple Shortcut
      ↓
POST /functions/v1/kleos-bot-evidence
      ↓
canonical Kleos evidence JSON
      ↓
Ask ChatGPT with the JSON included in the prompt
      ↓
evaluate exactly eight vectors
      ↓
connected Supabase admin SQL
      ↓
create_kleos_bot_snapshot_admin(...)
```

The Shortcut-facing endpoint is:

`https://jhpsggjphoqyygthqfki.supabase.co/functions/v1/kleos-bot-evidence`

## Request contract

Use an HTTP `POST` request.

Send the dedicated Kleos Bot token in this header:

`x-kleos-bot-token: <dedicated Shortcut token>`

No request body is required.

The token is not a Supabase API key and must never be replaced with a publishable, secret, anon, or service-role key.

The plaintext token is intentionally not committed to the repository. The Edge Function contains only its SHA-256 hash. To rotate the token, generate a new high-entropy token, replace the committed hash, redeploy the function, and update the Shortcut header value.

## Response contract

A successful request returns a JSON object containing exactly these canonical evidence groups:

- `goat_strength_lifts`
- `goat_strength_profile`
- `goat_cognitive_tests`
- `goat_academic_stage_results`
- `goat_academic_module_results`
- `goat_academic_notes`
- `goat_health_characteristics`
- `goat_cv_characteristics`
- `goat_immutable_characteristics`
- `goat_misc_characteristics`

The underlying database evidence RPC strips `user_id` and excludes existing vector snapshots, snapshot results, and legacy `goat_score_entries`.

Evidence responses use `Cache-Control: no-store` and `Pragma: no-cache`.

## Failure behavior

- missing or invalid token → `401` with a generic `UNAUTHORIZED` error
- unsupported HTTP method → `405`
- missing server configuration → `500`
- database/evidence retrieval failure → generic `500`

Errors must not include owner identifiers, database credentials, raw SQL, or personal evidence.

## Apple Shortcuts setup

1. Add **Get Contents of URL** before the ChatGPT action.
2. Set the URL to the production endpoint above.
3. Set Method to `POST`.
4. Add request header `x-kleos-bot-token` with the dedicated Kleos Bot token.
5. Use the returned JSON as a variable in the subsequent ChatGPT prompt.
6. The ChatGPT prompt must treat that JSON as the complete canonical evidence payload for the current invocation and must not use the Supabase connector for evidence retrieval.
7. ChatGPT may still use the connected Supabase administrative SQL interface for final persistence through `create_kleos_bot_snapshot_admin(...)`.

Do not place Supabase database URLs, secret keys, service-role keys, owner UUIDs, or authentication JWTs in the Shortcut.

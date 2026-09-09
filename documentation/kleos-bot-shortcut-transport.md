# Kleos Bot Apple Shortcuts evidence transport

Kleos Bot uses Apple Shortcuts as the transport for canonical evidence because the ChatGPT Supabase connector may block returning sensitive personal evidence even when it is wrapped in a privileged SQL RPC.

## Production flow

```text
Apple Shortcut
      ↓
POST /functions/v1/kleos-bot-evidence
      ↓
versioned canonical evidence JSON
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

A successful request returns a versioned wrapper:

```json
{
  "evidence_schema_version": "2.0.0",
  "evidence_groups": {
    "goat_big_five_assessments": [],
    "goat_cognitive_tests": [],
    "...": []
  }
}
```

`evidence_groups` is dynamic. Its membership is defined by the enabled rows in the server-side `kleos_evidence_sources` registry, which is the authoritative whitelist of canonical raw evidence sources.

The current registry includes Big Five assessments alongside the other canonical sources. Consumers must not hard-code the current number of groups or assume a permanent list of group names. Every group returned under `evidence_groups` must be passed through to the ChatGPT evaluation so future registered canonical sources are not silently discarded.

The registry boundary is explicit: a database table is not exposed merely because its name follows a `goat_*` naming convention. Existing vector snapshots, snapshot results, and legacy `goat_score_entries` are not canonical raw evidence and are not included.

The underlying database evidence RPC strips `user_id` from returned records.

The evidence schema version is independent from the Kleos Bot scoring methodology version. A registry membership change does not require a methodology-version bump unless evaluation/scoring semantics also change.

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
5. Use the complete returned JSON object as a variable in the subsequent ChatGPT prompt.
6. The ChatGPT prompt must read `evidence_schema_version`, then consume every group supplied under `evidence_groups` without filtering to a predetermined count or list of names.
7. Treat the returned JSON as the complete canonical evidence payload for the current invocation; do not use the Supabase connector for evidence retrieval or previous snapshots/memory as fallback evidence.
8. ChatGPT may still use the connected Supabase administrative SQL interface for final persistence through `create_kleos_bot_snapshot_admin(...)`.

Do not place Supabase database URLs, secret keys, service-role keys, owner UUIDs, or authentication JWTs in the Shortcut.

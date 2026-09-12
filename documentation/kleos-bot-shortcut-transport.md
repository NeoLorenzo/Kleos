# Kleos Bot stateless ChatGPT transport

Kleos Bot runs from Apple Shortcuts using a fresh normal **Ask ChatGPT** action. The Shortcut, not ChatGPT, owns database transport.

This matters because connected plugin/app availability varies by ChatGPT product surface. A Shortcut-launched Ask ChatGPT run must therefore not depend on the Supabase plugin being available.

## Production flow

```text
Apple Shortcut
      ↓
POST kleos-bot-api { operation: "context" }
      ↓
authenticated server-side PostgreSQL
      ↓
public.get_kleos_evaluation_context()
      ↓
compact canonical Methodology 2.0 + canonical evidence
      ↓
Ask ChatGPT with context embedded in the prompt
      ↓
model assesses every fixed methodology subdomain and returns strict JSON only
      ↓
Apple Shortcut parses JSON
      ↓
POST kleos-bot-api {
  operation: "persist",
  execution_key,
  vectors
}
      ↓
public.persist_kleos_evaluation(...)
      ↓
server validates anchors/coverage, applies fixed weights/caps,
calculates vector scores/confidence and persists immutable snapshot
```

ChatGPT performs no Supabase tool call and has no database credential. The Shortcut transports only the canonical context and the model's structured judgments.

## Authenticated transport endpoint

Endpoint:

```text
https://jhpsggjphoqyygthqfki.supabase.co/functions/v1/kleos-bot-api
```

Method: `POST`

Header:

```text
x-kleos-bot-token: <dedicated Shortcut token>
Content-Type: application/json
```

The endpoint deliberately reuses the existing dedicated Kleos Bot Shortcut credential. The repository and Edge Function contain only its SHA-256 hash, not the plaintext token.

The Edge Function has JWT verification disabled because it implements its own constant-time token authentication. Supabase database credentials remain server-side.

Responses are `no-store` and never expose owner UUIDs or database credentials.

## Step 1 — retrieve context

Request body:

```json
{
  "operation": "context"
}
```

Response shape:

```json
{
  "context": {
    "methodology": {},
    "evidence": {}
  }
}
```

The Edge Function calls `public.get_kleos_evaluation_context()` using the server-side database connection.

For Methodology `2.0.0`, the HTTP representation removes repeated per-subdomain copies of the same seven anchor descriptions and returns those anchor meanings once at `context.methodology.anchors`. Vector definitions, subdomain definitions, fixed weights, aggregation rules, evidence rules and the canonical evidence package remain intact. This is a transport compaction only; the canonical database methodology is unchanged.

If a future methodology version is not recognized by the compactor, the endpoint returns its full canonical methodology rather than applying stale compaction semantics.

## Step 2 — Ask ChatGPT

The canonical evaluator prompt lives in:

`documentation/kleos-bot-shortcuts-prompt.md`

Insert the `context` object returned by step 1 at the `{{KLEOS_CONTEXT_JSON}}` placeholder.

The Ask ChatGPT run must not use tools. Its only job is to classify each methodology subdomain and return strict JSON:

```json
{
  "execution_key": "550e8400-e29b-41d4-a716-446655440000",
  "vectors": [
    {
      "vector_id": "physical",
      "commentary": "...",
      "subdomains": []
    }
  ]
}
```

The real response contains exactly eight vectors and every methodology subdomain. Assessed subdomain scores must be one of the fixed canonical anchors (`0`, `25`, `50`, `70`, `85`, `95`, `100` in Methodology 2.0). Missing evidence is represented as `unknown`, not zero.

The model does not return final vector scores, vector confidence, methodology version, weights, user ID or overall score.

## Step 3 — persist

Parse the model's JSON and send:

```json
{
  "operation": "persist",
  "execution_key": "<execution_key from model output>",
  "vectors": "<vectors from model output>"
}
```

`vectors` must be the JSON array itself, not a quoted JSON string.

The Edge Function validates basic transport shape and calls:

```sql
public.persist_kleos_evaluation(execution_key, vectors)
```

The database remains authoritative for:

1. current methodology version;
2. exact vector/subdomain membership;
3. allowed fixed-anchor scores;
4. subdomain persistence;
5. fixed weights;
6. assessed-weight coverage;
7. weighted raw scores;
8. coverage score caps;
9. deterministic vector confidence;
10. final immutable vector results;
11. execution-key idempotency.

The endpoint returns the database `persistence_result`, including the newly created/idempotently reused snapshot and deterministic vector results.

## Apple Shortcut action sequence

The Shortcut should contain the following logical actions:

1. **Get Contents of URL**
   - URL: `https://jhpsggjphoqyygthqfki.supabase.co/functions/v1/kleos-bot-api`
   - Method: `POST`
   - Headers: `x-kleos-bot-token` and `Content-Type: application/json`
   - JSON body: `{ "operation": "context" }`
2. Extract the returned `context` dictionary and serialize it as JSON/text for prompt insertion.
3. **Text** — canonical evaluator prompt with that context appended at `{{KLEOS_CONTEXT_JSON}}`.
4. **Ask ChatGPT** using the Text action as input.
5. Parse the Ask ChatGPT response as a dictionary/JSON object.
6. Extract `execution_key` and `vectors`.
7. **Get Contents of URL** to the same endpoint.
   - Method: `POST`
   - same authentication headers
   - JSON body containing `operation=persist`, `execution_key`, and `vectors`.
8. Display or otherwise consume the returned `persistence_result`.

If persistence is retried within the same Shortcut invocation, reuse the same `execution_key` and model output. Do not re-run the evaluation merely because the HTTP persistence request needs a retry.

## Failure semantics

If context retrieval fails, do not run the model.

If the model response is not valid JSON or is missing `execution_key`/`vectors`, do not call persistence.

If persistence rejects the evaluation, leave the last valid snapshot untouched. Do not invent alternate evidence, change subdomain scores automatically, or bypass the canonical writer.

## Historical comparability

Existing 1.x snapshots remain immutable. They were produced using holistic model-calibrated vector scoring and are not directly comparable with Methodology 2.0 snapshots.

The Vector State UI displays methodology version for historical snapshots and treats `2.0.0` as a new longitudinal baseline.

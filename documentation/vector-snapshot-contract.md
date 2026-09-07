# Kleos vector snapshot contract

This contract is the interoperability boundary introduced by Kleos issue #4.

Kleos owns **current-state assessment**. Ariadne owns **desired movement**. Both use the same eight stable vector identifiers:

- `physical`
- `psychological`
- `intellectual`
- `professional`
- `financial`
- `relational`
- `creative`
- `experiential`

The physical Supabase project remains shared with Ariadne, but the tables and write contract below are logically owned by Kleos.

## Snapshot model

`public.kleos_vector_snapshots` contains immutable dated assessments:

- `id`
- `user_id`
- `evaluated_at`
- `evaluator`
- `methodology_version`
- optional `overall_score`
- `created_at`

`public.kleos_vector_snapshot_results` contains exactly one result for every canonical vector in a snapshot:

- `snapshot_id`
- `vector_id`
- `status`: `assessed` or `unknown`
- nullable `score` from 0–100
- `confidence`: `low`, `medium`, `high`, or `unknown`
- `commentary`

An assessed vector requires a numeric score and `low`/`medium`/`high` confidence. An unknown vector must have `score = null` and `confidence = unknown`. Missing evidence must never be converted to zero.

Snapshots are append-only historical interpretations. Raw `goat_*` measurements remain canonical evidence and are not copied into snapshot tables.

## Authenticated read contract

Owner-authorized clients may read the tables directly using the normal publishable Supabase client and authenticated user session. RLS requires both the row owner and the authorized Google account.

Kleos exposes client helpers:

```js
loadLatestVectorSnapshot(userId)
loadVectorSnapshotHistory(userId, { limit })
```

The latest query orders by `evaluated_at DESC`, then `created_at DESC`. Ariadne #21 should use the same read semantics and must treat unavailable data as non-blocking.

Ariadne may read these records but must not update, delete, recompute, or copy them into Ariadne-owned persistence.

## Trusted write contract

New snapshots are written atomically through the database RPC:

```text
create_kleos_vector_snapshot(
  p_evaluated_at,
  p_evaluator,
  p_methodology_version,
  p_results,
  p_overall_score
)
```

`p_results` must be an array containing all eight distinct canonical vectors. Example:

```json
[
  {
    "vector_id": "physical",
    "status": "assessed",
    "score": 72,
    "confidence": "high",
    "commentary": "Representative physical evidence supports this assessment."
  },
  {
    "vector_id": "psychological",
    "status": "unknown",
    "score": null,
    "confidence": "unknown",
    "commentary": "Insufficient canonical psychological evidence."
  }
]
```

The real payload must include the remaining six canonical vectors as well. The RPC validates authorization and completeness and writes the parent snapshot plus all eight results inside one database transaction. If any result is malformed, no partial snapshot is committed.

Direct `insert`, `update`, and `delete` privileges on the snapshot tables are revoked from ordinary authenticated clients. The RPC is the stable writer surface for Kleos Bot or another trusted authenticated automation.

The repository helper `persistVectorSnapshot(payload)` validates the same application-level contract before invoking the RPC.

## Versioning

Every snapshot records both:

- a stable evaluator identity, expected to be `kleos-bot` for the scheduled evaluator; and
- a methodology version such as `1.0.0`.

A methodology change creates future snapshots with a new version. Historical records are not rewritten.

## UI contract

The minimal `/vector-state/` route reads the latest snapshot and renders:

- all eight vectors;
- numeric assessment or explicit `Unknown` state;
- evaluation timestamp;
- evaluator and methodology version;
- confidence for assessed vectors; and
- commentary in secondary detail.

The full character-sheet redesign remains Kleos #10.

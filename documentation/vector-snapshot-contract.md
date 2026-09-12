# Kleos vector snapshot contract

This contract is the interoperability boundary introduced by Kleos issue #4 and extended by issue #69 for Methodology 2.0.

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
- optional `overall_score` (null for Methodology 2.0)
- `execution_key` for retry-safe Kleos Bot runs
- `created_at`

`public.kleos_vector_snapshot_results` contains exactly one final result for every canonical vector in a snapshot:

- `snapshot_id`
- `vector_id`
- `status`: `assessed` or `unknown`
- nullable final `score` from 0–100
- `confidence`: `low`, `medium`, `high`, or `unknown`
- `commentary`
- optional `coverage_pct`
- optional `raw_score`
- optional `aggregation_details`

An assessed vector requires a numeric score and `low`/`medium`/`high` confidence. An unknown vector must have `score = null` and `confidence = unknown`. Missing evidence must never be converted to zero.

For Methodology 2.0 snapshots, `coverage_pct`, `raw_score`, and `aggregation_details` make the deterministic server-side aggregation auditable. Legacy 1.x snapshots legitimately have null values for those fields.

`public.kleos_vector_snapshot_subdomain_results` stores the immutable model judgments underlying a Methodology 2.0 snapshot:

- `snapshot_id`
- `vector_id`
- `subdomain_id`
- `methodology_version`
- canonical `weight`
- `status`
- nullable `score`
- `confidence`
- `commentary`

The model assesses subdomains. The database calculates final vector scores. The stored weight is copied from the canonical methodology at persistence time rather than accepted from model output.

Snapshots are append-only historical interpretations. Raw measurements and other canonical evidence remain authoritative and are not copied wholesale into snapshot tables.

## Methodology model

The active scoring specification is versioned in:

- `public.kleos_vector_methodologies`
- `public.kleos_vector_methodology_subdomains`

Methodology 2.0 defines five fixed subdomains per vector, fixed weights, explicit score anchors, evidence rules, and deterministic aggregation/coverage rules.

The management-session evaluator retrieves the complete current scoring contract plus canonical evidence through:

```sql
select public.get_kleos_evaluation_context() as context;
```

The evaluator must apply the returned methodology rather than relying on a hard-coded or model-invented scale.

## Authenticated read contract

Owner-authorized clients may read snapshot tables directly using the normal publishable Supabase client and authenticated user session. RLS requires both the row owner and the authorized Google account.

Kleos exposes client helpers:

```js
loadLatestVectorSnapshot(userId)
loadVectorSnapshotHistory(userId, { limit })
```

The latest query orders by `evaluated_at DESC`, then `created_at DESC`.

Ariadne may read these records but must not update, delete, recompute, or copy them into Ariadne-owned persistence. Consumers must retain `methodology_version`; cross-version score differences must not be presented as ordinary longitudinal changes.

## Trusted Methodology 2.0 write contract

The production stateless Kleos Bot writes through:

```sql
select public.persist_kleos_evaluation(
  p_execution_key := '<execution-key>',
  p_vectors := '<complete-eight-vector-subdomain-json-array>'::jsonb
) as persistence_result;
```

`p_vectors` contains exactly eight vector objects. Each vector contains whole-vector commentary and every canonical subdomain defined for that vector. Example shape:

```json
[
  {
    "vector_id": "physical",
    "commentary": "Whole-vector synthesis.",
    "subdomains": [
      {
        "subdomain_id": "clinical_health",
        "status": "assessed",
        "score": 78,
        "confidence": "high",
        "commentary": "Evidence-grounded subdomain assessment."
      },
      {
        "subdomain_id": "cardiorespiratory_activity",
        "status": "unknown",
        "score": null,
        "confidence": "unknown",
        "commentary": "Canonical evidence cannot support a defensible score."
      }
    ]
  }
]
```

The real payload must include every methodology vector and every methodology subdomain exactly once.

The model does **not** provide:

- canonical weights;
- methodology version;
- final vector score;
- vector confidence;
- evidence coverage;
- user ID;
- overall score.

The database resolves those values or calculates them deterministically. The write is atomic: invalid vector/subdomain membership, malformed assessed/unknown states, or other validation failures leave the previous snapshots untouched.

Execution-key idempotency is part of the write contract. Retrying the same logical invocation with the same execution key returns the existing snapshot. A genuinely new evaluation uses a new key and may run at any cadence.

The underlying older writers remain part of migration history and may support legacy/authenticated application paths, but they are not the production Methodology 2.0 stateless evaluator contract.

## Versioning and comparability

Every snapshot records:

- evaluator identity, normally `kleos-bot` for automated runs; and
- methodology version.

Methodology changes that alter vector definitions, subdomains, weights, anchors, missing-evidence handling, aggregation semantics, or other score-affecting rules require a version bump.

Historical records are never rewritten to a new methodology. In particular, 1.x holistic scores are not numerically interchangeable with 2.0.0 deterministic scores.

## UI contract

The `/vector-state/` route renders:

- all eight current vectors;
- numeric assessment or explicit `Unknown` state;
- evaluation timestamp;
- evaluator and methodology version;
- confidence;
- Methodology 2.0 evidence coverage;
- Methodology 2.0 subdomain scores/weights/confidence in secondary detail;
- snapshot history with methodology versions and methodology-boundary labeling.

The UI must not imply that a score change crossing a methodology boundary is necessarily a real change in the user's life state.

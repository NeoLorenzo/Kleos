# Kleos persistence ownership

Kleos intentionally shares the physical Supabase project currently named **Ariadne** (`jhpsggjphoqyygthqfki`).

This directory is the ownership boundary for future Kleos database changes. New migrations that create, alter, or remove Kleos-owned database objects should be authored here rather than in the Ariadne repository.

## Existing canonical raw-evidence objects

The application owns these existing `public` tables, inherited in place from GOAT Lab:

- `goat_score_entries`
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

No data copy was performed during extraction. These remain the canonical production records.

## Derived vector-state objects

Kleos #4 adds append-only derived state through:

- `kleos_vector_snapshots`
- `kleos_vector_snapshot_results`
- `create_kleos_vector_snapshot(...)`

Apply SQL files under `supabase/migrations/` in filename order. The vector snapshot migration is additive and deliberately does not alter any `goat_*` table.

The snapshot tables store historical interpretations, not source evidence. A successful write contains all eight canonical vectors and is committed atomically through the RPC. Ordinary authenticated clients receive read-only access to the tables; they cannot update or delete historical snapshots directly.

The stable consumer/writer shape is documented in [`../documentation/vector-snapshot-contract.md`](../documentation/vector-snapshot-contract.md).

## Security boundary

Row Level Security remains active. Policies require the authenticated user to own the row and require the authorized Google account. Do not weaken or bypass those policies to simplify application development.

Client applications must use only the Supabase publishable/anon client credential. Never put a service-role or secret key in Kleos frontend code or GitHub Pages configuration.

`create_kleos_vector_snapshot(...)` is `SECURITY DEFINER`, so it performs its own explicit authenticated-user and authorized-email check before writing. Its execute permission is granted only to `authenticated`; `anon` and `public` execution are revoked.

## Future namespace cleanup

Moving these objects from `public.goat_*` / `public.kleos_*` into a dedicated `kleos` schema is a valid future cleanup, but is deliberately not part of the current architecture. If performed later it must preserve production data, RLS behavior, and compatibility during rollout.

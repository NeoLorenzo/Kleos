# Kleos persistence ownership

Kleos intentionally shares the physical Supabase project currently named **Ariadne** (`jhpsggjphoqyygthqfki`).

This directory is the ownership boundary for future Kleos database changes. New migrations that create, alter, or remove Kleos-owned database objects should be authored here rather than in the Ariadne repository.

## Existing canonical raw-evidence objects

The application owns these existing `public` tables, inherited in place from GOAT Lab:

- `goat_score_entries`
- `goat_strength_profile`
- `goat_cognitive_tests`
- `goat_academic_stage_results`
- `goat_academic_module_results`
- `goat_academic_notes`
- `goat_health_characteristics`
- `goat_cv_characteristics`
- `goat_immutable_characteristics`
- `goat_misc_characteristics`

`goat_strength_lifts` is retained only as deprecated legacy manual history. It is no longer canonical strength evidence and is not registered as an active Kleos Bot evidence source.

No data copy was performed during extraction. Existing legacy rows remain preserved except for the deprecated manually entered `goat_strength_profile.body_weight_kg`, which is cleared during the Heracles body-weight ownership migration before being repopulated by a successful Heracles sync.

## Heracles strength and body-weight evidence

Canonical strength evidence lives in `heracles_strength_metrics` and is sourced read-only from the separate Heracles Supabase project. Current body weight is also canonical Heracles evidence and is synchronized into `goat_strength_profile`; height remains a Kleos-managed profile field.

Heracles exports one row per exercise when all of the following are true:

- the workout session is completed;
- the session date falls within today plus the preceding 29 calendar dates;
- the set is a non-warm-up analytical working set with reported RIR 0–3;
- the exercise appears in at least 3 distinct qualifying sessions in that window.

For each qualifying exercise, `best_1rm` is the highest positive Heracles `estimated_1rm_high`: the upper of the observed Brzycki and Epley e1RM estimates based on completed reps. It is an estimate, not a measured true 1RM. Dumbbell values remain per dumbbell according to Heracles's canonical weight semantics.

Contract `1.2.0` enriches the exact absolute winning set rather than choosing a separate bodyweight-relative winner. When Heracles can resolve body weight for that workout date, each row also carries:

- `body_weight_kg_at_achieved`;
- `body_weight_kind` (`measured` or `interpolated`);
- `best_1rm_relative_bw`, calculated as `best_1rm / body_weight_kg_at_achieved`.

Heracles does not extrapolate body weight. If the winning workout date falls before the first body-weight observation or after the latest one, those three relative fields are null while the absolute strength metric remains available. For dumbbell exercises the relative value retains the per-dumbbell convention.

The same contract also exposes `current_body_weight`, consisting of the latest actual Heracles daily body-weight representative and its `measured_on` date. It is not extrapolated to the current day. If Heracles has no body-weight observations, the value is null.

`replace_heracles_strength_snapshot(...)` atomically persists both the top-level body-weight snapshot and the complete strength export. Exercises returned by the newest export are `is_current = true`; previously known exercises omitted by a successful export are retained as `is_current = false` rather than deleted. `synced_at` records the latest successful sync in which that exercise was returned, while `last_checked_at` advances on every successful full snapshot. A failed cross-project request does not invoke the replacement RPC, so the last-known snapshot remains intact.

The browser never receives a Heracles privileged credential. It invokes the Kleos `sync-heracles-strength` Edge Function using the authenticated Kleos session. That function forwards the caller token to Heracles. Before using any Heracles service privileges, Heracles forwards the token to the Kleos `verify-heracles-caller` Edge Function, whose Supabase gateway and local Auth lookup verify the Kleos session and authorized account. Only then does Heracles execute its narrow service-only export RPCs.

Authenticated Kleos clients can read `goat_strength_profile`, can insert/update only `user_id`, `height_cm`, and `updated_at` as needed for the user-managed height workflow, and cannot directly insert or update `body_weight_kg` or `body_weight_measured_on`. The service-role-only Heracles snapshot replacement RPC owns those body-weight fields.

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

`replace_heracles_strength_snapshot(...)` is a backend-only `SECURITY INVOKER` RPC. It accepts the already authenticated Kleos owner ID explicitly, is executable only by `service_role`, and relies on that service role's table privileges. Ordinary authenticated clients can read their own `heracles_strength_metrics` rows but cannot call the replacement RPC or write the table directly.

## Future namespace cleanup

Moving these objects from `public.goat_*` / `public.kleos_*` into a dedicated `kleos` schema is a valid future cleanup, but is deliberately not part of the current architecture. If performed later it must preserve production data, RLS behavior, and compatibility during rollout.

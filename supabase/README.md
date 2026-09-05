# Kleos persistence ownership

Kleos intentionally shares the physical Supabase project currently named **Ariadne** (`jhpsggjphoqyygthqfki`).

This directory is the ownership boundary for future Kleos database changes. New migrations that create, alter, or remove Kleos-owned database objects should be authored here rather than in the Ariadne repository.

## Existing canonical objects

The application currently owns these existing `public` tables, inherited in place from GOAT Lab:

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

## Security boundary

Existing Row Level Security remains active. Policies require the authenticated user to own the row and require the authorized Google account. Do not weaken or bypass those policies to simplify application development.

Client applications must use only the Supabase publishable/anon client credential. Never put a service-role or secret key in Kleos frontend code or GitHub Pages configuration.

## Future namespace cleanup

Moving these objects from `public.goat_*` into a dedicated `kleos` schema is a valid future cleanup, but is deliberately not part of the initial extraction. If performed later it must preserve production data, RLS behavior, and compatibility during rollout.

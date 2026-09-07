# Kleos

Kleos is Lorenzo's private personal measurement, benchmarking, and self-knowledge application.

It was extracted from the former **GOAT Lab** surface inside [NeoLorenzo/Ariadne](https://github.com/NeoLorenzo/Ariadne) as part of Ariadne issue #7.

## Product boundary

- **Ariadne** owns desired movement: directions, objectives, goals, projects, tasks, and execution planning.
- **Kleos** owns current state: raw personal evidence, dated derived vector snapshots, benchmarking, and character/profile data.
- **Kleos Bot** owns vector evaluation methodology and writes new derived snapshots through the trusted Kleos contract.
- The applications are separate repositories and deployments.
- They deliberately share the existing Ariadne Supabase project for database and authentication infrastructure.

A separate Supabase project is not required for the current architecture.

## Eight-vector current-state model

Kleos and Ariadne share these stable vector identifiers:

- `physical`
- `psychological`
- `intellectual`
- `professional`
- `financial`
- `relational`
- `creative`
- `experiential`

Kleos stores append-only dated assessments in `kleos_vector_snapshots` and `kleos_vector_snapshot_results`. A vector result is either an assessed 0–100 value with confidence and commentary, or an explicit `unknown` state when evidence is insufficient. Missing evidence is never converted to zero.

The minimal current-state reader is available at `/vector-state/`. The full character-sheet redesign remains a later product issue.

See [`documentation/vector-snapshot-contract.md`](documentation/vector-snapshot-contract.md) for the stable read/write contract used by Kleos Bot and read-only consumers such as Ariadne.

## Current persistence

Kleos owns the existing `public.goat_*` raw-evidence and legacy score tables:

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

It also owns the derived vector-state tables:

- `kleos_vector_snapshots`
- `kleos_vector_snapshot_results`

The raw data was intentionally **not copied or migrated** during application extraction. Kleos reads and writes the same canonical records previously used by Ariadne's `/lab` route. Vector snapshots are derived historical interpretations and do not replace those source records.

Existing Row Level Security remains authoritative. The policies require the authenticated row owner and the authorized Google account. Snapshot tables are read-only to ordinary authenticated clients; trusted writes use the atomic `create_kleos_vector_snapshot` RPC.

Future schema changes that concern Kleos-owned persistence should be authored from this repository even while the physical database remains shared.

## Database migrations

Apply the additive SQL migrations under [`supabase/migrations/`](supabase/migrations/) to the shared Supabase project in filename order. They must not seed, reset, or silently rewrite private data.

## Development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Use the existing Ariadne Supabase project's client configuration:

```env
NEXT_PUBLIC_SUPABASE_URL=https://jhpsggjphoqyygthqfki.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key>
```

The publishable key is safe for client-side use; authorization is enforced by Supabase Auth and RLS.

## Authentication configuration

Kleos uses the same Supabase Auth project and Google provider as Ariadne.

For the deployed GitHub Pages application, these URLs must be included in **Supabase Dashboard → Authentication → URL Configuration → Redirect URLs**:

```text
https://neolorenzo.github.io/Kleos/
https://neolorenzo.github.io/Kleos/vector-state/
```

For local development, add the appropriate localhost URL as well, for example:

```text
http://localhost:3000/**
```

## Deployment

`.github/workflows/deploy-pages.yml` builds and deploys the application as a static Next.js export to GitHub Pages.

The workflow uses the shared Supabase project's public URL and publishable client key. No service-role or secret database credentials belong in this repository.

Expected production URL:

```text
https://neolorenzo.github.io/Kleos/
```

## Legacy measurement capabilities

The application continues to preserve the former GOAT Lab measurement workflows:

- legacy GOAT score entry and history
- cognitive-test tracking with condition ratings
- strength lifts and body metrics
- academic results and notes
- health text / blood-test context
- CV context
- immutable characteristics
- miscellaneous characteristics
- legacy generated LLM evaluation context

The vector architecture does not depend on the legacy browser-generated LLM prompt. That workflow may remain temporarily for compatibility while Kleos Bot (#5) becomes the canonical evaluator.

# Kleos

Kleos is Lorenzo's private personal measurement, benchmarking, and self-knowledge application.

It was extracted from the former **GOAT Lab** surface inside [NeoLorenzo/Ariadne](https://github.com/NeoLorenzo/Ariadne) as part of Ariadne issue #7.

## Product boundary

- **Ariadne** owns direction, objectives, goals, projects, tasks, and execution planning.
- **Kleos** owns personal measurement, benchmarking, character/profile data, and GOAT-score context generation.
- The applications are separate repositories and deployments.
- They deliberately share the existing Ariadne Supabase project for database and authentication infrastructure.

A separate Supabase project is not required for the current architecture.

## Current persistence

Kleos currently owns and directly uses the existing `public.goat_*` tables:

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

The data was intentionally **not copied or migrated** during application extraction. Kleos reads and writes the same canonical records previously used by Ariadne's `/lab` route.

Existing Row Level Security remains authoritative. The current policies require the authenticated row owner and the authorized Google account.

Future schema changes that concern Kleos-owned persistence should be authored from this repository even while the physical database remains shared.

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

For the deployed GitHub Pages application, the following URL must be included in **Supabase Dashboard → Authentication → URL Configuration → Redirect URLs**:

```text
https://neolorenzo.github.io/Kleos/
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

## Extraction status

The current application reproduces the former GOAT Lab capabilities:

- GOAT score entry and history
- cognitive-test tracking with condition ratings
- strength lifts and body metrics
- academic results and notes
- health text / blood-test context
- CV context
- immutable characteristics
- miscellaneous characteristics
- generated LLM evaluation context

Ariadne's old `/lab` implementation should remain available until Kleos has been authenticated against production and representative read/write checks have been completed. Only then should the Lab code be removed from Ariadne.

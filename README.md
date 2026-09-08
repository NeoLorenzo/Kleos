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

Kleos Bot is the canonical evaluator. Execution is schedule-agnostic: each invocation supplies an `executionKey`, applies methodology `1.0.0`, validates all eight vector results, and persists a derived snapshot through the trusted snapshot contract. Retries of the same logical invocation must reuse the same execution key and therefore resolve to the existing snapshot; a genuinely new invocation uses a new execution key and creates an independent snapshot even if it runs shortly after another evaluation.

The primary authenticated Kleos home surface is the character sheet. It renders the latest state across all eight vectors, exposes the evidence behind the assessment, and provides inspectable dated vector trajectories from persisted snapshot history. The `/vector-state/` route remains a secondary minimal current-state reader rather than the canonical home experience.

Kleos Bot's current production evidence flow is:

```text
Apple Shortcut
      ↓
Kleos evidence Edge Function
      ↓
canonical evidence JSON
      ↓
ChatGPT evaluation
      ↓
privileged snapshot persistence
```

The browser application does not need privileged database credentials for this flow. Apple Shortcuts transports canonical evidence to ChatGPT, while trusted persistence remains behind the privileged Kleos snapshot boundary.

See:

- [`documentation/vector-snapshot-contract.md`](documentation/vector-snapshot-contract.md) for the stable snapshot interoperability contract.
- [`documentation/kleos-bot-methodology-v1.md`](documentation/kleos-bot-methodology-v1.md) for the current evaluation methodology.
- [`documentation/kleos-bot-shortcut-transport.md`](documentation/kleos-bot-shortcut-transport.md) for the current Apple Shortcuts evidence transport and privileged persistence flow.

## Current persistence

Kleos owns the existing `public.goat_*` raw-evidence tables used by the application, including:

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

Legacy persistence such as `goat_score_entries` may still exist in the shared database for compatibility/history, but the global GOAT Score product workflow has been removed and is not part of the current Kleos UI or scoring model.

Kleos also owns the derived vector-state tables:

- `kleos_vector_snapshots`
- `kleos_vector_snapshot_results`

The raw data was intentionally **not copied or migrated** during application extraction. Kleos reads and writes the same canonical records previously used by Ariadne's `/lab` route. Raw evidence remains authoritative source material; vector snapshots are derived historical interpretations and do not replace those records.

Existing Row Level Security remains authoritative. The policies require the authenticated row owner and the authorized Google account. Snapshot tables are read-only to ordinary authenticated clients; trusted writes use the atomic snapshot persistence contracts.

Future schema changes that concern Kleos-owned persistence should be authored from this repository even while the physical database remains shared.

## Database migrations

Apply the additive SQL migrations under [`supabase/migrations/`](supabase/migrations/) to the shared Supabase project in filename order. They must not seed, reset, or silently rewrite private data.

The migration history includes the superseded weekly-idempotency implementation followed by the schedule-agnostic execution-key migration. The current runtime contract is defined by the latest migrations, not by the historical weekly migration filename.

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

## Measurement and character-state capabilities

The primary character sheet and the measurement editor have separate roles:

- the character sheet is the canonical current-state surface for eight-vector derived assessments and their history;
- the measurement editor manages raw evidence such as cognitive tests, strength lifts/body metrics, academic results and notes, health context, CV context, immutable characteristics, and miscellaneous characteristics;
- the former global GOAT Score entry/history workflow has been removed;
- raw measurement records remain editable independently of derived vector snapshots.

Kleos Bot evaluations are the source of new derived vector snapshots. The browser measurement editor does not calculate or manually author those vector assessments.

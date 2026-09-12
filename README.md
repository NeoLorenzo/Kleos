# Kleos

Kleos is Lorenzo's private personal measurement, benchmarking, and self-knowledge application.

It was extracted from the former **GOAT Lab** surface inside [NeoLorenzo/Ariadne](https://github.com/NeoLorenzo/Ariadne) as part of Ariadne issue #7.

## Product boundary

- **Ariadne** owns desired movement: directions, objectives, goals, projects, tasks, and execution planning.
- **Kleos** owns current state: raw personal evidence, dated derived vector snapshots, benchmarking, and character/profile data.
- **Kleos Bot** applies the canonical vector methodology to current evidence and writes new derived snapshots through the trusted Kleos contract.
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

Kleos stores append-only dated assessments in `kleos_vector_snapshots` and `kleos_vector_snapshot_results`. Methodology 2.x also stores the model's immutable subdomain judgments in `kleos_vector_snapshot_subdomain_results` so the final vector score is auditable.

A vector result is either an assessed 0–100 value with confidence and commentary, or an explicit `unknown` state when evidence coverage is insufficient. Missing evidence is never converted to zero or treated as a mediocre score by default.

### Methodology 2.0

`2.0.1` is the current canonical methodology. It preserves the fixed measurement model introduced in `2.0.0` while tightening the assessability rules:

- every vector has five explicit subdomains and fixed weights;
- every subdomain has explicit 0/25/50/70/85/95/100 anchors;
- scoring is absolute, not age- or career-stage-relative;
- before anchor selection, the model must decide whether affirmative evidence is sufficient to characterize the subdomain at all;
- failure to establish a higher anchor is never evidence for a lower anchor;
- sparse, missing, unclassified, or incomplete evidence produces `unknown` when the state itself cannot be established;
- the model assesses only subdomains against the canonical anchors;
- Supabase calculates final vector scores deterministically from fixed weights;
- unknown subdomains reduce coverage rather than receiving artificial low scores;
- deterministic coverage caps prevent narrow positive evidence from producing near-maximal whole-vector scores;
- vector confidence is calculated deterministically from coverage and subdomain confidence;
- there is no cross-vector overall score in Methodology 2.x.

Existing 1.x snapshots remain immutable historical records. Because they used holistic model-calibrated scoring, they are not directly comparable with Methodology 2.x snapshots. The `2.0.0` snapshot version is also retained unchanged; because `2.0.1` changes score-affecting evidence-sufficiency semantics, `2.0.1` is the current like-for-like longitudinal baseline.

Execution remains schedule-agnostic: each invocation supplies an execution key. Retries of the same logical invocation reuse the same key and resolve to the existing snapshot; a genuinely new invocation uses a new key and creates an independent snapshot.

Kleos Bot's current production evaluation flow is:

```text
Apple Shortcut
      ↓
stateless normal ChatGPT conversation
      ↓
connected Supabase management tool
      ↓
public.kleos_evaluation_context_read
      ↓
current Methodology 2.x + compact canonical evidence
      ↓
ChatGPT applies assessability gate and classifies every assessable subdomain
      ↓
public.persist_kleos_evaluation(p_execution_key, p_vectors)
      ↓
Supabase validates coverage and calculates final vector scores/confidence
      ↓
immutable vector + subdomain snapshot
```

The Shortcut does not transport evidence JSON and does not target a Custom GPT. The tool-facing read relation and persistence function are intended for the connected Supabase management SQL session.

See:

- [`documentation/vector-snapshot-contract.md`](documentation/vector-snapshot-contract.md) for the stable snapshot interoperability contract.
- [`documentation/kleos-vector-methodology-2.0.md`](documentation/kleos-vector-methodology-2.0.md) for the current scoring methodology.
- [`documentation/kleos-bot-methodology-v1.md`](documentation/kleos-bot-methodology-v1.md) for the legacy 1.x methodology record.
- [`documentation/kleos-bot-shortcut-transport.md`](documentation/kleos-bot-shortcut-transport.md) for the current stateless ChatGPT/Supabase execution flow.

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
- `goat_health_metrics`

Legacy persistence such as `goat_score_entries` may still exist in the shared database for compatibility/history, but the global GOAT Score product workflow has been removed and is not part of the current Kleos UI or scoring model.

Kleos also owns the derived vector-state and methodology tables:

- `kleos_vector_snapshots`
- `kleos_vector_snapshot_results`
- `kleos_vector_snapshot_subdomain_results`
- `kleos_vector_methodologies`
- `kleos_vector_methodology_subdomains`

The raw data was intentionally **not copied or migrated** during application extraction. Kleos reads and writes the same canonical records previously used by Ariadne's `/lab` route. Raw evidence remains authoritative source material; vector snapshots are derived historical interpretations and do not replace those records.

Existing Row Level Security remains authoritative. Snapshot tables are read-only to ordinary authenticated clients; trusted writes use the atomic snapshot persistence contracts. Methodology tables are not exposed to ordinary application roles; the stateless evaluator receives the current methodology through the management-session evaluation context.

Future schema changes that concern Kleos-owned persistence should be authored from this repository even while the physical database remains shared.

## Database migrations

Apply the additive SQL migrations under [`supabase/migrations/`](supabase/migrations/) to the shared Supabase project in filename order. They must not seed, reset, or silently rewrite private data.

The migration history includes superseded execution and scoring implementations. The current runtime contract is defined by the latest migrations. Historical migrations remain present to describe how the database reached its current state.

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
- the measurement editor manages raw evidence such as cognitive tests, strength metrics, academic results and notes, health context, CV context, immutable characteristics, miscellaneous characteristics, financial records, and Apple Health metrics;
- the former global GOAT Score entry/history workflow has been removed;
- raw measurement records remain editable independently of derived vector snapshots.

Kleos Bot evaluations are the source of new derived vector snapshots. The browser measurement editor does not calculate or manually author those vector assessments.

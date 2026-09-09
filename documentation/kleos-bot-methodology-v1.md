# Kleos Bot methodology v1.0.0

Kleos Bot produces a dated derived assessment of the eight canonical Kleos vectors. It does not modify raw evidence and does not create Ariadne directions, goals, or tasks.

## Evidence boundary

Every run must use the current canonical Kleos records from the shared Supabase project. Do not evaluate from stale manually copied prompt text.

Canonical evidence membership is defined by the enabled rows in the server-side `kleos_evidence_sources` registry. The registry is an explicit whitelist: a table does not become canonical Kleos Bot evidence merely because its name starts with `goat_`.

The current registry includes, among other sources, `goat_big_five_assessments`. Big Five is personality/dispositional evidence and may inform interpretation where relevant, but it must not be treated as a direct mental-health measurement or mechanically converted into a psychological vector score.

Legacy `goat_score_entries` must not determine any current vector score. Existing vector snapshots and snapshot results are derived assessments, not canonical raw evidence.

The bot must not silently import facts from previous ChatGPT conversations, ChatGPT memory, unrelated files, or external sources.

## Evidence schema vs methodology version

The Kleos Bot scoring methodology and the evidence transport contract are versioned independently.

- Methodology version `1.0.0` defines how the eight vectors are interpreted, calibrated, and persisted.
- Evidence schema version `2.0.0` defines the current transport wrapper returned by the Shortcut-facing evidence endpoint.

Adding or removing a canonical evidence source through the registry does not by itself require a methodology-version bump. A methodology bump is required only when the evaluation/scoring semantics intentionally change.

## Apple Shortcuts evidence transport

For Apple Shortcuts → ChatGPT runs, ChatGPT must not retrieve personal evidence through the connected Supabase SQL connector. The connector may block returning the evidence payload even when it is wrapped in a dedicated RPC.

The supported read path is:

```text
Apple Shortcut
      ↓
POST kleos-bot-evidence Edge Function
      ↓
versioned evidence wrapper
      ↓
Ask ChatGPT with that JSON embedded in the invocation
```

The Edge Function authenticates the Shortcut using a dedicated high-entropy bot token supplied in `x-kleos-bot-token`. The plaintext token is stored only in the Shortcut; the repository contains only its SHA-256 hash. Supabase database credentials remain server-side in the Edge Function environment.

The Edge Function calls `get_kleos_bot_evidence_admin()` server-side and returns:

```json
{
  "evidence_schema_version": "2.0.0",
  "evidence_groups": {
    "<registered group key>": []
  }
}
```

The underlying admin RPC:

- accepts no owner UUID;
- resolves the fixed authorized Kleos owner internally;
- strips `user_id` from returned records;
- returns one array for every enabled source in `kleos_evidence_sources`;
- excludes vector snapshots, snapshot results, and legacy score entries by registry boundary;
- is read-only.

ChatGPT must consume every group returned under `evidence_groups`. It must not require a predetermined group count or fixed list of names. This allows newly registered canonical evidence to reach the evaluator without a prompt-specific transport change.

ChatGPT must treat the JSON supplied by the Shortcut as the complete authoritative evidence payload for that invocation. It must not perform raw `SELECT` queries against the underlying `goat_*` tables and must not use previous snapshots or memory as fallback evidence.

## Vector interpretation

- **Physical** — health, strength, endurance, body composition, sleep, nutrition, mobility.
- **Psychological** — wellbeing, emotional regulation, resilience, agency, self-esteem, motivation, psychological coherence.
- **Intellectual** — knowledge, reasoning, mental models, learning ability, expertise, critical thinking.
- **Professional** — career capital, qualifications, portfolio, experience, reputation, employability, professional network.
- **Financial** — income, assets, savings, liquidity, financial independence, earning capacity.
- **Relational** — romantic relationship, friendships, family, community, social connection, relationship quality/depth.
- **Creative** — writing, filmmaking, photography, design, artistic skill, creative output.
- **Experiential** — travel, novelty, adventure, environments, events, memorable experiences, breadth of lived life.

Evidence may inform more than one vector only when the relationship is substantively supportable. Do not duplicate a strong measurement across vectors merely to raise multiple scores.

## 0–100 calibration

Scores are broad ordinal assessments of current state, not XP and not objective ground truth.

- `0–19`: severely weak / highly impaired state on available direct evidence
- `20–39`: clearly below ordinary adult functioning or development
- `40–59`: ordinary / mixed / developing state
- `60–74`: clearly strong state
- `75–84`: very strong / uncommon state
- `85–94`: exceptional state
- `95–100`: genuinely elite to near world-leading state

Do not force a score simply because the scale exists. If the canonical evidence cannot support a defensible placement, output `unknown`. Prefer integer scores and avoid false precision.

## Confidence

For an assessed vector:

- **high** — multiple direct, relevant, reasonably current pieces of evidence that agree substantially;
- **medium** — at least one meaningful direct source or several useful but incomplete sources;
- **low** — sparse, indirect, or stale evidence that still supports a provisional assessment.

Use `unknown` rather than a low-confidence numeric guess when the evidence is too weak to justify a score.

Unknown vectors use:

```json
{
  "status": "unknown",
  "score": null,
  "confidence": "unknown"
}
```

## Commentary

Each vector must include concise commentary identifying the evidence basis and major uncertainty. Commentary should explain the assessment rather than merely restate the number.

Do not infer unstated diagnoses, personality traits, relationship quality, wealth, creative skill, or other sensitive characteristics from weak proxies.

## Output contract

The model output contains only:

```json
{
  "overallScore": null,
  "results": [
    {
      "vectorId": "physical",
      "status": "assessed",
      "score": 72,
      "confidence": "high",
      "commentary": "..."
    }
  ]
}
```

The real `results` array must contain all eight canonical vectors exactly once. `overallScore` remains `null` in methodology v1 unless a later methodology explicitly defines how it should be computed.

Application/orchestration code supplies evaluator identity `kleos-bot`, methodology version `1.0.0`, evaluation timestamp, and a unique per-execution idempotency key. The model does not choose or override evaluator or methodology metadata.

## Execution and idempotency

Kleos Bot has no built-in scheduling cadence. It may be triggered manually, by Apple Shortcuts, by ChatGPT, or by a future orchestration layer at any frequency. Multiple valid evaluations in the same week, day, hour, or minute are legitimate and must create independent immutable snapshots.

Each invocation supplies an execution key identifying that specific execution. Retrying the same execution with the same key returns the existing snapshot instead of creating a duplicate. A genuinely new evaluation uses a new execution key and is never blocked because another snapshot exists in the same time window.

## Persistence path

After evaluation and validation, Apple Shortcuts/ChatGPT runs persist through the connected Supabase administrative SQL interface using:

`create_kleos_bot_snapshot_admin(...)`

The privileged admin writer:

- requires no fabricated `request.jwt.claims`;
- resolves the authorized Kleos owner internally;
- accepts no owner UUID from the model;
- preserves exactly-eight-vector validation, immutable history, methodology metadata, and per-execution idempotency;
- is not executable by normal application roles;
- is intended only for direct privileged SQL execution.

The complete supported flow is therefore:

```text
Shortcut HTTP evidence retrieval
        ↓
ChatGPT evaluates exactly eight vectors
        ↓
create_kleos_bot_snapshot_admin(...)
```

A malformed evaluation, evidence retrieval failure, database failure, or authorization failure must leave the last valid snapshot untouched. Direct client mutation of the snapshot tables remains unavailable.

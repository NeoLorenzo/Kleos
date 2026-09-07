# Kleos Bot methodology v1.0.0

Kleos Bot produces a dated derived assessment of the eight canonical Kleos vectors. It does not modify raw evidence and does not create Ariadne directions, goals, or tasks.

## Evidence boundary

Every run must read the current canonical Kleos records directly from the shared Supabase project. Do not evaluate from stale manually copied prompt text.

Canonical evidence currently includes:

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

Legacy `goat_score_entries` may be read for historical context but must not be used as evidence that mechanically determines any vector score. Existing derived scores are not raw evidence.

The bot must not silently import facts from previous ChatGPT conversations or unrelated external sources. A future ingestion issue may expand the canonical evidence boundary explicitly.

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

Use this calibration consistently:

- `0–19`: severely weak / highly impaired state on available direct evidence
- `20–39`: clearly below ordinary adult functioning or development
- `40–59`: ordinary / mixed / developing state
- `60–74`: clearly strong state
- `75–84`: very strong / uncommon state
- `85–94`: exceptional state
- `95–100`: genuinely elite to near world-leading state

Do not force a score simply because the scale exists. If the canonical evidence cannot support a defensible placement, output `unknown`.

The scale is intentionally coarse. Avoid false precision: integer scores are preferred unless the evidence strongly justifies otherwise.

## Confidence

For an assessed vector:

- **high** — multiple direct, relevant, reasonably current pieces of evidence that agree substantially;
- **medium** — at least one meaningful direct source or several useful but incomplete sources;
- **low** — sparse, indirect, or stale evidence that still supports a provisional assessment.

Use `unknown` status rather than a low-confidence numeric guess when evidence is too weak to justify a score.

Unknown vectors use:

```json
{
  "status": "unknown",
  "score": null,
  "confidence": "unknown"
}
```

## Commentary

Each vector must include concise commentary that identifies the evidence basis and major uncertainty. Commentary should explain the assessment, not merely restate the number.

Do not infer unstated diagnoses, personality traits, relationship quality, wealth, creative skill, or other characteristics from proxies unless the stored evidence explicitly supports the inference.

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

Application code supplies evaluator identity `kleos-bot`, methodology version `1.0.0`, evaluation timestamp, and the weekly run key. The model does not choose or override those values.

## Scheduling and idempotency

The intended cadence is once per ISO week using the Europe/Lisbon timezone.

The run key format is:

```text
YYYY-Www:1.0.0
```

Retries in the same week/methodology use the same run key. `create_kleos_bot_weekly_snapshot(...)` serializes matching retries and returns the existing snapshot instead of creating another record.

A malformed model response is rejected before persistence. A database or authentication failure must leave the last valid snapshot untouched. Manual trusted writes through the #4 RPC remain available for debugging and recovery.

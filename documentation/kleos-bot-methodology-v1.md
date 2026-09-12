# Kleos Bot methodology v1.0.0 — legacy record

> **Historical only.** Methodology `2.0.0` is now the current canonical Kleos scoring methodology. This document is retained to explain older immutable 1.x snapshots and must not be used to score new evaluations. See [`kleos-vector-methodology-2.0.md`](kleos-vector-methodology-2.0.md).

Kleos Bot produces a dated derived assessment of the eight canonical Kleos vectors. It does not modify raw evidence and does not create Ariadne directions, goals, or tasks.

## Evidence boundary

Every run under this historical methodology used the canonical Kleos records from the shared Supabase project. Canonical evidence membership was defined by enabled rows in the server-side `kleos_evidence_sources` registry. Legacy `goat_score_entries` did not determine current vector scores.

## Historical vector interpretation

- **Physical** — health, strength, endurance, body composition, sleep, nutrition, mobility.
- **Psychological** — wellbeing, emotional regulation, resilience, agency, self-esteem, motivation, psychological coherence.
- **Intellectual** — knowledge, reasoning, mental models, learning ability, expertise, critical thinking.
- **Professional** — career capital, qualifications, portfolio, experience, reputation, employability, professional network.
- **Financial** — income, assets, savings, liquidity, financial independence, earning capacity.
- **Relational** — romantic relationship, friendships, family, community, social connection, relationship quality/depth.
- **Creative** — writing, filmmaking, photography, design, artistic skill, creative output.
- **Experiential** — travel, novelty, adventure, environments, events, memorable experiences, breadth of lived life.

Evidence could inform more than one vector only when the relationship was substantively supportable.

## Historical 0–100 calibration

The 1.x methodology used broad holistic ordinal vector scores rather than fixed weighted subdomains:

- `0–19`: severely weak / highly impaired state on available direct evidence
- `20–39`: clearly below ordinary adult functioning or development
- `40–59`: ordinary / mixed / developing state
- `60–74`: clearly strong state
- `75–84`: very strong / uncommon state
- `85–94`: exceptional state
- `95–100`: genuinely elite to near world-leading state

This approach left substantial room for model calibration and vector-scope drift. That reproducibility problem is the reason Methodology 2.0 introduced explicit subdomains, fixed weights, explicit anchors, coverage caps, and server-side deterministic aggregation.

## Historical confidence

For assessed vectors, confidence was model-selected as `low`, `medium`, or `high`; unknown vectors used `confidence = unknown` and `score = null`.

## Historical output contract

The model produced final vector scores directly:

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

The real result contained all eight canonical vectors exactly once. Execution metadata and methodology version were supplied by orchestration rather than chosen by the model.

## Historical transport and persistence

The transport changed several times during 1.x, including a period where Apple Shortcuts embedded an HTTP-fetched evidence payload and later a connected-Supabase stateless flow. These paths are migration history, not current production instructions.

New evaluations must use the current contract documented in:

- [`kleos-bot-shortcut-transport.md`](kleos-bot-shortcut-transport.md)
- [`kleos-bot-shortcuts-prompt.md`](kleos-bot-shortcuts-prompt.md)
- [`kleos-vector-methodology-2.0.md`](kleos-vector-methodology-2.0.md)

Historical 1.x snapshots remain immutable and retain their recorded methodology versions. They must not be silently reinterpreted as Methodology 2.0 scores.

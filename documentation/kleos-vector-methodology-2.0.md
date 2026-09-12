# Kleos Vector Methodology 2.0

Methodology `2.0.0` is the first Kleos vector methodology designed for longitudinal reproducibility rather than holistic model calibration.

## Core scoring semantics

Scores are **absolute current-state scores**, not percentiles for age, career stage, wealth cohort, student status, or any other peer group. The evaluator must not raise a score because a state is unusually strong "for a 22-year-old" or similar.

The upper tail is intentionally difficult:

- `70`: strong, clearly beyond merely adequate;
- `85`: very strong, broad and well-supported with only limited material weaknesses;
- `95`: exceptional, rare, highly complete and strongly evidenced;
- `100`: practical ceiling, reserved for an extraordinarily complete and durable state with essentially no meaningful unmet dimension.

The database stores explicit `0`, `25`, `50`, `70`, `85`, `95`, and `100` anchors for every methodology subdomain. They are returned to the evaluator by `get_kleos_evaluation_context()`.

## Missing evidence and coverage

Missing evidence is not negative evidence. An unobservable subdomain is `unknown` rather than assigned an artificial low score.

However, narrow positive evidence cannot stand in for a whole vector. Final scores are therefore coverage-capped:

| Assessed subdomain weight | Maximum vector score |
| ---: | ---: |
| `<50%` | Vector is `unknown` |
| `50–64.999%` | 70 |
| `65–79.999%` | 82 |
| `80–89.999%` | 90 |
| `90–99.999%` | 95 |
| `100%` | 100 |

For assessed vectors, the raw score is the weighted mean of assessed subdomains with assessed weights renormalized to 100%. The final score is `min(raw score, coverage cap)`, rounded to one decimal place.

Vector confidence is also deterministic:

- `high`: coverage at least 85% and weighted mean subdomain confidence at least 2.5 (`low=1`, `medium=2`, `high=3`);
- `medium`: coverage at least 65% and weighted mean confidence at least 1.75;
- otherwise `low`;
- unknown vectors use `unknown` confidence.

Kleos 2.0 does not calculate a cross-vector overall score.

## Evidence rules

- Prefer evidence whose recency matches the subdomain. Current-state evidence generally outweighs stale evidence; cumulative achievements remain relevant where the subdomain itself is cumulative.
- Prefer structured, objective, or externally validated evidence when available. Self-report remains canonical evidence but can lower confidence when it is the principal support for a consequential claim.
- When evidence conflicts, prefer the more direct, recent, and reliable source and reduce confidence rather than silently selecting the favorable source.
- The same record may support multiple vectors only through a distinct vector-specific property. An impressive project is not generic positive evidence everywhere.

## Vector definitions and weights

### Physical

Absolute current physical health and functional capacity, with primary emphasis on the recent 90-day state.

- Clinical health — 20%
- Cardiorespiratory & activity — 20%
- Strength & function — 20%
- Sleep & recovery — 20%
- Nutrition & body composition — 20%

Steps alone do not establish elite cardiorespiratory fitness. Machine strength is valid evidence of strength, but missing movement categories reduce coverage rather than counting as weakness.

### Psychological

Absolute current psychological wellbeing and self-regulatory functioning. Recent validated assessments and current functioning outweigh older personality evidence.

- Wellbeing & symptoms — 25%
- Regulation & resilience — 20%
- Agency & follow-through — 20%
- Stress load & recovery — 20%
- Meaning & self-regard — 15%

### Intellectual

Absolute current intellectual capability and demonstrated mastery. It is not age- or education-stage-relative.

- Reasoning & learning — 20%
- Knowledge & academic mastery — 25%
- Applied problem solving — 20%
- Research & epistemic rigor — 20%
- Intellectual output & growth — 15%

### Professional

Absolute current professional capital and demonstrated responsibility. Student status or early career does not change the scale.

- Role & responsibility — 25%
- Demonstrated execution — 20%
- Career capital & skills — 20%
- External validation & reputation — 20%
- Network & optionality — 15%

### Financial

Absolute current financial health. Wealth is important but is not equivalent to liquidity, independence, stewardship, or risk control.

- Balance-sheet security — 25%
- Liquidity & resilience — 20%
- Cash-flow independence — 20%
- Capital allocation & stewardship — 20%
- Financial systems & risk — 15%

### Relational

Absolute current quality and resilience of the whole relationship ecosystem. A strong romantic relationship cannot substitute for unknown friendships, family, community, or maintenance quality.

- Romantic intimacy — 20%
- Friendships & peer support — 20%
- Family relationships — 20%
- Community & belonging — 15%
- Maintenance & relationship skill — 25%

### Creative

Absolute current creative capability and practice. Technical work counts only when it specifically demonstrates originality, creative craft, or creative production; difficulty alone is not creative evidence.

- Original ideation — 20%
- Creative craft — 20%
- Output cadence — 25%
- Quality & external reception — 20%
- Range & experimentation — 15%

### Experiential

Current experiential richness combines cumulative breadth with recent engagement, so historical travel cannot permanently produce a near-maximal score by itself.

- Accumulated breadth — 30%
- Recent novelty & engagement — 25%
- Challenge & adventure — 20%
- Immersion & depth — 15%
- Reflection & integration — 10%

## Runtime contract

A stateless evaluator retrieves both the current methodology and compact evidence in one server-side call:

```sql
select public.get_kleos_evaluation_context() as context;
```

The model returns only vector commentary plus the complete set of subdomain assessments. It does **not** supply final vector scores, weights, methodology version, vector confidence, or overall score.

Persistence is performed through:

```sql
select public.persist_kleos_evaluation(
  p_execution_key := '<uuid>',
  p_vectors := '<eight-vector subdomain payload>'::jsonb
) as persistence_result;
```

The database validates the canonical vector/subdomain set, applies fixed methodology weights, computes coverage, score caps, final score and vector confidence, then stores the immutable snapshot and all subdomain results.

## Versioning

Snapshots from 1.x remain immutable historical records. They used holistic model scoring and are not directly comparable to `2.0.0` snapshots.

Any future change to vector definitions, subdomains, weights, score anchors, coverage caps, aggregation semantics, or other score-affecting methodology rules requires a methodology-version bump. The Vector State UI shows methodology versions explicitly and marks 1.x snapshots as legacy.

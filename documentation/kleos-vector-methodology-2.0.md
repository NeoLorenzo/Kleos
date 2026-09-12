# Kleos Vector Methodology 2.0

Methodology `2.0.1` is the current Kleos vector methodology. It preserves the fixed 2.0 vector/subdomain structure and deterministic aggregation introduced in `2.0.0`, while tightening the evidence-sufficiency rules so missing evidence cannot be converted into a lower anchor score.

## Core scoring semantics

Scores are **absolute current-state scores**, not percentiles for age, career stage, wealth cohort, student status, or any other peer group. The evaluator must not raise a score because a state is unusually strong "for a 22-year-old" or similar.

Every assessed subdomain must be classified onto exactly one of seven canonical anchors:

- `0`: affirmative direct evidence of severe impairment, near-total failure, or an effectively absent functional state;
- `25`: affirmative evidence of a clearly weak state, with substantial deficits, instability, or repeated failure;
- `50`: affirmative evidence of a functional but ordinary, genuinely mixed, inconsistent, narrow, or materially constrained state;
- `70`: affirmative evidence of a clearly strong state, beyond merely adequate, with meaningful demonstrated strengths and manageable evidenced limitations;
- `85`: affirmative evidence of a very strong, sustained, broad, and well-supported state with only limited evidenced material weaknesses;
- `95`: affirmative evidence of an exceptional, rare, highly complete, and strongly evidenced state, with important evidenced weaknesses absent or minor and sufficiently broad coverage;
- `100`: affirmative direct evidence of the practical ceiling: extraordinarily complete, durable, independently supported, and sufficiently comprehensive to establish essentially no meaningful unmet dimension.

The evaluator **does not interpolate** between anchors. If affirmative evidence sits ambiguously between two anchors, it chooses the better-supported anchor and lowers confidence rather than inventing a number such as 78 or 92. Weighted aggregation across subdomains still produces granular final vector scores.

Missing evidence must never receive the `0`, `25`, `50`, or any other anchor by default. Missing evidence is `unknown` unless the available evidence still affirmatively characterizes the core subdomain state.

The database stores these explicit anchors for every methodology subdomain and returns them through the canonical evaluation context.

## Assessability gate

Methodology `2.0.1` adds a required **assessability gate before anchor selection**.

For every subdomain, the evaluator must first ask:

> Does the canonical evidence affirmatively characterize the current state of this subdomain well enough to select an anchor?

If **no**, the result is `unknown`.

If **yes**, the evaluator selects the best-supported fixed anchor.

The following rules are mandatory:

- Failure to establish a higher anchor is never evidence for a lower anchor.
- `50` is not a default for uncertainty, sparse data, incomplete tracking, or “not enough evidence for 70.” It requires actual evidence of an ordinary, mixed, inconsistent, narrow, or constrained state.
- `25` requires actual evidence of weakness; it cannot be inferred from absent classifications or missing connected data.
- The absence of a recorded, classified, or connected value is not evidence that the real-world value is zero or absent unless the canonical source contract establishes completeness for that field and period.
- For a composite subdomain, missing components are not averaged in as neutral or weak. If the observed evidence still sufficiently characterizes the core subdomain state, classify from that affirmative evidence and reduce confidence for material gaps. If the gaps prevent a defensible characterization, return `unknown`.
- Confidence is used when an anchor is supportable but uncertain. `unknown` is used when the state itself cannot be established.

Examples of invalid reasoning under `2.0.1`:

- “Only one night of sleep is available, so sleep is 50.” → `unknown` unless that evidence is sufficient to characterize the current sleep state.
- “No classified income appears in connected transactions, so cash-flow independence is 25.” → `unknown` unless the evidence source establishes that all relevant income/support flows are captured.
- “Mobility is not measured, therefore otherwise strong strength/function evidence must be scored lower.” → do not penalize the missing component; either classify from sufficiently representative affirmative evidence with lower confidence or return `unknown`.

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
- When the evidence cannot defensibly establish the subdomain state, return `unknown`; do not manufacture a lower anchor as a proxy for uncertainty.

## Vector definitions and weights

### Physical

Absolute current physical health and functional capacity, with primary emphasis on the recent 90-day state.

- Clinical health — 20%
- Cardiorespiratory & activity — 20%
- Strength & function — 20%
- Sleep & recovery — 20%
- Nutrition & body composition — 20%

Steps alone do not establish elite cardiorespiratory fitness. Machine strength is valid evidence of strength. Missing mobility or free-movement evidence must not automatically depress the anchor; if the available evidence cannot characterize the composite strength/function subdomain adequately, it should instead become `unknown`.

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

A missing or unclassified financial flow is not evidence of zero income, zero liquidity, or weak independence unless the canonical financial source explicitly establishes completeness.

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

A stateless evaluator retrieves both the current methodology and compact evidence with the canonical read relation:

```sql
select context from public.kleos_evaluation_context_read;
```

The model returns only vector commentary plus the complete set of subdomain anchor classifications. It does **not** supply final vector scores, weights, methodology version, vector confidence, or overall score.

Persistence is performed through:

```sql
select public.persist_kleos_evaluation(
  p_execution_key := '<uuid>',
  p_vectors := '<eight-vector subdomain payload>'::jsonb
) as persistence_result;
```

The database validates the canonical vector/subdomain set, rejects non-anchor subdomain scores, applies fixed methodology weights, computes coverage, score caps, final score and vector confidence, then stores the immutable snapshot and all subdomain results.

The current methodology cannot be written through the older authenticated holistic snapshot writer. Current-version snapshots must pass through the server-side deterministic aggregation path.

## Reproducibility

Methodology 2.0 removes several previously model-selected quantities from the run:

- vector definitions are fixed;
- subdomain membership and weights are fixed;
- subdomain score choices are restricted to seven anchors;
- evidence-coverage treatment is fixed;
- vector aggregation is fixed;
- vector confidence is fixed;
- methodology version is selected server-side.

Model judgment remains only in deciding whether a subdomain is assessable, which anchor best fits the affirmative evidence, and the subdomain confidence/commentary. Regression tests use fixed subdomain fixtures to verify that identical classifications always produce identical final vectors and that incomplete coverage produces the documented caps.

## Versioning

Snapshots from 1.x remain immutable historical records. They used holistic model scoring and are not directly comparable to Methodology 2.x snapshots.

`2.0.0` is also retained unchanged as the first deterministic-methodology snapshot version. `2.0.1` changes score-affecting evidence-sufficiency semantics, so `2.0.0` and `2.0.1` should not be treated as strictly longitudinally comparable. `2.0.1` is the new baseline for future like-for-like comparisons.

Any future change to vector definitions, subdomains, weights, score anchors, allowed anchor values, assessability rules, coverage caps, aggregation semantics, or other score-affecting methodology rules requires a methodology-version bump. The Vector State UI shows methodology versions explicitly and marks 1.x snapshots as legacy.

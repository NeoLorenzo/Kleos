-- Kleos Methodology 2.0.1: require affirmative evidence for every assessed anchor.
-- This patch preserves the 2.0 vector/subdomain structure, weights, anchors and
-- deterministic aggregation, but tightens the assessability gate so missing or
-- incomplete evidence cannot silently become a mediocre/weak score.

update public.kleos_vector_methodologies
set is_current = false
where is_current;

insert into public.kleos_vector_methodologies (
  version,
  name,
  scoring_scope,
  evidence_rules,
  aggregation_rules,
  is_current
)
select
  '2.0.1',
  'Kleos Vector Methodology 2.0.1',
  scoring_scope,
  evidence_rules || jsonb_build_object(
    'affirmative_anchor_evidence',
      'Every assessed anchor requires affirmative canonical evidence that the current subdomain state matches the selected anchor. Failure to establish a higher anchor is never evidence for a lower anchor.',
    'missing_vs_mediocre',
      'Do not use 50, 25, or any other lower anchor merely because evidence is sparse, incomplete, indirect, unclassified, or insufficient to justify a stronger score. If the state itself cannot be characterized defensibly, return unknown.',
    'partial_subdomain_observation',
      'For a composite subdomain, missing components must not be averaged in as neutral or weak. If observed evidence is sufficient to characterize the core subdomain state, classify from that affirmative evidence and lower confidence for material gaps. If the missing components prevent a defensible characterization of the core state, return unknown.',
    'absence_not_zero_value',
      'The absence of a recorded, classified, or connected value is not evidence that the real-world value is zero or absent unless the canonical source contract establishes that the field is complete for the relevant period.',
    'confidence_vs_assessability',
      'Use confidence for uncertainty about an otherwise supportable anchor. Use unknown when canonical evidence is insufficient to establish the subdomain state at all.'
  ),
  aggregation_rules || jsonb_build_object(
    'assessment_gate',
      'Assessability precedes anchor selection. First decide whether affirmative canonical evidence can characterize the subdomain state. If not, return unknown. Only then select the best-supported fixed anchor.',
    'overall_score',
      'No cross-vector overall score is produced in 2.0.1.'
  ),
  true
from public.kleos_vector_methodologies
where version = '2.0.0'
on conflict (version) do update set
  name = excluded.name,
  scoring_scope = excluded.scoring_scope,
  evidence_rules = excluded.evidence_rules,
  aggregation_rules = excluded.aggregation_rules,
  is_current = true;

delete from public.kleos_vector_methodology_subdomains
where methodology_version = '2.0.1';

insert into public.kleos_vector_methodology_subdomains (
  methodology_version,
  vector_id,
  vector_order,
  vector_label,
  vector_definition,
  subdomain_id,
  subdomain_order,
  subdomain_label,
  weight,
  definition,
  anchors
)
select
  '2.0.1',
  vector_id,
  vector_order,
  vector_label,
  vector_definition,
  subdomain_id,
  subdomain_order,
  subdomain_label,
  weight,
  definition,
  jsonb_build_object(
    '0',
      'Affirmative direct evidence shows severe impairment, near-total failure, or an effectively absent functional state in ' || lower(subdomain_label) || '. Missing evidence alone must never receive 0; it is unknown.',
    '25',
      'Affirmative direct evidence shows a clearly weak state in ' || lower(subdomain_label) || ', with substantial deficits, instability, or repeated failure. This anchor must not be inferred from missing or unclassified evidence.',
    '50',
      'Affirmative evidence shows a functional but ordinary, genuinely mixed, inconsistent, narrow, or materially constrained state in ' || lower(subdomain_label) || '. This is not a default score for uncertainty, sparse evidence, or inability to justify a higher anchor.',
    '70',
      'Affirmative evidence supports a clearly strong state in ' || lower(subdomain_label) || ', beyond merely adequate, with meaningful demonstrated strengths and manageable evidenced limitations. Unobserved dimensions alone are not limitations.',
    '85',
      'Affirmative evidence supports a very strong, sustained, broad, and well-supported state in ' || lower(subdomain_label) || ', with only limited evidenced material weaknesses.',
    '95',
      'Affirmative evidence supports an exceptional, rare, highly complete, and strongly evidenced state in ' || lower(subdomain_label) || '; important evidenced weaknesses are absent or minor and coverage is sufficiently broad.',
    '100',
      'Affirmative direct evidence supports the practical ceiling for ' || lower(subdomain_label) || ': extraordinarily complete, durable, independently supported, and sufficiently comprehensive to establish essentially no meaningful unmet dimension.'
  )
from public.kleos_vector_methodology_subdomains
where methodology_version = '2.0.0';

comment on table public.kleos_vector_methodologies is
  'Versioned Kleos scoring specifications. 2.0.1 adds an affirmative-evidence assessability gate so missing evidence cannot become a lower anchor score.';

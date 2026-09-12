-- Kleos #69: reduce model-score variance by requiring discrete canonical subdomain anchors.

alter table public.kleos_vector_snapshot_subdomain_results
  drop constraint if exists kleos_vector_snapshot_subdomain_anchor_score_check;

alter table public.kleos_vector_snapshot_subdomain_results
  add constraint kleos_vector_snapshot_subdomain_anchor_score_check
  check (score is null or score in (0,25,50,70,85,95,100));

update public.kleos_vector_methodologies
set aggregation_rules = aggregation_rules || jsonb_build_object(
  'allowed_subdomain_scores', jsonb_build_array(0,25,50,70,85,95,100),
  'anchor_selection', 'The evaluator must choose exactly one canonical anchor score for each assessed subdomain. Do not interpolate. If evidence sits ambiguously between anchors, choose the better-supported anchor and lower confidence rather than inventing an intermediate score.'
)
where version = '2.0.0';

update public.kleos_vector_methodology_subdomains
set anchors = jsonb_build_object(
  '0', 'Direct evidence shows severe impairment, near-total failure, or an effectively absent functional state in ' || lower(subdomain_label) || '. Missing evidence alone must never receive 0; it is unknown.',
  '25', 'Direct evidence shows a clearly weak state in ' || lower(subdomain_label) || ', with substantial deficits, instability, or repeated failure.',
  '50', 'Evidence supports a functional but ordinary, mixed, inconsistent, narrow, or materially constrained state in ' || lower(subdomain_label) || '.',
  '70', 'Evidence supports a clearly strong state in ' || lower(subdomain_label) || ', beyond merely adequate, with meaningful demonstrated strengths and manageable limitations.',
  '85', 'Evidence supports a very strong, sustained, broad, and well-supported state in ' || lower(subdomain_label) || ', with only limited material weaknesses.',
  '95', 'Evidence supports an exceptional, rare, highly complete, and strongly evidenced state in ' || lower(subdomain_label) || '; important weaknesses are absent or minor.',
  '100', 'Direct evidence supports the practical ceiling for ' || lower(subdomain_label) || ': extraordinarily complete, durable, and independently supported, with essentially no meaningful unmet dimension.'
)
where methodology_version = '2.0.0';

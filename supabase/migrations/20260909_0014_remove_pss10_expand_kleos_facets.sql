-- Remove PSS-10 from Kleos because its redistribution/licensing constraints
-- are incompatible with the active public application. The psychological
-- evidence relation remains canonical and registry-driven.

alter table public.goat_psychological_assessments
  drop column if exists pss10_score;

-- Defensive cleanup for any pre-v1.1 rows. At the time this migration was
-- authored production contained no saved psychological assessments, but this
-- keeps replayed/dev databases free of PSS-specific response/version keys.
update public.goat_psychological_assessments
set responses = responses - 'pss10',
    instrument_versions = instrument_versions - 'pss10',
    updated_at = now()
where responses ? 'pss10'
   or instrument_versions ? 'pss10';

comment on table public.goat_psychological_assessments is
  'Canonical dated psychological battery evidence. WHO-5, SWLS, GAD-7 and PHQ-9 remain independently scored; Kleos facets are non-validated supplementary measures including stress-load and coping coverage.';

comment on column public.goat_psychological_assessments.responses is
  'Versioned numeric item responses sufficient for deterministic rescoring of the active instruments plus Kleos-specific facets. PSS-10 is not collected or persisted.';

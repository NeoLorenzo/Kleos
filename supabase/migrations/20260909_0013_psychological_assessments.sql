-- Kleos #35: structured, repeatable psychological assessment battery.
-- Stores independently scored validated instruments plus non-validated Kleos-specific facets.
-- No aggregate psychological score is persisted or calculated here.

create table if not exists public.goat_psychological_assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  assessed_at timestamptz not null default now(),
  battery_version text not null,
  instrument_versions jsonb not null,
  responses jsonb not null,

  who5_raw_score smallint not null check (who5_raw_score between 0 and 25),
  who5_percentage smallint not null check (
    who5_percentage between 0 and 100
    and who5_percentage = who5_raw_score * 4
  ),
  swls_score smallint not null check (swls_score between 5 and 35),
  pss10_score smallint not null check (pss10_score between 0 and 40),
  gad7_score smallint not null check (gad7_score between 0 and 21),
  phq9_score smallint not null check (phq9_score between 0 and 27),
  phq9_item_9 smallint not null check (
    phq9_item_9 between 0 and 3
    and phq9_item_9 <= phq9_score
  ),
  kleos_facets jsonb not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint goat_psychological_assessments_battery_version_not_blank
    check (length(btrim(battery_version)) > 0),
  constraint goat_psychological_assessments_instrument_versions_object
    check (jsonb_typeof(instrument_versions) = 'object'),
  constraint goat_psychological_assessments_responses_object
    check (jsonb_typeof(responses) = 'object'),
  constraint goat_psychological_assessments_kleos_facets_object
    check (jsonb_typeof(kleos_facets) = 'object')
);

comment on table public.goat_psychological_assessments is
  'Canonical dated psychological battery evidence. Validated instruments remain independently scored; Kleos facets are non-validated supplementary measures.';

comment on column public.goat_psychological_assessments.responses is
  'Versioned numeric item responses sufficient for deterministic rescoring. PSS-10 item wording is not stored because redistribution permission is separate.';

create index if not exists goat_psychological_assessments_user_date_idx
on public.goat_psychological_assessments (user_id, assessed_at desc, created_at desc);

alter table public.goat_psychological_assessments enable row level security;

grant select, insert, update, delete on table public.goat_psychological_assessments to authenticated;
revoke all on table public.goat_psychological_assessments from anon;

drop policy if exists "Authorized user can read goat psychological assessments"
on public.goat_psychological_assessments;
create policy "Authorized user can read goat psychological assessments"
on public.goat_psychological_assessments
for select to authenticated
using (
  auth.uid() = user_id
  and lower(coalesce(auth.jwt()->>'email', '')) = 'theneolorenzo@gmail.com'
);

drop policy if exists "Authorized user can write goat psychological assessments"
on public.goat_psychological_assessments;
create policy "Authorized user can write goat psychological assessments"
on public.goat_psychological_assessments
for all to authenticated
using (
  auth.uid() = user_id
  and lower(coalesce(auth.jwt()->>'email', '')) = 'theneolorenzo@gmail.com'
)
with check (
  auth.uid() = user_id
  and lower(coalesce(auth.jwt()->>'email', '')) = 'theneolorenzo@gmail.com'
);

-- Register the battery as canonical raw evidence. The registry-driven Kleos Bot
-- evidence reader will then expose it automatically under evidence_groups.
insert into public.kleos_evidence_sources (group_key, relation_name, enabled)
values (
  'goat_psychological_assessments',
  'public.goat_psychological_assessments'::regclass,
  true
)
on conflict (group_key) do update
set relation_name = excluded.relation_name,
    enabled = excluded.enabled,
    updated_at = now();

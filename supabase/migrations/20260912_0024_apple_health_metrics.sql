create table if not exists public.goat_health_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  sample_key text not null,
  metric_name text not null,
  metric_date date not null,
  observed_at timestamptz,
  units text,
  qty double precision,
  min_value double precision,
  avg_value double precision,
  max_value double precision,
  source text,
  details jsonb not null default '{}'::jsonb,
  ingested_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint goat_health_metrics_sample_key_nonempty check (length(sample_key) > 0),
  constraint goat_health_metrics_metric_name_format check (metric_name ~ '^[a-z0-9_]+$'),
  constraint goat_health_metrics_user_sample_unique unique (user_id, sample_key)
);

comment on table public.goat_health_metrics is
  'Structured Apple Health metric summaries ingested from Health Auto Export. One stable row per exported metric/time bucket; repeated exports upsert the row.';

create index if not exists goat_health_metrics_user_metric_date_idx
  on public.goat_health_metrics (user_id, metric_name, metric_date desc);

alter table public.goat_health_metrics enable row level security;

revoke all on table public.goat_health_metrics from public;
revoke all on table public.goat_health_metrics from anon;
revoke insert, update, delete on table public.goat_health_metrics from authenticated;
grant select on table public.goat_health_metrics to authenticated;

drop policy if exists goat_health_metrics_select_own on public.goat_health_metrics;
create policy goat_health_metrics_select_own
  on public.goat_health_metrics
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create or replace view public.goat_health_metric_evidence as
with ranked as (
  select
    h.*,
    row_number() over (
      partition by h.user_id, h.metric_name
      order by h.metric_date desc, h.updated_at desc
    ) as recency_rank
  from public.goat_health_metrics h
  where h.metric_date >= current_date - 90
)
select
  user_id,
  metric_name,
  max(metric_date) as latest_date,
  max(units) as units,
  avg(qty) filter (where metric_date >= current_date - 6 and qty is not null) as avg_7d,
  avg(qty) filter (where metric_date >= current_date - 29 and qty is not null) as avg_30d,
  min(qty) filter (where metric_date >= current_date - 29 and qty is not null) as min_30d,
  max(qty) filter (where metric_date >= current_date - 29 and qty is not null) as max_30d,
  coalesce(
    jsonb_agg(
      jsonb_build_object(
        'metric_date', metric_date,
        'observed_at', observed_at,
        'qty', qty,
        'min', min_value,
        'avg', avg_value,
        'max', max_value,
        'source', source,
        'details', details
      ) order by metric_date desc, updated_at desc
    ) filter (where recency_rank <= 14),
    '[]'::jsonb
  ) as recent_samples
from ranked
group by user_id, metric_name;

revoke all on public.goat_health_metric_evidence from public;
revoke all on public.goat_health_metric_evidence from anon;
revoke all on public.goat_health_metric_evidence from authenticated;
revoke all on public.goat_health_metric_evidence from service_role;

insert into public.kleos_evidence_sources (group_key, relation_name, enabled)
values ('goat_health_metric_evidence', 'public.goat_health_metric_evidence'::regclass, true)
on conflict (group_key) do update
set relation_name = excluded.relation_name,
    enabled = excluded.enabled,
    updated_at = now();

create or replace function public.get_kleos_owner_user_id_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_owner_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'KLEOS_OWNER_LOOKUP_NOT_AUTHORIZED';
  end if;

  select id
  into v_owner_id
  from auth.users
  where lower(email) = 'theneolorenzo@gmail.com'
  order by created_at asc
  limit 1;

  if v_owner_id is null then
    raise exception 'KLEOS_OWNER_NOT_FOUND';
  end if;

  return v_owner_id;
end;
$$;

revoke all on function public.get_kleos_owner_user_id_admin() from public;
revoke all on function public.get_kleos_owner_user_id_admin() from anon;
revoke all on function public.get_kleos_owner_user_id_admin() from authenticated;
grant execute on function public.get_kleos_owner_user_id_admin() to service_role;

begin;

create table public.heracles_strength_metrics (
  user_id uuid not null references auth.users(id) on delete cascade,
  source_exercise_id bigint not null,
  exercise_name text not null check (btrim(exercise_name) <> ''),
  best_1rm numeric(10, 2) not null check (best_1rm > 0),
  qualifying_sessions integer not null check (qualifying_sessions >= 3),
  achieved_on date not null,
  estimation_basis text not null check (estimation_basis = 'observed_e1rm_high'),
  is_current boolean not null default true,
  synced_at timestamptz not null,
  last_checked_at timestamptz not null,
  source text not null default 'heracles' check (source = 'heracles'),
  primary key (user_id, source_exercise_id)
);

comment on table public.heracles_strength_metrics is
  'Persistent last-known Heracles strength snapshot. Current rows still satisfy the 30-day / 3-distinct-session export rule; stale rows preserve the last qualifying value.';
comment on column public.heracles_strength_metrics.best_1rm is
  'Highest positive Heracles estimated_1rm_high in the qualifying window. This is the upper observed Brzycki/Epley e1RM estimate, not a measured true 1RM.';
comment on column public.heracles_strength_metrics.synced_at is
  'Most recent successful sync at which Heracles returned this exercise as currently qualifying.';
comment on column public.heracles_strength_metrics.last_checked_at is
  'Most recent successful full Heracles snapshot sync, including checks where this exercise was no longer returned.';

alter table public.heracles_strength_metrics enable row level security;

revoke all on table public.heracles_strength_metrics from public;
revoke all on table public.heracles_strength_metrics from anon;
revoke all on table public.heracles_strength_metrics from authenticated;
grant select on table public.heracles_strength_metrics to authenticated;
grant select, insert, update on table public.heracles_strength_metrics to service_role;

drop policy if exists "Authorized user can read Heracles strength metrics" on public.heracles_strength_metrics;
create policy "Authorized user can read Heracles strength metrics"
on public.heracles_strength_metrics
for select
to authenticated
using (
  (select auth.uid()) = user_id
  and lower(coalesce((select auth.jwt()->>'email'), '')) = 'theneolorenzo@gmail.com'
);

create or replace function public.replace_heracles_strength_snapshot(
  p_snapshot jsonb,
  p_synced_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid;
  v_current_count integer;
  v_stale_count integer;
begin
  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'array' then
    raise exception using errcode = '22023', message = 'HERACLES_STRENGTH_SNAPSHOT_MUST_BE_ARRAY';
  end if;

  if p_synced_at is null then
    raise exception using errcode = '22023', message = 'HERACLES_STRENGTH_SYNC_TIME_REQUIRED';
  end if;

  select id
  into v_owner_id
  from auth.users
  where lower(email) = 'theneolorenzo@gmail.com'
  order by created_at asc
  limit 1;

  if v_owner_id is null then
    raise exception using errcode = '22023', message = 'KLEOS_OWNER_NOT_FOUND';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_snapshot) as incoming(
      exercise_id bigint,
      exercise_name text,
      best_1rm numeric,
      qualifying_sessions integer,
      achieved_on date,
      estimation_basis text
    )
    where incoming.exercise_id is null
       or incoming.exercise_name is null
       or btrim(incoming.exercise_name) = ''
       or incoming.best_1rm is null
       or incoming.best_1rm <= 0
       or incoming.qualifying_sessions is null
       or incoming.qualifying_sessions < 3
       or incoming.achieved_on is null
       or incoming.estimation_basis is distinct from 'observed_e1rm_high'
  ) then
    raise exception using errcode = '22023', message = 'HERACLES_STRENGTH_SNAPSHOT_INVALID';
  end if;

  if (
    select count(*)
    from jsonb_to_recordset(p_snapshot) as incoming(exercise_id bigint)
  ) <> (
    select count(distinct incoming.exercise_id)
    from jsonb_to_recordset(p_snapshot) as incoming(exercise_id bigint)
  ) then
    raise exception using errcode = '22023', message = 'HERACLES_STRENGTH_SNAPSHOT_DUPLICATE_EXERCISE';
  end if;

  update public.heracles_strength_metrics
  set is_current = false,
      last_checked_at = p_synced_at
  where user_id = v_owner_id;

  insert into public.heracles_strength_metrics (
    user_id,
    source_exercise_id,
    exercise_name,
    best_1rm,
    qualifying_sessions,
    achieved_on,
    estimation_basis,
    is_current,
    synced_at,
    last_checked_at,
    source
  )
  select
    v_owner_id,
    incoming.exercise_id,
    incoming.exercise_name,
    incoming.best_1rm,
    incoming.qualifying_sessions,
    incoming.achieved_on,
    incoming.estimation_basis,
    true,
    p_synced_at,
    p_synced_at,
    'heracles'
  from jsonb_to_recordset(p_snapshot) as incoming(
    exercise_id bigint,
    exercise_name text,
    best_1rm numeric,
    qualifying_sessions integer,
    achieved_on date,
    estimation_basis text
  )
  on conflict (user_id, source_exercise_id) do update
  set exercise_name = excluded.exercise_name,
      best_1rm = excluded.best_1rm,
      qualifying_sessions = excluded.qualifying_sessions,
      achieved_on = excluded.achieved_on,
      estimation_basis = excluded.estimation_basis,
      is_current = true,
      synced_at = excluded.synced_at,
      last_checked_at = excluded.last_checked_at,
      source = excluded.source;

  select count(*) filter (where is_current),
         count(*) filter (where not is_current)
  into v_current_count, v_stale_count
  from public.heracles_strength_metrics
  where user_id = v_owner_id;

  return jsonb_build_object(
    'current_count', v_current_count,
    'stale_count', v_stale_count,
    'synced_at', p_synced_at
  );
end;
$$;

comment on function public.replace_heracles_strength_snapshot(jsonb, timestamptz) is
  'Atomically replaces the current Heracles strength snapshot for the authorized Kleos owner. Missing exercises become stale rather than being deleted.';

revoke all on function public.replace_heracles_strength_snapshot(jsonb, timestamptz) from public;
revoke all on function public.replace_heracles_strength_snapshot(jsonb, timestamptz) from anon;
revoke all on function public.replace_heracles_strength_snapshot(jsonb, timestamptz) from authenticated;
grant execute on function public.replace_heracles_strength_snapshot(jsonb, timestamptz) to service_role;

comment on table public.goat_strength_lifts is
  'Deprecated legacy manual strength history. Kleos no longer uses this table as canonical strength evidence; Heracles strength metrics replace it.';

update public.kleos_evidence_sources
set enabled = false,
    updated_at = now()
where group_key = 'goat_strength_lifts';

insert into public.kleos_evidence_sources (group_key, relation_name, enabled)
values ('heracles_strength_metrics', 'public.heracles_strength_metrics'::regclass, true)
on conflict (group_key) do update
set relation_name = excluded.relation_name,
    enabled = excluded.enabled,
    updated_at = now();

commit;

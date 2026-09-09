begin;

alter table public.heracles_strength_metrics
  add column if not exists equipment_name text;

comment on column public.heracles_strength_metrics.equipment_name is
  'Historical Heracles equipment-name snapshot attached to the set that produced the stored best_1rm. Null only when the source session did not record equipment.';

create or replace function public.replace_heracles_strength_snapshot(
  p_user_id uuid,
  p_snapshot jsonb,
  p_synced_at timestamptz default now()
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_current_count integer;
  v_stale_count integer;
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'KLEOS_OWNER_REQUIRED';
  end if;

  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'array' then
    raise exception using errcode = '22023', message = 'HERACLES_STRENGTH_SNAPSHOT_MUST_BE_ARRAY';
  end if;

  if p_synced_at is null then
    raise exception using errcode = '22023', message = 'HERACLES_STRENGTH_SYNC_TIME_REQUIRED';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_snapshot) as incoming(
      exercise_id bigint,
      exercise_name text,
      equipment_name text,
      best_1rm numeric,
      qualifying_sessions integer,
      achieved_on date,
      estimation_basis text
    )
    where incoming.exercise_id is null
       or incoming.exercise_name is null
       or btrim(incoming.exercise_name) = ''
       or incoming.equipment_name is not null and btrim(incoming.equipment_name) = ''
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
  where user_id = p_user_id;

  insert into public.heracles_strength_metrics (
    user_id,
    source_exercise_id,
    exercise_name,
    equipment_name,
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
    p_user_id,
    incoming.exercise_id,
    incoming.exercise_name,
    incoming.equipment_name,
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
    equipment_name text,
    best_1rm numeric,
    qualifying_sessions integer,
    achieved_on date,
    estimation_basis text
  )
  on conflict (user_id, source_exercise_id) do update
  set exercise_name = excluded.exercise_name,
      equipment_name = excluded.equipment_name,
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
  where user_id = p_user_id;

  return jsonb_build_object(
    'current_count', v_current_count,
    'stale_count', v_stale_count,
    'synced_at', p_synced_at
  );
end;
$$;

revoke all on function public.replace_heracles_strength_snapshot(uuid, jsonb, timestamptz) from public;
revoke all on function public.replace_heracles_strength_snapshot(uuid, jsonb, timestamptz) from anon;
revoke all on function public.replace_heracles_strength_snapshot(uuid, jsonb, timestamptz) from authenticated;
grant execute on function public.replace_heracles_strength_snapshot(uuid, jsonb, timestamptz) to service_role;

commit;

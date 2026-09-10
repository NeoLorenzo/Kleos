begin;

alter table public.heracles_strength_metrics
  add column if not exists body_weight_kg_at_achieved numeric,
  add column if not exists body_weight_kind text,
  add column if not exists best_1rm_relative_bw numeric;

alter table public.heracles_strength_metrics
  add constraint heracles_strength_metrics_body_weight_kg_check
    check (body_weight_kg_at_achieved is null or body_weight_kg_at_achieved > 0),
  add constraint heracles_strength_metrics_body_weight_kind_check
    check (body_weight_kind is null or body_weight_kind in ('measured', 'interpolated')),
  add constraint heracles_strength_metrics_relative_bw_check
    check (best_1rm_relative_bw is null or best_1rm_relative_bw > 0),
  add constraint heracles_strength_metrics_relative_fields_check
    check (
      ((body_weight_kg_at_achieved is null) = (body_weight_kind is null))
      and ((body_weight_kg_at_achieved is null) = (best_1rm_relative_bw is null))
    );

comment on column public.heracles_strength_metrics.body_weight_kg_at_achieved is
  'Heracles body weight in kilograms resolved for the workout date that produced best_1rm. Null when that date is outside body-weight coverage.';
comment on column public.heracles_strength_metrics.body_weight_kind is
  'Heracles provenance for body_weight_kg_at_achieved: measured or interpolated. Null when workout-date body weight is unavailable.';
comment on column public.heracles_strength_metrics.best_1rm_relative_bw is
  'Dimensionless best_1rm divided by body_weight_kg_at_achieved for the same winning set/date. Null when workout-date body weight is unavailable.';

alter table public.goat_strength_profile
  add column if not exists body_weight_measured_on date;

comment on column public.goat_strength_profile.body_weight_kg is
  'Latest canonical body weight synchronized read-only from Heracles. Ordinary authenticated Kleos clients cannot write this column.';
comment on column public.goat_strength_profile.body_weight_measured_on is
  'Calendar date of the latest canonical body-weight daily representative synchronized from Heracles.';

revoke all on table public.goat_strength_profile from authenticated;
grant select on table public.goat_strength_profile to authenticated;
grant insert (user_id, height_cm, updated_at) on table public.goat_strength_profile to authenticated;
grant update (height_cm, updated_at) on table public.goat_strength_profile to authenticated;

drop function if exists public.replace_heracles_strength_snapshot(uuid, jsonb, timestamptz);

create function public.replace_heracles_strength_snapshot(
  p_user_id uuid,
  p_snapshot jsonb,
  p_current_body_weight jsonb,
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
  v_current_body_weight_kg numeric;
  v_current_body_weight_measured_on date;
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

  if p_current_body_weight is not null then
    if jsonb_typeof(p_current_body_weight) <> 'object' then
      raise exception using errcode = '22023', message = 'HERACLES_CURRENT_BODY_WEIGHT_INVALID';
    end if;

    select incoming.weight_kg, incoming.measured_on
    into v_current_body_weight_kg, v_current_body_weight_measured_on
    from jsonb_to_record(p_current_body_weight) as incoming(
      weight_kg numeric,
      measured_on date
    );

    if v_current_body_weight_kg is null
      or v_current_body_weight_kg <= 0
      or v_current_body_weight_measured_on is null then
      raise exception using errcode = '22023', message = 'HERACLES_CURRENT_BODY_WEIGHT_INVALID';
    end if;
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_snapshot) as incoming(
      exercise_id bigint,
      exercise_name text,
      equipment_name text,
      best_1rm numeric,
      body_weight_kg_at_achieved numeric,
      body_weight_kind text,
      best_1rm_relative_bw numeric,
      qualifying_sessions integer,
      achieved_on date,
      estimation_basis text
    )
    where incoming.exercise_id is null
       or incoming.exercise_name is null
       or btrim(incoming.exercise_name) = ''
       or (incoming.equipment_name is not null and btrim(incoming.equipment_name) = '')
       or incoming.best_1rm is null
       or incoming.best_1rm <= 0
       or incoming.qualifying_sessions is null
       or incoming.qualifying_sessions < 3
       or incoming.achieved_on is null
       or incoming.estimation_basis is distinct from 'observed_e1rm_high'
       or incoming.body_weight_kg_at_achieved <= 0
       or incoming.best_1rm_relative_bw <= 0
       or incoming.body_weight_kind not in ('measured', 'interpolated')
       or ((incoming.body_weight_kg_at_achieved is null) <> (incoming.body_weight_kind is null))
       or ((incoming.body_weight_kg_at_achieved is null) <> (incoming.best_1rm_relative_bw is null))
       or (
         incoming.best_1rm_relative_bw is not null
         and abs(
           incoming.best_1rm_relative_bw
           - (incoming.best_1rm / incoming.body_weight_kg_at_achieved)
         ) > 0.000001
       )
  ) then
    raise exception using errcode = '22023', message = 'HERACLES_STRENGTH_SNAPSHOT_INVALID';
  end if;

  if (
    select count(*) from jsonb_to_recordset(p_snapshot) as incoming(exercise_id bigint)
  ) <> (
    select count(distinct incoming.exercise_id) from jsonb_to_recordset(p_snapshot) as incoming(exercise_id bigint)
  ) then
    raise exception using errcode = '22023', message = 'HERACLES_STRENGTH_SNAPSHOT_DUPLICATE_EXERCISE';
  end if;

  insert into public.goat_strength_profile (
    user_id,
    body_weight_kg,
    body_weight_measured_on,
    updated_at
  )
  values (
    p_user_id,
    v_current_body_weight_kg,
    v_current_body_weight_measured_on,
    p_synced_at
  )
  on conflict (user_id) do update
  set body_weight_kg = excluded.body_weight_kg,
      body_weight_measured_on = excluded.body_weight_measured_on,
      updated_at = excluded.updated_at;

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
    body_weight_kg_at_achieved,
    body_weight_kind,
    best_1rm_relative_bw,
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
    incoming.body_weight_kg_at_achieved,
    incoming.body_weight_kind,
    incoming.best_1rm_relative_bw,
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
    body_weight_kg_at_achieved numeric,
    body_weight_kind text,
    best_1rm_relative_bw numeric,
    qualifying_sessions integer,
    achieved_on date,
    estimation_basis text
  )
  on conflict (user_id, source_exercise_id) do update
  set exercise_name = excluded.exercise_name,
      equipment_name = excluded.equipment_name,
      best_1rm = excluded.best_1rm,
      body_weight_kg_at_achieved = excluded.body_weight_kg_at_achieved,
      body_weight_kind = excluded.body_weight_kind,
      best_1rm_relative_bw = excluded.best_1rm_relative_bw,
      qualifying_sessions = excluded.qualifying_sessions,
      achieved_on = excluded.achieved_on,
      estimation_basis = excluded.estimation_basis,
      is_current = true,
      synced_at = excluded.synced_at,
      last_checked_at = excluded.last_checked_at,
      source = excluded.source;

  select count(*) filter (where is_current), count(*) filter (where not is_current)
  into v_current_count, v_stale_count
  from public.heracles_strength_metrics
  where user_id = p_user_id;

  return jsonb_build_object(
    'current_count', v_current_count,
    'stale_count', v_stale_count,
    'body_weight_kg', v_current_body_weight_kg,
    'body_weight_measured_on', v_current_body_weight_measured_on,
    'synced_at', p_synced_at
  );
end;
$$;

revoke all on function public.replace_heracles_strength_snapshot(uuid, jsonb, jsonb, timestamptz) from public;
revoke all on function public.replace_heracles_strength_snapshot(uuid, jsonb, jsonb, timestamptz) from anon;
revoke all on function public.replace_heracles_strength_snapshot(uuid, jsonb, jsonb, timestamptz) from authenticated;
grant execute on function public.replace_heracles_strength_snapshot(uuid, jsonb, jsonb, timestamptz) to service_role;

commit;

-- Kleos #16: privileged Kleos Bot persistence for ChatGPT/Supabase admin execution.
-- Normal browser/authenticated writes continue to use the owner-authenticated RPCs.

create or replace function public.create_kleos_bot_snapshot_admin(
  p_evaluated_at timestamptz,
  p_methodology_version text,
  p_execution_key text,
  p_results jsonb,
  p_overall_score numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_owner_id uuid;
  v_existing_id uuid;
  v_snapshot_id uuid;
  v_execution_key text;
  v_result_count integer;
  v_distinct_vector_count integer;
begin
  -- This entry point is only for direct privileged SQL execution. PostgREST/API
  -- requests run under authenticator and must not be able to invoke it.
  if session_user <> 'postgres' then
    raise exception 'KLEOS_BOT_ADMIN_NOT_AUTHORIZED';
  end if;

  select id
  into v_owner_id
  from auth.users
  where lower(email) = 'theneolorenzo@gmail.com'
  order by created_at asc
  limit 1;

  if v_owner_id is null then
    raise exception 'KLEOS_BOT_OWNER_NOT_FOUND';
  end if;

  if p_evaluated_at is null then
    raise exception 'KLEOS_BOT_EVALUATED_AT_REQUIRED';
  end if;
  if length(btrim(coalesce(p_methodology_version, ''))) = 0 then
    raise exception 'KLEOS_BOT_METHODOLOGY_REQUIRED';
  end if;
  if p_overall_score is not null and (p_overall_score < 0 or p_overall_score > 100) then
    raise exception 'KLEOS_BOT_OVERALL_SCORE_INVALID';
  end if;

  v_execution_key := btrim(coalesce(p_execution_key, ''));
  if length(v_execution_key) = 0 then
    raise exception 'KLEOS_BOT_EXECUTION_KEY_REQUIRED';
  end if;
  if length(v_execution_key) > 120 then
    raise exception 'KLEOS_BOT_EXECUTION_KEY_TOO_LONG';
  end if;

  if jsonb_typeof(p_results) <> 'array' then
    raise exception 'KLEOS_VECTOR_SNAPSHOT_RESULTS_MUST_BE_ARRAY';
  end if;

  select count(*), count(distinct result->>'vector_id')
  into v_result_count, v_distinct_vector_count
  from jsonb_array_elements(p_results) result;

  if v_result_count <> 8 or v_distinct_vector_count <> 8 then
    raise exception 'KLEOS_VECTOR_SNAPSHOT_REQUIRES_EIGHT_DISTINCT_VECTORS';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_results) result
    where coalesce(result->>'vector_id', '') not in (
      'physical',
      'psychological',
      'intellectual',
      'professional',
      'financial',
      'relational',
      'creative',
      'experiential'
    )
  ) then
    raise exception 'KLEOS_VECTOR_SNAPSHOT_VECTOR_INVALID';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_results) result
    where length(btrim(coalesce(result->>'commentary', ''))) = 0
  ) then
    raise exception 'KLEOS_VECTOR_SNAPSHOT_COMMENTARY_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_owner_id::text || ':kleos-bot:' || v_execution_key, 0)
  );

  select id
  into v_existing_id
  from public.kleos_vector_snapshots
  where user_id = v_owner_id
    and evaluator = 'kleos-bot'
    and execution_key = v_execution_key
  order by created_at desc
  limit 1;

  if v_existing_id is not null then
    return jsonb_build_object('snapshot_id', v_existing_id, 'created', false);
  end if;

  insert into public.kleos_vector_snapshots (
    user_id,
    evaluated_at,
    evaluator,
    methodology_version,
    overall_score,
    execution_key
  ) values (
    v_owner_id,
    p_evaluated_at,
    'kleos-bot',
    btrim(p_methodology_version),
    p_overall_score,
    v_execution_key
  )
  returning id into v_snapshot_id;

  insert into public.kleos_vector_snapshot_results (
    snapshot_id,
    vector_id,
    status,
    score,
    confidence,
    commentary
  )
  select
    v_snapshot_id,
    result->>'vector_id',
    result->>'status',
    case
      when result ? 'score' and nullif(result->>'score', '') is not null
        then (result->>'score')::numeric
      else null
    end,
    result->>'confidence',
    btrim(result->>'commentary')
  from jsonb_array_elements(p_results) result;

  return jsonb_build_object('snapshot_id', v_snapshot_id, 'created', true);
end;
$$;

revoke all on function public.create_kleos_bot_snapshot_admin(timestamptz, text, text, jsonb, numeric) from public;
revoke all on function public.create_kleos_bot_snapshot_admin(timestamptz, text, text, jsonb, numeric) from anon;
revoke all on function public.create_kleos_bot_snapshot_admin(timestamptz, text, text, jsonb, numeric) from authenticated;
revoke all on function public.create_kleos_bot_snapshot_admin(timestamptz, text, text, jsonb, numeric) from service_role;

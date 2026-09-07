-- Kleos #14: remove scheduling policy from Kleos Bot persistence.
-- The previous weekly run_key is replaced by a per-execution idempotency key.

alter table public.kleos_vector_snapshots
rename column run_key to execution_key;

alter index if exists public.kleos_vector_snapshots_run_key_idx
rename to kleos_vector_snapshots_execution_key_idx;

create or replace function public.create_kleos_bot_snapshot(
  p_evaluated_at timestamptz,
  p_methodology_version text,
  p_execution_key text,
  p_results jsonb,
  p_overall_score numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing_id uuid;
  v_snapshot_id uuid;
  v_execution_key text;
begin
  if auth.uid() is null
    or lower(coalesce(auth.jwt()->>'email', '')) <> 'theneolorenzo@gmail.com' then
    raise exception 'KLEOS_BOT_NOT_AUTHORIZED';
  end if;

  v_execution_key := btrim(coalesce(p_execution_key, ''));
  if length(v_execution_key) = 0 then
    raise exception 'KLEOS_BOT_EXECUTION_KEY_REQUIRED';
  end if;
  if length(v_execution_key) > 120 then
    raise exception 'KLEOS_BOT_EXECUTION_KEY_TOO_LONG';
  end if;

  -- Serialize only retries of the exact same execution. Distinct executions,
  -- even seconds apart, are intentionally independent snapshots.
  perform pg_advisory_xact_lock(
    hashtextextended(auth.uid()::text || ':kleos-bot:' || v_execution_key, 0)
  );

  select id
  into v_existing_id
  from public.kleos_vector_snapshots
  where user_id = auth.uid()
    and evaluator = 'kleos-bot'
    and execution_key = v_execution_key
  order by created_at desc
  limit 1;

  if v_existing_id is not null then
    return jsonb_build_object('snapshot_id', v_existing_id, 'created', false);
  end if;

  v_snapshot_id := public.create_kleos_vector_snapshot(
    p_evaluated_at,
    'kleos-bot',
    p_methodology_version,
    p_results,
    p_overall_score
  );

  update public.kleos_vector_snapshots
  set execution_key = v_execution_key
  where id = v_snapshot_id;

  return jsonb_build_object('snapshot_id', v_snapshot_id, 'created', true);
end;
$$;

revoke all on function public.create_kleos_bot_snapshot(timestamptz, text, text, jsonb, numeric) from public;
revoke all on function public.create_kleos_bot_snapshot(timestamptz, text, text, jsonb, numeric) from anon;
grant execute on function public.create_kleos_bot_snapshot(timestamptz, text, text, jsonb, numeric) to authenticated;

revoke all on function public.create_kleos_bot_weekly_snapshot(timestamptz, text, text, jsonb, numeric) from public;
revoke all on function public.create_kleos_bot_weekly_snapshot(timestamptz, text, text, jsonb, numeric) from anon;
revoke all on function public.create_kleos_bot_weekly_snapshot(timestamptz, text, text, jsonb, numeric) from authenticated;
drop function if exists public.create_kleos_bot_weekly_snapshot(timestamptz, text, text, jsonb, numeric);

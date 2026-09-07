-- Kleos #5: idempotent weekly Kleos Bot snapshot writes.

alter table public.kleos_vector_snapshots
add column if not exists run_key text null;

create unique index if not exists kleos_vector_snapshots_run_key_idx
on public.kleos_vector_snapshots (user_id, evaluator, run_key)
where run_key is not null;

create or replace function public.create_kleos_bot_weekly_snapshot(
  p_evaluated_at timestamptz,
  p_methodology_version text,
  p_run_key text,
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
begin
  if auth.uid() is null
    or lower(coalesce(auth.jwt()->>'email', '')) <> 'theneolorenzo@gmail.com' then
    raise exception 'KLEOS_BOT_NOT_AUTHORIZED';
  end if;

  if length(btrim(coalesce(p_run_key, ''))) = 0 then
    raise exception 'KLEOS_BOT_RUN_KEY_REQUIRED';
  end if;
  if length(p_run_key) > 120 then
    raise exception 'KLEOS_BOT_RUN_KEY_TOO_LONG';
  end if;

  -- Serialize retries for the same user/week/methodology before checking for an existing snapshot.
  perform pg_advisory_xact_lock(
    hashtextextended(auth.uid()::text || ':kleos-bot:' || btrim(p_run_key), 0)
  );

  select id
  into v_existing_id
  from public.kleos_vector_snapshots
  where user_id = auth.uid()
    and evaluator = 'kleos-bot'
    and run_key = btrim(p_run_key)
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
  set run_key = btrim(p_run_key)
  where id = v_snapshot_id;

  return jsonb_build_object('snapshot_id', v_snapshot_id, 'created', true);
end;
$$;

revoke all on function public.create_kleos_bot_weekly_snapshot(timestamptz, text, text, jsonb, numeric) from public;
revoke all on function public.create_kleos_bot_weekly_snapshot(timestamptz, text, text, jsonb, numeric) from anon;
grant execute on function public.create_kleos_bot_weekly_snapshot(timestamptz, text, text, jsonb, numeric) to authenticated;

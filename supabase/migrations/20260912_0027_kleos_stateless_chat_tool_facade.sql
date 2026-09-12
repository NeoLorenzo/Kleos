-- Kleos #68: neutral tool-facing facade for stateless ChatGPT/Supabase execution.
-- These wrappers do not broaden database access. They remain callable only from
-- the connected Supabase management SQL session (session_user = postgres) and
-- delegate to the existing canonical evidence reader and snapshot writer.

create or replace function public.get_kleos_evaluation_evidence()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if session_user <> 'postgres' then
    raise exception 'KLEOS_TOOL_NOT_AUTHORIZED';
  end if;

  return public.get_kleos_bot_evaluation_evidence_admin();
end;
$$;

revoke all on function public.get_kleos_evaluation_evidence() from public;
revoke all on function public.get_kleos_evaluation_evidence() from anon;
revoke all on function public.get_kleos_evaluation_evidence() from authenticated;
revoke all on function public.get_kleos_evaluation_evidence() from service_role;

create or replace function public.persist_kleos_evaluation(
  p_execution_key text,
  p_results jsonb,
  p_overall_score numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if session_user <> 'postgres' then
    raise exception 'KLEOS_TOOL_NOT_AUTHORIZED';
  end if;

  return public.create_kleos_bot_snapshot_admin(
    now(),
    '1.0.0',
    p_execution_key,
    p_results,
    p_overall_score
  );
end;
$$;

revoke all on function public.persist_kleos_evaluation(text, jsonb, numeric) from public;
revoke all on function public.persist_kleos_evaluation(text, jsonb, numeric) from anon;
revoke all on function public.persist_kleos_evaluation(text, jsonb, numeric) from authenticated;
revoke all on function public.persist_kleos_evaluation(text, jsonb, numeric) from service_role;

-- Kleos #18: privileged Kleos Bot evidence retrieval for ChatGPT/Supabase admin execution.
-- This function is intentionally unavailable to PostgREST/API roles and may be
-- invoked only through the connected privileged SQL path running as postgres.

create or replace function public.get_kleos_bot_evidence_admin()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_owner_id uuid;
  v_payload jsonb;
begin
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

  select jsonb_build_object(
    'goat_strength_lifts', coalesce((
      select jsonb_agg(to_jsonb(t) - 'user_id' order by t.performed_at nulls last, t.created_at nulls last)
      from public.goat_strength_lifts t
      where t.user_id = v_owner_id
    ), '[]'::jsonb),
    'goat_strength_profile', coalesce((
      select jsonb_agg(to_jsonb(t) - 'user_id' order by t.updated_at nulls last)
      from public.goat_strength_profile t
      where t.user_id = v_owner_id
    ), '[]'::jsonb),
    'goat_cognitive_tests', coalesce((
      select jsonb_agg(to_jsonb(t) - 'user_id' order by t.taken_at nulls last, t.created_at nulls last)
      from public.goat_cognitive_tests t
      where t.user_id = v_owner_id
    ), '[]'::jsonb),
    'goat_academic_stage_results', coalesce((
      select jsonb_agg(to_jsonb(t) - 'user_id' order by t.stage nulls last, t.created_at nulls last)
      from public.goat_academic_stage_results t
      where t.user_id = v_owner_id
    ), '[]'::jsonb),
    'goat_academic_module_results', coalesce((
      select jsonb_agg(to_jsonb(t) - 'user_id' order by t.stage nulls last, t.created_at nulls last)
      from public.goat_academic_module_results t
      where t.user_id = v_owner_id
    ), '[]'::jsonb),
    'goat_academic_notes', coalesce((
      select jsonb_agg(to_jsonb(t) - 'user_id' order by t.updated_at nulls last)
      from public.goat_academic_notes t
      where t.user_id = v_owner_id
    ), '[]'::jsonb),
    'goat_health_characteristics', coalesce((
      select jsonb_agg(to_jsonb(t) - 'user_id' order by t.updated_at nulls last)
      from public.goat_health_characteristics t
      where t.user_id = v_owner_id
    ), '[]'::jsonb),
    'goat_cv_characteristics', coalesce((
      select jsonb_agg(to_jsonb(t) - 'user_id' order by t.updated_at nulls last)
      from public.goat_cv_characteristics t
      where t.user_id = v_owner_id
    ), '[]'::jsonb),
    'goat_immutable_characteristics', coalesce((
      select jsonb_agg(to_jsonb(t) - 'user_id' order by t.updated_at nulls last)
      from public.goat_immutable_characteristics t
      where t.user_id = v_owner_id
    ), '[]'::jsonb),
    'goat_misc_characteristics', coalesce((
      select jsonb_agg(to_jsonb(t) - 'user_id' order by t.updated_at nulls last)
      from public.goat_misc_characteristics t
      where t.user_id = v_owner_id
    ), '[]'::jsonb)
  ) into v_payload;

  return v_payload;
end;
$$;

revoke all on function public.get_kleos_bot_evidence_admin() from public;
revoke all on function public.get_kleos_bot_evidence_admin() from anon;
revoke all on function public.get_kleos_bot_evidence_admin() from authenticated;
revoke all on function public.get_kleos_bot_evidence_admin() from service_role;

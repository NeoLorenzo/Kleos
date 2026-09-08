create table if not exists public.kleos_evidence_sources (
  group_key text primary key,
  relation_name regclass not null unique,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kleos_evidence_sources_group_key_format
    check (group_key ~ '^[a-z][a-z0-9_]*$')
);

comment on table public.kleos_evidence_sources is
  'Server-side whitelist of canonical raw evidence relations exposed to Kleos Bot.';

alter table public.kleos_evidence_sources enable row level security;

revoke all on table public.kleos_evidence_sources from public;
revoke all on table public.kleos_evidence_sources from anon;
revoke all on table public.kleos_evidence_sources from authenticated;
revoke all on table public.kleos_evidence_sources from service_role;

insert into public.kleos_evidence_sources (group_key, relation_name, enabled)
values
  ('goat_strength_lifts', 'public.goat_strength_lifts'::regclass, true),
  ('goat_strength_profile', 'public.goat_strength_profile'::regclass, true),
  ('goat_cognitive_tests', 'public.goat_cognitive_tests'::regclass, true),
  ('goat_big_five_assessments', 'public.goat_big_five_assessments'::regclass, true),
  ('goat_academic_stage_results', 'public.goat_academic_stage_results'::regclass, true),
  ('goat_academic_module_results', 'public.goat_academic_module_results'::regclass, true),
  ('goat_academic_notes', 'public.goat_academic_notes'::regclass, true),
  ('goat_health_characteristics', 'public.goat_health_characteristics'::regclass, true),
  ('goat_cv_characteristics', 'public.goat_cv_characteristics'::regclass, true),
  ('goat_immutable_characteristics', 'public.goat_immutable_characteristics'::regclass, true),
  ('goat_misc_characteristics', 'public.goat_misc_characteristics'::regclass, true)
on conflict (group_key) do update
set relation_name = excluded.relation_name,
    enabled = excluded.enabled,
    updated_at = now();

create or replace function public.get_kleos_bot_evidence_admin()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_owner_id uuid;
  v_payload jsonb := '{}'::jsonb;
  v_source record;
  v_rows jsonb;
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

  for v_source in
    select group_key, relation_name
    from public.kleos_evidence_sources
    where enabled
    order by group_key
  loop
    execute format(
      'select coalesce(jsonb_agg(row_data order by row_data::text), ''[]''::jsonb)
       from (
         select to_jsonb(t) - ''user_id'' as row_data
         from %s t
         where t.user_id = $1
       ) evidence_rows',
      v_source.relation_name
    )
    into v_rows
    using v_owner_id;

    v_payload := v_payload || jsonb_build_object(v_source.group_key, v_rows);
  end loop;

  return v_payload;
end;
$$;

revoke all on function public.get_kleos_bot_evidence_admin() from public;
revoke all on function public.get_kleos_bot_evidence_admin() from anon;
revoke all on function public.get_kleos_bot_evidence_admin() from authenticated;
revoke all on function public.get_kleos_bot_evidence_admin() from service_role;

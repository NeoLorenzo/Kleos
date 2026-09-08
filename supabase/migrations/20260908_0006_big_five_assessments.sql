-- Kleos #26: structured Big Five assessments with true test dates.
-- Stores only the canonical numeric results and the date the test was actually taken.

create table if not exists public.goat_big_five_assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  test_date date not null,

  neuroticism_score numeric(8, 2) not null check (neuroticism_score >= 0),
  anxiety_score numeric(8, 2) not null check (anxiety_score >= 0),
  anger_score numeric(8, 2) not null check (anger_score >= 0),
  depression_score numeric(8, 2) not null check (depression_score >= 0),
  self_consciousness_score numeric(8, 2) not null check (self_consciousness_score >= 0),
  immoderation_score numeric(8, 2) not null check (immoderation_score >= 0),
  vulnerability_score numeric(8, 2) not null check (vulnerability_score >= 0),

  extraversion_score numeric(8, 2) not null check (extraversion_score >= 0),
  friendliness_score numeric(8, 2) not null check (friendliness_score >= 0),
  gregariousness_score numeric(8, 2) not null check (gregariousness_score >= 0),
  assertiveness_score numeric(8, 2) not null check (assertiveness_score >= 0),
  activity_level_score numeric(8, 2) not null check (activity_level_score >= 0),
  excitement_seeking_score numeric(8, 2) not null check (excitement_seeking_score >= 0),
  cheerfulness_score numeric(8, 2) not null check (cheerfulness_score >= 0),

  openness_score numeric(8, 2) not null check (openness_score >= 0),
  imagination_score numeric(8, 2) not null check (imagination_score >= 0),
  artistic_interests_score numeric(8, 2) not null check (artistic_interests_score >= 0),
  emotionality_score numeric(8, 2) not null check (emotionality_score >= 0),
  adventurousness_score numeric(8, 2) not null check (adventurousness_score >= 0),
  intellect_score numeric(8, 2) not null check (intellect_score >= 0),
  liberalism_score numeric(8, 2) not null check (liberalism_score >= 0),

  agreeableness_score numeric(8, 2) not null check (agreeableness_score >= 0),
  trust_score numeric(8, 2) not null check (trust_score >= 0),
  morality_score numeric(8, 2) not null check (morality_score >= 0),
  altruism_score numeric(8, 2) not null check (altruism_score >= 0),
  cooperation_score numeric(8, 2) not null check (cooperation_score >= 0),
  modesty_score numeric(8, 2) not null check (modesty_score >= 0),
  sympathy_score numeric(8, 2) not null check (sympathy_score >= 0),

  conscientiousness_score numeric(8, 2) not null check (conscientiousness_score >= 0),
  self_efficacy_score numeric(8, 2) not null check (self_efficacy_score >= 0),
  orderliness_score numeric(8, 2) not null check (orderliness_score >= 0),
  dutifulness_score numeric(8, 2) not null check (dutifulness_score >= 0),
  achievement_striving_score numeric(8, 2) not null check (achievement_striving_score >= 0),
  self_discipline_score numeric(8, 2) not null check (self_discipline_score >= 0),
  cautiousness_score numeric(8, 2) not null check (cautiousness_score >= 0),

  created_at timestamptz not null default now()
);

create index if not exists goat_big_five_assessments_user_date_idx
on public.goat_big_five_assessments (user_id, test_date desc, created_at desc);

alter table public.goat_big_five_assessments enable row level security;

grant select, insert, update, delete on table public.goat_big_five_assessments to authenticated;
revoke all on table public.goat_big_five_assessments from anon;

drop policy if exists "Authorized user can read goat big five assessments"
on public.goat_big_five_assessments;
create policy "Authorized user can read goat big five assessments"
on public.goat_big_five_assessments
for select to authenticated
using (
  auth.uid() = user_id
  and lower(coalesce(auth.jwt()->>'email', '')) = 'theneolorenzo@gmail.com'
);

drop policy if exists "Authorized user can write goat big five assessments"
on public.goat_big_five_assessments;
create policy "Authorized user can write goat big five assessments"
on public.goat_big_five_assessments
for all to authenticated
using (
  auth.uid() = user_id
  and lower(coalesce(auth.jwt()->>'email', '')) = 'theneolorenzo@gmail.com'
)
with check (
  auth.uid() = user_id
  and lower(coalesce(auth.jwt()->>'email', '')) = 'theneolorenzo@gmail.com'
);

-- Privileged ingestion path for the connected ChatGPT/Supabase admin workflow.
-- The payload intentionally has no prose, external result ID, or import timestamp fields.
create or replace function public.insert_kleos_big_five_assessment_admin(p_assessment jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_owner_id uuid;
  v_assessment_id uuid;
begin
  if session_user <> 'postgres' then
    raise exception 'KLEOS_BIG_FIVE_ADMIN_NOT_AUTHORIZED';
  end if;

  select id
  into v_owner_id
  from auth.users
  where lower(email) = 'theneolorenzo@gmail.com'
  order by created_at asc
  limit 1;

  if v_owner_id is null then
    raise exception 'KLEOS_BIG_FIVE_OWNER_NOT_FOUND';
  end if;

  insert into public.goat_big_five_assessments (
    user_id,
    test_date,
    neuroticism_score,
    anxiety_score,
    anger_score,
    depression_score,
    self_consciousness_score,
    immoderation_score,
    vulnerability_score,
    extraversion_score,
    friendliness_score,
    gregariousness_score,
    assertiveness_score,
    activity_level_score,
    excitement_seeking_score,
    cheerfulness_score,
    openness_score,
    imagination_score,
    artistic_interests_score,
    emotionality_score,
    adventurousness_score,
    intellect_score,
    liberalism_score,
    agreeableness_score,
    trust_score,
    morality_score,
    altruism_score,
    cooperation_score,
    modesty_score,
    sympathy_score,
    conscientiousness_score,
    self_efficacy_score,
    orderliness_score,
    dutifulness_score,
    achievement_striving_score,
    self_discipline_score,
    cautiousness_score
  )
  values (
    v_owner_id,
    (p_assessment->>'test_date')::date,
    (p_assessment->>'neuroticism_score')::numeric,
    (p_assessment->>'anxiety_score')::numeric,
    (p_assessment->>'anger_score')::numeric,
    (p_assessment->>'depression_score')::numeric,
    (p_assessment->>'self_consciousness_score')::numeric,
    (p_assessment->>'immoderation_score')::numeric,
    (p_assessment->>'vulnerability_score')::numeric,
    (p_assessment->>'extraversion_score')::numeric,
    (p_assessment->>'friendliness_score')::numeric,
    (p_assessment->>'gregariousness_score')::numeric,
    (p_assessment->>'assertiveness_score')::numeric,
    (p_assessment->>'activity_level_score')::numeric,
    (p_assessment->>'excitement_seeking_score')::numeric,
    (p_assessment->>'cheerfulness_score')::numeric,
    (p_assessment->>'openness_score')::numeric,
    (p_assessment->>'imagination_score')::numeric,
    (p_assessment->>'artistic_interests_score')::numeric,
    (p_assessment->>'emotionality_score')::numeric,
    (p_assessment->>'adventurousness_score')::numeric,
    (p_assessment->>'intellect_score')::numeric,
    (p_assessment->>'liberalism_score')::numeric,
    (p_assessment->>'agreeableness_score')::numeric,
    (p_assessment->>'trust_score')::numeric,
    (p_assessment->>'morality_score')::numeric,
    (p_assessment->>'altruism_score')::numeric,
    (p_assessment->>'cooperation_score')::numeric,
    (p_assessment->>'modesty_score')::numeric,
    (p_assessment->>'sympathy_score')::numeric,
    (p_assessment->>'conscientiousness_score')::numeric,
    (p_assessment->>'self_efficacy_score')::numeric,
    (p_assessment->>'orderliness_score')::numeric,
    (p_assessment->>'dutifulness_score')::numeric,
    (p_assessment->>'achievement_striving_score')::numeric,
    (p_assessment->>'self_discipline_score')::numeric,
    (p_assessment->>'cautiousness_score')::numeric
  )
  returning id into v_assessment_id;

  return v_assessment_id;
end;
$$;

revoke all on function public.insert_kleos_big_five_assessment_admin(jsonb) from public;
revoke all on function public.insert_kleos_big_five_assessment_admin(jsonb) from anon;
revoke all on function public.insert_kleos_big_five_assessment_admin(jsonb) from authenticated;
revoke all on function public.insert_kleos_big_five_assessment_admin(jsonb) from service_role;

-- Keep Big Five records available to Kleos Bot as raw canonical evidence.
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
    'goat_big_five_assessments', coalesce((
      select jsonb_agg(to_jsonb(t) - 'user_id' order by t.test_date nulls last, t.created_at nulls last)
      from public.goat_big_five_assessments t
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

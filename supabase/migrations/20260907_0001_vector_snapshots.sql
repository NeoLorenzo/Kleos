-- Kleos #4: canonical eight-vector current-state snapshots.
--
-- This migration is additive. Existing goat_* raw evidence and legacy GOAT-score history are
-- deliberately left unchanged.

create table if not exists public.kleos_vector_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  evaluated_at timestamptz not null,
  evaluator text not null check (length(btrim(evaluator)) > 0),
  methodology_version text not null check (length(btrim(methodology_version)) > 0),
  overall_score numeric(5, 2) null check (overall_score is null or (overall_score >= 0 and overall_score <= 100)),
  created_at timestamptz not null default now()
);

create table if not exists public.kleos_vector_snapshot_results (
  snapshot_id uuid not null references public.kleos_vector_snapshots(id) on delete cascade,
  vector_id text not null check (vector_id in (
    'physical',
    'psychological',
    'intellectual',
    'professional',
    'financial',
    'relational',
    'creative',
    'experiential'
  )),
  status text not null check (status in ('assessed', 'unknown')),
  score numeric(5, 2) null check (score is null or (score >= 0 and score <= 100)),
  confidence text not null check (confidence in ('low', 'medium', 'high', 'unknown')),
  commentary text not null check (length(btrim(commentary)) > 0),
  primary key (snapshot_id, vector_id),
  check (
    (status = 'assessed' and score is not null and confidence in ('low', 'medium', 'high'))
    or
    (status = 'unknown' and score is null and confidence = 'unknown')
  )
);

create index if not exists kleos_vector_snapshots_user_evaluated_idx
on public.kleos_vector_snapshots (user_id, evaluated_at desc, created_at desc);

create index if not exists kleos_vector_snapshot_results_vector_idx
on public.kleos_vector_snapshot_results (vector_id, snapshot_id);

alter table public.kleos_vector_snapshots enable row level security;
alter table public.kleos_vector_snapshot_results enable row level security;

-- Authenticated owner clients may read snapshots. Snapshot mutation is intentionally not granted
-- directly: new snapshots are created atomically through create_kleos_vector_snapshot().
grant select on table public.kleos_vector_snapshots to authenticated;
grant select on table public.kleos_vector_snapshot_results to authenticated;
revoke insert, update, delete on table public.kleos_vector_snapshots from authenticated;
revoke insert, update, delete on table public.kleos_vector_snapshot_results from authenticated;
revoke all on table public.kleos_vector_snapshots from anon;
revoke all on table public.kleos_vector_snapshot_results from anon;

drop policy if exists "Authorized user can read Kleos vector snapshots" on public.kleos_vector_snapshots;
create policy "Authorized user can read Kleos vector snapshots"
on public.kleos_vector_snapshots
for select to authenticated
using (
  auth.uid() = user_id
  and lower(coalesce(auth.jwt()->>'email', '')) = 'theneolorenzo@gmail.com'
);

drop policy if exists "Authorized user can read Kleos vector snapshot results" on public.kleos_vector_snapshot_results;
create policy "Authorized user can read Kleos vector snapshot results"
on public.kleos_vector_snapshot_results
for select to authenticated
using (
  exists (
    select 1
    from public.kleos_vector_snapshots snapshot
    where snapshot.id = snapshot_id
      and snapshot.user_id = auth.uid()
      and lower(coalesce(auth.jwt()->>'email', '')) = 'theneolorenzo@gmail.com'
  )
);

create or replace function public.create_kleos_vector_snapshot(
  p_evaluated_at timestamptz,
  p_evaluator text,
  p_methodology_version text,
  p_results jsonb,
  p_overall_score numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_snapshot_id uuid;
  v_result_count integer;
  v_distinct_vector_count integer;
begin
  if auth.uid() is null
    or lower(coalesce(auth.jwt()->>'email', '')) <> 'theneolorenzo@gmail.com' then
    raise exception 'KLEOS_VECTOR_SNAPSHOT_NOT_AUTHORIZED';
  end if;

  if p_evaluated_at is null then
    raise exception 'KLEOS_VECTOR_SNAPSHOT_EVALUATED_AT_REQUIRED';
  end if;
  if length(btrim(coalesce(p_evaluator, ''))) = 0 then
    raise exception 'KLEOS_VECTOR_SNAPSHOT_EVALUATOR_REQUIRED';
  end if;
  if length(btrim(coalesce(p_methodology_version, ''))) = 0 then
    raise exception 'KLEOS_VECTOR_SNAPSHOT_METHODOLOGY_REQUIRED';
  end if;
  if p_overall_score is not null and (p_overall_score < 0 or p_overall_score > 100) then
    raise exception 'KLEOS_VECTOR_SNAPSHOT_OVERALL_SCORE_INVALID';
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

  insert into public.kleos_vector_snapshots (
    user_id,
    evaluated_at,
    evaluator,
    methodology_version,
    overall_score
  ) values (
    auth.uid(),
    p_evaluated_at,
    btrim(p_evaluator),
    btrim(p_methodology_version),
    p_overall_score
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

  return v_snapshot_id;
end;
$$;

revoke all on function public.create_kleos_vector_snapshot(timestamptz, text, text, jsonb, numeric) from public;
revoke all on function public.create_kleos_vector_snapshot(timestamptz, text, text, jsonb, numeric) from anon;
grant execute on function public.create_kleos_vector_snapshot(timestamptz, text, text, jsonb, numeric) to authenticated;

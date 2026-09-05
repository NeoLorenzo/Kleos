-- Kleos persistence schema.
--
-- Physical infrastructure is intentionally shared with Ariadne's existing Supabase project.
-- These existing goat_* tables are logically owned by Kleos from this point forward.
-- This file is idempotent and must not seed or reset private data.

create extension if not exists pgcrypto;
grant usage on schema public to authenticated;

create table if not exists public.goat_score_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  score numeric(5, 2) not null check (score >= 0 and score <= 100),
  entry_date date not null,
  llm_commentary text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.goat_strength_lifts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_name text not null,
  weight_kg numeric(8, 2) not null check (weight_kg > 0),
  reps integer not null check (reps > 0),
  performed_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.goat_cognitive_tests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  test_name text not null,
  score_text text not null,
  taken_at timestamptz not null,
  hunger integer not null check (hunger between 0 and 10),
  distractions integer not null check (distractions between 0 and 10),
  wakefulness integer not null check (wakefulness between 0 and 10),
  mood integer not null check (mood between 0 and 10),
  created_at timestamptz not null default now()
);

create table if not exists public.goat_academic_stage_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  academic_year text not null,
  stage integer not null,
  exam_board text not null,
  stage_mean numeric(5, 2) null,
  weighting numeric(5, 2) null,
  credits integer null,
  stage_result text null,
  created_at timestamptz not null default now(),
  unique (user_id, academic_year, stage)
);

create table if not exists public.goat_academic_module_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  academic_year text not null,
  stage integer not null,
  module_name text not null,
  module_code text not null,
  term text not null,
  attempt text not null,
  assessed_by text not null,
  mark numeric(5, 2) not null,
  result text not null,
  credits integer not null,
  created_at timestamptz not null default now(),
  unique (user_id, academic_year, module_code, module_name)
);

create table if not exists public.goat_misc_characteristics (
  user_id uuid primary key references auth.users(id) on delete cascade,
  content text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.goat_health_characteristics (
  user_id uuid primary key references auth.users(id) on delete cascade,
  blood_test_content text not null default '',
  misc_content text not null default '',
  content text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.goat_cv_characteristics (
  user_id uuid primary key references auth.users(id) on delete cascade,
  content text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.goat_immutable_characteristics (
  user_id uuid primary key references auth.users(id) on delete cascade,
  content text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.goat_academic_notes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  content text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.goat_strength_profile (
  user_id uuid primary key references auth.users(id) on delete cascade,
  body_weight_kg numeric(6, 2) null check (body_weight_kg is null or body_weight_kg > 0),
  height_cm numeric(6, 2) null check (height_cm is null or height_cm > 0),
  updated_at timestamptz not null default now()
);

alter table public.goat_score_entries enable row level security;
alter table public.goat_strength_lifts enable row level security;
alter table public.goat_cognitive_tests enable row level security;
alter table public.goat_academic_stage_results enable row level security;
alter table public.goat_academic_module_results enable row level security;
alter table public.goat_health_characteristics enable row level security;
alter table public.goat_cv_characteristics enable row level security;
alter table public.goat_misc_characteristics enable row level security;
alter table public.goat_immutable_characteristics enable row level security;
alter table public.goat_academic_notes enable row level security;
alter table public.goat_strength_profile enable row level security;

grant select, insert, update, delete on table public.goat_score_entries to authenticated;
grant select, insert, update, delete on table public.goat_strength_lifts to authenticated;
grant select, insert, update, delete on table public.goat_cognitive_tests to authenticated;
grant select, insert, update, delete on table public.goat_academic_stage_results to authenticated;
grant select, insert, update, delete on table public.goat_academic_module_results to authenticated;
grant select, insert, update, delete on table public.goat_health_characteristics to authenticated;
grant select, insert, update, delete on table public.goat_cv_characteristics to authenticated;
grant select, insert, update, delete on table public.goat_misc_characteristics to authenticated;
grant select, insert, update, delete on table public.goat_immutable_characteristics to authenticated;
grant select, insert, update, delete on table public.goat_academic_notes to authenticated;
grant select, insert, update, delete on table public.goat_strength_profile to authenticated;

revoke all on table public.goat_score_entries from anon;
revoke all on table public.goat_strength_lifts from anon;
revoke all on table public.goat_cognitive_tests from anon;
revoke all on table public.goat_academic_stage_results from anon;
revoke all on table public.goat_academic_module_results from anon;
revoke all on table public.goat_health_characteristics from anon;
revoke all on table public.goat_cv_characteristics from anon;
revoke all on table public.goat_misc_characteristics from anon;
revoke all on table public.goat_immutable_characteristics from anon;
revoke all on table public.goat_academic_notes from anon;
revoke all on table public.goat_strength_profile from anon;

drop policy if exists "Authorized user can read goat scores" on public.goat_score_entries;
create policy "Authorized user can read goat scores" on public.goat_score_entries
for select to authenticated
using (auth.uid() = user_id and lower(coalesce(auth.jwt()->>'email', '')) = 'theneolorenzo@gmail.com');
drop policy if exists "Authorized user can write goat scores" on public.goat_score_entries;
create policy "Authorized user can write goat scores" on public.goat_score_entries
for all to authenticated
using (auth.uid() = user_id and lower(coalesce(auth.jwt()->>'email', '')) = 'theneolorenzo@gmail.com')
with check (auth.uid() = user_id and lower(coalesce(auth.jwt()->>'email', '')) = 'theneolorenzo@gmail.com');

drop policy if exists "Authorized user can read goat lifts" on public.goat_strength_lifts;
create policy "Authorized user can read goat lifts" on public.goat_strength_lifts
for select to authenticated
using (auth.uid() = user_id and lower(coalesce(auth.jwt()->>'email', '')) = 'theneolorenzo@gmail.com');
drop policy if exists "Authorized user can write goat lifts" on public.goat_strength_lifts;
create policy "Authorized user can write goat lifts" on public.goat_strength_lifts
for all to authenticated
using (auth.uid() = user_id and lower(coalesce(auth.jwt()->>'email', '')) = 'theneolorenzo@gmail.com')
with check (auth.uid() = user_id and lower(coalesce(auth.jwt()->>'email', '')) = 'theneolorenzo@gmail.com');

drop policy if exists "Authorized user can read goat cognitive tests" on public.goat_cognitive_tests;
create policy "Authorized user can read goat cognitive tests" on public.goat_cognitive_tests
for select to authenticated
using (auth.uid() = user_id and lower(coalesce(auth.jwt()->>'email', '')) = 'theneolorenzo@gmail.com');
drop policy if exists "Authorized user can write goat cognitive tests" on public.goat_cognitive_tests;
create policy "Authorized user can write goat cognitive tests" on public.goat_cognitive_tests
for all to authenticated
using (auth.uid() = user_id and lower(coalesce(auth.jwt()->>'email', '')) = 'theneolorenzo@gmail.com')
with check (auth.uid() = user_id and lower(coalesce(auth.jwt()->>'email', '')) = 'theneolorenzo@gmail.com');

drop policy if exists "Authorized user can read goat academic stages" on public.goat_academic_stage_results;
create policy "Authorized user can read goat academic stages" on public.goat_academic_stage_results
for select to authenticated
using (auth.uid() = user_id and lower(coalesce(auth.jwt()->>'email', '')) = 'theneolorenzo@gmail.com');
drop policy if exists "Authorized user can write goat academic stages" on public.goat_academic_stage_results;
create policy "Authorized user can write goat academic stages" on public.goat_academic_stage_results
for all to authenticated
using (auth.uid() = user_id and lower(coalesce(auth.jwt()->>'email', '')) = 'theneolorenzo@gmail.com')
with check (auth.uid() = user_id and lower(coalesce(auth.jwt()->>'email', '')) = 'theneolorenzo@gmail.com');

drop policy if exists "Authorized user can read goat academic modules" on public.goat_academic_module_results;
create policy "Authorized user can read goat academic modules" on public.goat_academic_module_results
for select to authenticated
using (auth.uid() = user_id and lower(coalesce(auth.jwt()->>'email', '')) = 'theneolorenzo@gmail.com');
drop policy if exists "Authorized user can write goat academic modules" on public.goat_academic_module_results;
create policy "Authorized user can write goat academic modules" on public.goat_academic_module_results
for all to authenticated
using (auth.uid() = user_id and lower(coalesce(auth.jwt()->>'email', '')) = 'theneolorenzo@gmail.com')
with check (auth.uid() = user_id and lower(coalesce(auth.jwt()->>'email', '')) = 'theneolorenzo@gmail.com');

drop policy if exists "Authorized user can read goat misc" on public.goat_misc_characteristics;
create policy "Authorized user can read goat misc" on public.goat_misc_characteristics
for select to authenticated
using (auth.uid() = user_id and lower(coalesce(auth.jwt()->>'email', '')) = 'theneolorenzo@gmail.com');
drop policy if exists "Authorized user can write goat misc" on public.goat_misc_characteristics;
create policy "Authorized user can write goat misc" on public.goat_misc_characteristics
for all to authenticated
using (auth.uid() = user_id and lower(coalesce(auth.jwt()->>'email', '')) = 'theneolorenzo@gmail.com')
with check (auth.uid() = user_id and lower(coalesce(auth.jwt()->>'email', '')) = 'theneolorenzo@gmail.com');

drop policy if exists "Authorized user can read goat health" on public.goat_health_characteristics;
create policy "Authorized user can read goat health" on public.goat_health_characteristics
for select to authenticated
using (auth.uid() = user_id and lower(coalesce(auth.jwt()->>'email', '')) = 'theneolorenzo@gmail.com');
drop policy if exists "Authorized user can write goat health" on public.goat_health_characteristics;
create policy "Authorized user can write goat health" on public.goat_health_characteristics
for all to authenticated
using (auth.uid() = user_id and lower(coalesce(auth.jwt()->>'email', '')) = 'theneolorenzo@gmail.com')
with check (auth.uid() = user_id and lower(coalesce(auth.jwt()->>'email', '')) = 'theneolorenzo@gmail.com');

drop policy if exists "Authorized user can read goat cv" on public.goat_cv_characteristics;
create policy "Authorized user can read goat cv" on public.goat_cv_characteristics
for select to authenticated
using (auth.uid() = user_id and lower(coalesce(auth.jwt()->>'email', '')) = 'theneolorenzo@gmail.com');
drop policy if exists "Authorized user can write goat cv" on public.goat_cv_characteristics;
create policy "Authorized user can write goat cv" on public.goat_cv_characteristics
for all to authenticated
using (auth.uid() = user_id and lower(coalesce(auth.jwt()->>'email', '')) = 'theneolorenzo@gmail.com')
with check (auth.uid() = user_id and lower(coalesce(auth.jwt()->>'email', '')) = 'theneolorenzo@gmail.com');

drop policy if exists "Authorized user can read goat immutable" on public.goat_immutable_characteristics;
create policy "Authorized user can read goat immutable" on public.goat_immutable_characteristics
for select to authenticated
using (auth.uid() = user_id and lower(coalesce(auth.jwt()->>'email', '')) = 'theneolorenzo@gmail.com');
drop policy if exists "Authorized user can write goat immutable" on public.goat_immutable_characteristics;
create policy "Authorized user can write goat immutable" on public.goat_immutable_characteristics
for all to authenticated
using (auth.uid() = user_id and lower(coalesce(auth.jwt()->>'email', '')) = 'theneolorenzo@gmail.com')
with check (auth.uid() = user_id and lower(coalesce(auth.jwt()->>'email', '')) = 'theneolorenzo@gmail.com');

drop policy if exists "Authorized user can read goat academic notes" on public.goat_academic_notes;
create policy "Authorized user can read goat academic notes" on public.goat_academic_notes
for select to authenticated
using (auth.uid() = user_id and lower(coalesce(auth.jwt()->>'email', '')) = 'theneolorenzo@gmail.com');
drop policy if exists "Authorized user can write goat academic notes" on public.goat_academic_notes;
create policy "Authorized user can write goat academic notes" on public.goat_academic_notes
for all to authenticated
using (auth.uid() = user_id and lower(coalesce(auth.jwt()->>'email', '')) = 'theneolorenzo@gmail.com')
with check (auth.uid() = user_id and lower(coalesce(auth.jwt()->>'email', '')) = 'theneolorenzo@gmail.com');

drop policy if exists "Authorized user can read goat strength profile" on public.goat_strength_profile;
create policy "Authorized user can read goat strength profile" on public.goat_strength_profile
for select to authenticated
using (auth.uid() = user_id and lower(coalesce(auth.jwt()->>'email', '')) = 'theneolorenzo@gmail.com');
drop policy if exists "Authorized user can write goat strength profile" on public.goat_strength_profile;
create policy "Authorized user can write goat strength profile" on public.goat_strength_profile
for all to authenticated
using (auth.uid() = user_id and lower(coalesce(auth.jwt()->>'email', '')) = 'theneolorenzo@gmail.com')
with check (auth.uid() = user_id and lower(coalesce(auth.jwt()->>'email', '')) = 'theneolorenzo@gmail.com');

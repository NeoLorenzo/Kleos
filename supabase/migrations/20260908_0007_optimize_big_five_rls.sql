-- Kleos #26: use one optimized RLS policy for Big Five assessments.
-- This avoids duplicate permissive SELECT policies and per-row auth function evaluation.

drop policy if exists "Authorized user can read goat big five assessments"
on public.goat_big_five_assessments;

drop policy if exists "Authorized user can write goat big five assessments"
on public.goat_big_five_assessments;

drop policy if exists "Authorized user can manage goat big five assessments"
on public.goat_big_five_assessments;

create policy "Authorized user can manage goat big five assessments"
on public.goat_big_five_assessments
for all to authenticated
using (
  (select auth.uid()) = user_id
  and lower(coalesce((select auth.jwt() ->> 'email'), '')) = 'theneolorenzo@gmail.com'
)
with check (
  (select auth.uid()) = user_id
  and lower(coalesce((select auth.jwt() ->> 'email'), '')) = 'theneolorenzo@gmail.com'
);

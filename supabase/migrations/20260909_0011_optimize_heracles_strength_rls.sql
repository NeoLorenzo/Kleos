begin;

drop policy if exists "Authorized user can read Heracles strength metrics"
on public.heracles_strength_metrics;

create policy "Authorized user can read Heracles strength metrics"
on public.heracles_strength_metrics
for select
to authenticated
using (
  user_id = (select auth.uid())
  and (select lower(coalesce(auth.jwt()->>'email', ''))) = 'theneolorenzo@gmail.com'
);

commit;

-- Kleos Bot stateless ChatGPT transport: expose the canonical evaluation
-- context through a plain read-only relation so the connected Supabase SQL
-- tool can retrieve it with an ordinary SELECT rather than an explicit
-- function invocation.
--
-- The underlying context function remains the single source of truth. This
-- view does not broaden API access: ordinary application roles are explicitly
-- denied SELECT and the management SQL session remains the intended caller.

create or replace view public.kleos_evaluation_context_read as
select public.get_kleos_evaluation_context() as context;

revoke all on table public.kleos_evaluation_context_read from public;
revoke all on table public.kleos_evaluation_context_read from anon;
revoke all on table public.kleos_evaluation_context_read from authenticated;
revoke all on table public.kleos_evaluation_context_read from service_role;

comment on view public.kleos_evaluation_context_read is
  'Management-session read facade for stateless ChatGPT Kleos evaluations. Returns exactly one canonical methodology+evidence context row.';

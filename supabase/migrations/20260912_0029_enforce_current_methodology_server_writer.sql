-- Kleos #69: current methodology snapshots must use the canonical server-side aggregator.
-- Legacy methodology versions remain readable and historical writers remain available for compatibility.

create or replace function public.enforce_current_kleos_methodology_writer()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current_version text;
begin
  select version into v_current_version
  from public.kleos_vector_methodologies
  where is_current
  limit 1;

  if v_current_version is not null
     and new.methodology_version = v_current_version
     and session_user <> 'postgres' then
    raise exception 'KLEOS_CURRENT_METHODOLOGY_SERVER_WRITER_REQUIRED';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_current_kleos_methodology_writer() from public, anon, authenticated, service_role;

drop trigger if exists enforce_current_kleos_methodology_writer on public.kleos_vector_snapshots;
create trigger enforce_current_kleos_methodology_writer
before insert on public.kleos_vector_snapshots
for each row execute function public.enforce_current_kleos_methodology_writer();

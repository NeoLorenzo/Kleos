begin;

create or replace function public.refresh_financial_classifications_after_bank_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.last_synced_at is not null
     and new.last_synced_at is distinct from old.last_synced_at then
    begin
      perform public.refresh_financial_transaction_classifications(new.user_id, new.id);
    exception when others then
      -- Classification is derived intelligence. A classifier failure must never
      -- roll back a successful canonical bank synchronization.
      null;
    end;
  end if;
  return new;
end;
$$;

revoke all on function public.refresh_financial_classifications_after_bank_sync() from public, anon, authenticated;
grant execute on function public.refresh_financial_classifications_after_bank_sync() to service_role;

drop trigger if exists financial_classify_after_bank_sync on public.financial_bank_connections;
create trigger financial_classify_after_bank_sync
after update of last_synced_at on public.financial_bank_connections
for each row
execute function public.refresh_financial_classifications_after_bank_sync();

commit;

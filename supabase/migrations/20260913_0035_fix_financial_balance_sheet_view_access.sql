begin;

grant select on table public.financial_current_balances to authenticated;

revoke all on table public.financial_current_assets from public, anon, authenticated;
revoke all on table public.financial_current_liabilities from public, anon, authenticated;
revoke all on table public.financial_balance_sheet_current from public, anon, authenticated;
revoke all on table public.financial_asset_allocation_current from public, anon, authenticated;
revoke all on table public.financial_net_worth_history from public, anon, authenticated;
revoke all on table public.financial_liability_status from public, anon, authenticated;

grant select on table public.financial_current_assets to authenticated;
grant select on table public.financial_current_liabilities to authenticated;
grant select on table public.financial_balance_sheet_current to authenticated;
grant select on table public.financial_asset_allocation_current to authenticated;
grant select on table public.financial_net_worth_history to authenticated;
grant select on table public.financial_liability_status to authenticated;

commit;

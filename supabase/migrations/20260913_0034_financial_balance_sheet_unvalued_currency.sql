-- Keep unvalued identities in their declared currency so assets/liabilities can
-- exist independently from observations without creating null-currency totals.

create or replace view public.financial_current_assets
with (security_invoker = true)
as
select
  a.user_id,
  a.id as asset_id,
  a.name,
  a.category,
  a.currency as asset_currency,
  a.ownership_pct,
  a.control_level,
  a.liquidity_class,
  a.source_type,
  a.started_on,
  a.ended_on,
  a.is_active,
  v.id as valuation_id,
  v.value as gross_value,
  coalesce(v.currency, a.currency) as currency,
  case when v.value is null then null
       else round(v.value * a.ownership_pct / 100.0, 8)
  end as ownership_adjusted_value,
  v.valuation_date,
  v.valuation_method,
  v.valuation_source,
  v.confidence,
  v.created_at as valuation_recorded_at
from public.financial_assets a
left join lateral (
  select av.*
  from public.financial_asset_valuations av
  where av.asset_id = a.id
    and av.user_id = a.user_id
  order by av.valuation_date desc, av.created_at desc, av.id desc
  limit 1
) v on true
where a.is_active;

create or replace view public.financial_current_liabilities
with (security_invoker = true)
as
select
  l.user_id,
  l.id as liability_id,
  l.name,
  l.category,
  l.currency as liability_currency,
  l.source_type,
  l.started_on,
  l.ended_on,
  l.is_active,
  b.id as balance_id,
  b.amount,
  coalesce(b.currency, l.currency) as currency,
  b.balance_date,
  b.balance_source,
  b.confidence,
  b.created_at as balance_recorded_at
from public.financial_liabilities l
left join lateral (
  select lb.*
  from public.financial_liability_balances lb
  where lb.liability_id = l.id
    and lb.user_id = l.user_id
  order by lb.balance_date desc, lb.created_at desc, lb.id desc
  limit 1
) b on true
where l.is_active;

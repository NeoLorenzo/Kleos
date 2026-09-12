begin;

create or replace view public.financial_preferred_bank_connection
with (security_invoker = true)
as
select
  ranked.id,
  ranked.user_id,
  ranked.provider,
  ranked.institution_name,
  ranked.institution_country,
  ranked.requisition_status,
  ranked.provider_session_id,
  ranked.connected_at,
  ranked.last_synced_at,
  ranked.consent_valid_until
from (
  select
    c.*,
    row_number() over (
      partition by c.user_id, c.provider
      order by
        case
          when c.provider_session_id is not null
               and c.last_synced_at is not null
               and upper(coalesce(c.requisition_status, '')) not in ('EXPIRED','REVOKED','CLOSED','INVALID','CANCELLED')
            then 0
          else 1
        end,
        c.last_synced_at desc nulls last,
        c.connected_at desc nulls last,
        c.created_at desc
    ) as rn
  from public.financial_bank_connections c
) ranked
where ranked.rn = 1;

revoke all on table public.financial_preferred_bank_connection from public, anon, authenticated;
grant select on table public.financial_preferred_bank_connection to authenticated;

create or replace view public.financial_cash_flow_monthly
with (security_invoker = true)
as
select
  t.user_id,
  date_trunc('month', coalesce(t.booking_date, t.value_date, t.first_seen_at::date)::timestamp)::date as month,
  t.currency,
  sum(case when c.flow_type in ('income','interest') and t.amount > 0 then t.amount else 0 end) as income_amount,
  sum(case when c.flow_type = 'refund' and t.amount > 0 then t.amount else 0 end) as refund_amount,
  sum(case when c.flow_type in ('expense','fee','tax') and t.amount < 0 then -t.amount else 0 end) as spending_amount,
  sum(case when c.flow_type = 'investment' then t.amount else 0 end) as investment_net,
  sum(case when c.flow_type in ('income','interest','refund','expense','fee','tax','investment') then t.amount else 0 end) as net_cash_flow,
  sum(case when c.flow_type = 'transfer' and t.amount > 0 then t.amount else 0 end) as transfer_in,
  sum(case when c.flow_type = 'transfer' and t.amount < 0 then -t.amount else 0 end) as transfer_out,
  count(*) filter (where c.flow_type = 'unknown')::integer as unknown_count,
  count(*)::integer as transaction_count
from public.financial_transactions t
join public.financial_transaction_classifications c on c.transaction_id = t.id
join public.financial_accounts a on a.id = t.account_id
join public.financial_preferred_bank_connection p on p.id = a.connection_id and p.user_id = t.user_id
where t.status = 'booked'
group by t.user_id, date_trunc('month', coalesce(t.booking_date, t.value_date, t.first_seen_at::date)::timestamp)::date, t.currency;

create or replace view public.financial_spending_by_category
with (security_invoker = true)
as
select
  t.user_id,
  date_trunc('month', coalesce(t.booking_date, t.value_date, t.first_seen_at::date)::timestamp)::date as month,
  t.currency,
  c.category,
  sum(-t.amount) as spending_amount,
  count(*)::integer as transaction_count
from public.financial_transactions t
join public.financial_transaction_classifications c on c.transaction_id = t.id
join public.financial_accounts a on a.id = t.account_id
join public.financial_preferred_bank_connection p on p.id = a.connection_id and p.user_id = t.user_id
where t.status = 'booked'
  and t.amount < 0
  and c.flow_type in ('expense','fee','tax')
group by t.user_id, date_trunc('month', coalesce(t.booking_date, t.value_date, t.first_seen_at::date)::timestamp)::date, t.currency, c.category;

create or replace view public.financial_cash_flow_rolling
with (security_invoker = true)
as
select
  t.user_id,
  t.currency,
  w.window_days,
  sum(case when c.flow_type in ('income','interest') and t.amount > 0 then t.amount else 0 end) as income_amount,
  sum(case when c.flow_type = 'refund' and t.amount > 0 then t.amount else 0 end) as refund_amount,
  sum(case when c.flow_type in ('expense','fee','tax') and t.amount < 0 then -t.amount else 0 end) as spending_amount,
  sum(case when c.flow_type in ('income','interest','refund','expense','fee','tax','investment') then t.amount else 0 end) as net_cash_flow,
  count(*) filter (where c.flow_type = 'unknown')::integer as unknown_count,
  count(*)::integer as transaction_count
from public.financial_transactions t
join public.financial_transaction_classifications c on c.transaction_id = t.id
join public.financial_accounts a on a.id = t.account_id
join public.financial_preferred_bank_connection p on p.id = a.connection_id and p.user_id = t.user_id
cross join (values (30), (90), (365)) as w(window_days)
where t.status = 'booked'
  and coalesce(t.booking_date, t.value_date, t.first_seen_at::date) >= current_date - (w.window_days - 1)
group by t.user_id, t.currency, w.window_days;

create or replace view public.financial_top_merchants
with (security_invoker = true)
as
select
  t.user_id,
  t.currency,
  c.normalized_label,
  max(c.display_label) as display_label,
  c.category,
  sum(-t.amount) as spending_amount,
  count(*)::integer as transaction_count,
  max(coalesce(t.booking_date, t.value_date, t.first_seen_at::date)) as last_transaction_date
from public.financial_transactions t
join public.financial_transaction_classifications c on c.transaction_id = t.id
join public.financial_accounts a on a.id = t.account_id
join public.financial_preferred_bank_connection p on p.id = a.connection_id and p.user_id = t.user_id
where t.status = 'booked'
  and t.amount < 0
  and c.flow_type in ('expense','fee','tax')
  and coalesce(t.booking_date, t.value_date, t.first_seen_at::date) >= current_date - 364
group by t.user_id, t.currency, c.normalized_label, c.category;

create or replace view public.financial_recurring_expenses
with (security_invoker = true)
as
select
  t.user_id,
  t.currency,
  c.normalized_label,
  max(c.display_label) as display_label,
  c.category,
  round(avg(abs(t.amount)), 2) as typical_amount,
  round(avg(c.recurrence_interval_days), 1) as recurrence_interval_days,
  max(c.recurrence_occurrences)::integer as detected_occurrences,
  min(coalesce(t.booking_date, t.value_date, t.first_seen_at::date)) as first_transaction_date,
  max(coalesce(t.booking_date, t.value_date, t.first_seen_at::date)) as last_transaction_date,
  round(avg(abs(t.amount)) * 365 / nullif(avg(c.recurrence_interval_days), 0), 2) as annualized_estimate,
  max(coalesce(t.booking_date, t.value_date, t.first_seen_at::date)) >=
    current_date - greatest(90, coalesce((avg(c.recurrence_interval_days) * 2)::integer, 90)) as active_recently
from public.financial_transactions t
join public.financial_transaction_classifications c on c.transaction_id = t.id
join public.financial_accounts a on a.id = t.account_id
join public.financial_preferred_bank_connection p on p.id = a.connection_id and p.user_id = t.user_id
where t.status = 'booked'
  and t.amount < 0
  and c.is_recurring = true
  and c.flow_type in ('expense','fee')
group by t.user_id, t.currency, c.normalized_label, c.category;

create or replace view public.financial_classification_coverage
with (security_invoker = true)
as
select
  t.user_id,
  t.currency,
  count(*)::integer as total_transactions,
  count(*) filter (where c.flow_type <> 'unknown')::integer as classified_transactions,
  count(*) filter (where c.flow_type = 'unknown')::integer as unknown_transactions,
  count(*) filter (where c.flow_type in ('expense','fee','tax'))::integer as spending_transactions,
  count(*) filter (where c.flow_type in ('expense','fee','tax') and c.category = 'other')::integer as other_category_transactions,
  count(*) filter (where c.is_fx_conversion)::integer as fx_transactions,
  count(*) filter (where c.flow_type = 'transfer')::integer as transfer_transactions,
  count(*) filter (where c.flow_type = 'zero_value')::integer as zero_value_transactions,
  round(100.0 * count(*) filter (where c.flow_type <> 'unknown') / nullif(count(*), 0), 1) as flow_coverage_pct,
  round(
    100.0 * count(*) filter (where c.flow_type in ('expense','fee','tax') and c.category <> 'other')
    / nullif(count(*) filter (where c.flow_type in ('expense','fee','tax')), 0),
    1
  ) as spending_category_coverage_pct
from public.financial_transactions t
join public.financial_transaction_classifications c on c.transaction_id = t.id
join public.financial_accounts a on a.id = t.account_id
join public.financial_preferred_bank_connection p on p.id = a.connection_id and p.user_id = t.user_id
where t.status = 'booked'
group by t.user_id, t.currency;

commit;

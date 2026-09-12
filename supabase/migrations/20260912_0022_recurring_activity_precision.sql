begin;

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
  case
    when avg(c.recurrence_interval_days) between 330 and 400 then
      max(coalesce(t.booking_date, t.value_date, t.first_seen_at::date)) >= current_date - 430
    when avg(c.recurrence_interval_days) between 20 and 120 then
      max(coalesce(t.booking_date, t.value_date, t.first_seen_at::date)) >= current_date - greatest(90, least(180, (avg(c.recurrence_interval_days) * 2)::integer))
    else
      max(coalesce(t.booking_date, t.value_date, t.first_seen_at::date)) >= current_date - 120
  end as active_recently
from public.financial_transactions t
join public.financial_transaction_classifications c on c.transaction_id = t.id
join public.financial_accounts a on a.id = t.account_id
join public.financial_preferred_bank_connection p on p.id = a.connection_id and p.user_id = t.user_id
where t.status = 'booked'
  and t.amount < 0
  and c.is_recurring = true
  and c.flow_type in ('expense','fee')
group by t.user_id, t.currency, c.normalized_label, c.category;

commit;

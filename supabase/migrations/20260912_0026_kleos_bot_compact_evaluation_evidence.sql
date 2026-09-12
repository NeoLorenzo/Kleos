-- Kleos #68: compact server-side evidence contract for stateless ChatGPT evaluation.
-- The existing full dynamic evidence reader remains unchanged for debugging/backward compatibility.

create or replace function public.get_kleos_bot_evaluation_evidence_admin()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_owner_id uuid;
  v_full jsonb;
  v_health jsonb;
  v_cash_flow jsonb;
  v_spending jsonb;
  v_recurring jsonb;
  v_payload jsonb;
begin
  if session_user <> 'postgres' then
    raise exception 'KLEOS_BOT_ADMIN_NOT_AUTHORIZED';
  end if;

  select id
  into v_owner_id
  from auth.users
  where lower(email) = 'theneolorenzo@gmail.com'
  order by created_at asc
  limit 1;

  if v_owner_id is null then
    raise exception 'KLEOS_BOT_OWNER_NOT_FOUND';
  end if;

  -- Preserve the dynamic registry for all low-volume canonical evidence groups.
  v_full := public.get_kleos_bot_evidence_admin();

  -- Collapse Apple Health to one deterministic current/trend record per metric.
  -- Full recent-sample arrays are intentionally excluded. Sleep retains only the
  -- latest structured stage payload because its scalar qty is not sufficient.
  select coalesce(
    jsonb_agg(
      jsonb_strip_nulls(
        jsonb_build_object(
          'metric_name', h.metric_name,
          'latest_date', h.latest_date,
          'units', h.units,
          'latest_qty', (h.recent_samples->0)->'qty',
          'latest_min', (h.recent_samples->0)->'min',
          'latest_avg', (h.recent_samples->0)->'avg',
          'latest_max', (h.recent_samples->0)->'max',
          'source', (h.recent_samples->0)->'source',
          'avg_7d', h.avg_7d,
          'avg_30d', h.avg_30d,
          'min_30d', h.min_30d,
          'max_30d', h.max_30d,
          'details', case
            when h.metric_name = 'sleep_analysis' then (h.recent_samples->0)->'details'
            else null
          end
        )
      )
      order by h.metric_name
    ),
    '[]'::jsonb
  )
  into v_health
  from public.goat_health_metric_evidence h
  where h.user_id = v_owner_id;

  -- Financial evidence is summarized into bounded analytical windows. Raw recent
  -- transaction rows and the full month/category history are deliberately omitted.
  select coalesce(
    jsonb_agg(to_jsonb(x) - 'user_id' order by x.month desc, x.currency),
    '[]'::jsonb
  )
  into v_cash_flow
  from (
    select f.*
    from public.financial_cash_flow_monthly f
    where f.user_id = v_owner_id
      and f.month >= (date_trunc('month', current_date) - interval '11 months')::date
  ) x;

  select coalesce(
    jsonb_agg(to_jsonb(x) order by x.currency, x.spending_amount desc),
    '[]'::jsonb
  )
  into v_spending
  from (
    select
      f.currency,
      f.category,
      sum(f.spending_amount) as spending_amount,
      sum(f.transaction_count)::integer as transaction_count
    from public.financial_spending_by_category f
    where f.user_id = v_owner_id
      and f.month >= (date_trunc('month', current_date) - interval '2 months')::date
    group by f.currency, f.category
  ) x;

  select coalesce(
    jsonb_agg(to_jsonb(x) - 'user_id' order by x.annualized_estimate desc nulls last),
    '[]'::jsonb
  )
  into v_recurring
  from (
    select f.*
    from public.financial_recurring_expenses f
    where f.user_id = v_owner_id
      and f.active_recently
    order by f.annualized_estimate desc nulls last
    limit 30
  ) x;

  v_payload :=
    (
      v_full
      - 'goat_health_metric_evidence'
      - 'financial_recent_transactions'
      - 'financial_spending_by_category'
      - 'financial_cash_flow_monthly'
      - 'financial_recurring_expenses'
    )
    || jsonb_build_object('goat_health_metric_summary', v_health)
    || jsonb_build_object(
      'financial_summary',
      jsonb_build_object(
        'cash_flow_last_12_months', v_cash_flow,
        'spending_last_3_months_by_category', v_spending,
        'active_recurring_expenses', v_recurring
      )
    );

  return v_payload;
end;
$$;

revoke all on function public.get_kleos_bot_evaluation_evidence_admin() from public;
revoke all on function public.get_kleos_bot_evaluation_evidence_admin() from anon;
revoke all on function public.get_kleos_bot_evaluation_evidence_admin() from authenticated;
revoke all on function public.get_kleos_bot_evaluation_evidence_admin() from service_role;

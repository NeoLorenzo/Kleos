begin;
create or replace function public.save_financial_transaction_correction(
  p_transaction_id uuid,
  p_flow_type text default null,
  p_category text default null,
  p_subcategory text default null,
  p_display_label text default null,
  p_economic_inflow_type text default null,
  p_is_internal_transfer boolean default null,
  p_apply_matching boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt()->>'email', ''));
  v_amount numeric;
  v_currency text;
  v_base_label text;
  v_direction text;
  v_override_id uuid;
  v_rule_id uuid;
  v_affected integer := 0;
begin
  if v_user_id is null or v_email <> 'theneolorenzo@gmail.com' then
    raise exception using errcode = '42501', message = 'FINANCIAL_CORRECTION_NOT_AUTHORIZED';
  end if;

  if num_nonnulls(p_flow_type, p_category, p_subcategory, p_display_label, p_economic_inflow_type, p_is_internal_transfer) = 0 then
    raise exception using errcode = '22023', message = 'FINANCIAL_CORRECTION_EMPTY';
  end if;

  select t.amount, t.currency, c.base_normalized_label
  into v_amount, v_currency, v_base_label
  from public.financial_transactions t
  join public.financial_transaction_classifications c on c.transaction_id = t.id and c.user_id = t.user_id
  where t.id = p_transaction_id and t.user_id = v_user_id;

  if not found then
    raise exception using errcode = '22023', message = 'FINANCIAL_CORRECTION_TRANSACTION_NOT_FOUND';
  end if;

  if p_economic_inflow_type is not null and v_amount <= 0 then
    raise exception using errcode = '22023', message = 'FINANCIAL_CORRECTION_INFLOW_REQUIRES_CREDIT';
  end if;

  insert into public.financial_transaction_overrides (
    user_id, transaction_id, flow_type, category, subcategory, display_label,
    economic_inflow_type, is_internal_transfer, confirmed_at, updated_at
  ) values (
    v_user_id,
    p_transaction_id,
    nullif(btrim(p_flow_type), ''),
    nullif(btrim(p_category), ''),
    nullif(btrim(p_subcategory), ''),
    nullif(btrim(p_display_label), ''),
    nullif(btrim(p_economic_inflow_type), ''),
    p_is_internal_transfer,
    now(),
    now()
  )
  on conflict (transaction_id) do update
  set flow_type = excluded.flow_type,
      category = excluded.category,
      subcategory = excluded.subcategory,
      display_label = excluded.display_label,
      economic_inflow_type = excluded.economic_inflow_type,
      is_internal_transfer = excluded.is_internal_transfer,
      confirmed_at = excluded.confirmed_at,
      updated_at = now()
  returning id into v_override_id;

  v_direction := case when v_amount > 0 then 'credit' when v_amount < 0 then 'debit' else 'zero' end;

  if p_apply_matching then
    insert into public.financial_counterparty_rules (
      user_id, match_normalized_label, currency, amount_direction,
      flow_type, category, subcategory, display_label, economic_inflow_type,
      is_internal_transfer, is_active, confirmed_at, updated_at
    ) values (
      v_user_id,
      v_base_label,
      v_currency,
      v_direction,
      nullif(btrim(p_flow_type), ''),
      nullif(btrim(p_category), ''),
      nullif(btrim(p_subcategory), ''),
      nullif(btrim(p_display_label), ''),
      nullif(btrim(p_economic_inflow_type), ''),
      p_is_internal_transfer,
      true,
      now(),
      now()
    )
    on conflict (user_id, match_normalized_label, currency, amount_direction) do update
    set flow_type = excluded.flow_type,
        category = excluded.category,
        subcategory = excluded.subcategory,
        display_label = excluded.display_label,
        economic_inflow_type = excluded.economic_inflow_type,
        is_internal_transfer = excluded.is_internal_transfer,
        is_active = true,
        confirmed_at = excluded.confirmed_at,
        updated_at = now()
    returning id into v_rule_id;

    update public.financial_transaction_classifications c
    set updated_at = now()
    from public.financial_transactions t
    where c.transaction_id = t.id
      and c.user_id = v_user_id
      and c.base_normalized_label = v_base_label
      and t.currency = v_currency
      and (case when t.amount > 0 then 'credit' when t.amount < 0 then 'debit' else 'zero' end) = v_direction;
    get diagnostics v_affected = row_count;
  else
    update public.financial_transaction_classifications
    set updated_at = now()
    where transaction_id = p_transaction_id and user_id = v_user_id;
    get diagnostics v_affected = row_count;
  end if;

  return jsonb_build_object(
    'override_id', v_override_id,
    'rule_id', v_rule_id,
    'affected_transactions', v_affected
  );
end;
$$;

create or replace function public.clear_financial_transaction_correction(
  p_transaction_id uuid,
  p_clear_matching_rule boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt()->>'email', ''));
  v_amount numeric;
  v_currency text;
  v_base_label text;
  v_direction text;
  v_override_deleted integer := 0;
  v_rule_deleted integer := 0;
  v_affected integer := 0;
begin
  if v_user_id is null or v_email <> 'theneolorenzo@gmail.com' then
    raise exception using errcode = '42501', message = 'FINANCIAL_CORRECTION_NOT_AUTHORIZED';
  end if;

  select t.amount, t.currency, c.base_normalized_label
  into v_amount, v_currency, v_base_label
  from public.financial_transactions t
  join public.financial_transaction_classifications c on c.transaction_id = t.id and c.user_id = t.user_id
  where t.id = p_transaction_id and t.user_id = v_user_id;

  if not found then
    raise exception using errcode = '22023', message = 'FINANCIAL_CORRECTION_TRANSACTION_NOT_FOUND';
  end if;

  v_direction := case when v_amount > 0 then 'credit' when v_amount < 0 then 'debit' else 'zero' end;

  delete from public.financial_transaction_overrides
  where user_id = v_user_id and transaction_id = p_transaction_id;
  get diagnostics v_override_deleted = row_count;

  if p_clear_matching_rule then
    delete from public.financial_counterparty_rules
    where user_id = v_user_id
      and match_normalized_label = v_base_label
      and currency = v_currency
      and amount_direction = v_direction;
    get diagnostics v_rule_deleted = row_count;

    update public.financial_transaction_classifications c
    set updated_at = now()
    from public.financial_transactions t
    where c.transaction_id = t.id
      and c.user_id = v_user_id
      and c.base_normalized_label = v_base_label
      and t.currency = v_currency
      and (case when t.amount > 0 then 'credit' when t.amount < 0 then 'debit' else 'zero' end) = v_direction;
    get diagnostics v_affected = row_count;
  else
    update public.financial_transaction_classifications
    set updated_at = now()
    where transaction_id = p_transaction_id and user_id = v_user_id;
    get diagnostics v_affected = row_count;
  end if;

  return jsonb_build_object(
    'override_deleted', v_override_deleted,
    'rule_deleted', v_rule_deleted,
    'affected_transactions', v_affected
  );
end;
$$;

revoke all on function public.save_financial_transaction_correction(uuid,text,text,text,text,text,boolean,boolean) from public, anon, service_role;
revoke all on function public.clear_financial_transaction_correction(uuid,boolean) from public, anon, service_role;
grant execute on function public.save_financial_transaction_correction(uuid,text,text,text,text,text,boolean,boolean) to authenticated;
grant execute on function public.clear_financial_transaction_correction(uuid,boolean) to authenticated;

create or replace view public.financial_transaction_review_queue
with (security_invoker = true)
as
select
  t.user_id,
  t.id as transaction_id,
  t.account_id,
  t.status,
  coalesce(t.booking_date, t.value_date, t.first_seen_at::date) as transaction_date,
  t.booking_date,
  t.value_date,
  t.amount,
  t.currency,
  t.counterparty_name,
  t.merchant_name,
  t.description,
  t.remittance_information,
  t.transaction_note,
  t.bank_transaction_code,
  c.display_label,
  c.normalized_label,
  c.flow_type,
  c.category,
  c.subcategory,
  c.is_internal_transfer,
  c.is_fx_conversion,
  c.is_recurring,
  c.economic_inflow_type,
  c.interpretation_source,
  c.interpretation_override_id,
  c.interpretation_rule_id,
  c.user_confirmed_at,
  c.base_display_label,
  c.base_normalized_label,
  c.base_flow_type,
  c.base_category
from public.financial_transactions t
join public.financial_transaction_classifications c
  on c.transaction_id = t.id and c.user_id = t.user_id
join public.financial_accounts a on a.id = t.account_id
join public.financial_preferred_bank_connection p
  on p.id = a.connection_id and p.user_id = t.user_id;

comment on view public.financial_transaction_review_queue is
  'Preferred-connection transaction review surface combining canonical bank context with effective derived interpretation and user-confirmation provenance.';

revoke all on table public.financial_transaction_review_queue from public, anon;
grant select on table public.financial_transaction_review_queue to authenticated;

create or replace view public.financial_inflow_source_summary
with (security_invoker = true)
as
select
  t.user_id,
  t.currency,
  c.economic_inflow_type,
  public.financial_independence_class_for_inflow_semantic(c.economic_inflow_type) as independence_class,
  365::integer as window_days,
  sum(t.amount) as inflow_amount,
  count(*)::integer as transaction_count,
  min(coalesce(t.booking_date, t.value_date, t.first_seen_at::date)) as first_transaction_date,
  max(coalesce(t.booking_date, t.value_date, t.first_seen_at::date)) as last_transaction_date
from public.financial_transactions t
join public.financial_transaction_classifications c
  on c.transaction_id = t.id and c.user_id = t.user_id
join public.financial_accounts a on a.id = t.account_id
join public.financial_preferred_bank_connection p
  on p.id = a.connection_id and p.user_id = t.user_id
where t.status = 'booked'
  and t.amount > 0
  and c.economic_inflow_type is not null
  and coalesce(t.booking_date, t.value_date, t.first_seen_at::date) >= current_date - 364
group by t.user_id, t.currency, c.economic_inflow_type;

comment on view public.financial_inflow_source_summary is
  'Compact 365-day user-confirmed inflow semantics for Kleos financial-independence evaluation; generic positive transfers remain absent until explicitly classified.';

revoke all on table public.financial_inflow_source_summary from public, anon;
grant select on table public.financial_inflow_source_summary to authenticated;

insert into public.kleos_evidence_sources (group_key, relation_name, enabled)
values (
  'financial_inflow_source_summary',
  'public.financial_inflow_source_summary'::regclass,
  true
)
on conflict (group_key) do update
set relation_name = excluded.relation_name,
    enabled = excluded.enabled,
    updated_at = now();

commit;

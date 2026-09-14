begin;

alter table public.financial_counterparty_rules
  add column if not exists match_amount numeric;

alter table public.financial_counterparty_rules
  drop constraint if exists financial_counterparty_rules_match_amount_check;
alter table public.financial_counterparty_rules
  add constraint financial_counterparty_rules_match_amount_check
  check (match_amount is null or match_amount >= 0);

alter table public.financial_counterparty_rules
  drop constraint if exists financial_counterparty_rules_exact_match_unique;
alter table public.financial_counterparty_rules
  add constraint financial_counterparty_rules_exact_match_unique
  unique nulls not distinct (user_id, match_normalized_label, currency, amount_direction, match_amount);

create or replace function public.financial_apply_interpretation_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_amount numeric;
  v_currency text;
  v_direction text;
  v_rule public.financial_counterparty_rules%rowtype;
  v_override public.financial_transaction_overrides%rowtype;
  v_has_rule boolean := false;
  v_has_override boolean := false;
  v_semantic text;
begin
  if NEW.classifier_name <> 'kleos_user_interpretation' or NEW.base_normalized_label is null then
    NEW.base_display_label := NEW.display_label;
    NEW.base_normalized_label := NEW.normalized_label;
    NEW.base_flow_type := NEW.flow_type;
    NEW.base_category := NEW.category;
    NEW.base_subcategory := NEW.subcategory;
    NEW.base_is_internal_transfer := NEW.is_internal_transfer;
    NEW.base_classifier_name := NEW.classifier_name;
    NEW.base_classifier_version := NEW.classifier_version;
    NEW.base_confidence := NEW.confidence;
    NEW.base_classification_reason := NEW.classification_reason;
  end if;

  NEW.display_label := coalesce(NEW.base_display_label, NEW.display_label);
  NEW.normalized_label := coalesce(NEW.base_normalized_label, NEW.normalized_label);
  NEW.flow_type := coalesce(NEW.base_flow_type, NEW.flow_type);
  NEW.category := coalesce(NEW.base_category, NEW.category);
  NEW.subcategory := NEW.base_subcategory;
  NEW.is_internal_transfer := coalesce(NEW.base_is_internal_transfer, NEW.is_internal_transfer);
  NEW.classifier_name := coalesce(NEW.base_classifier_name, NEW.classifier_name);
  NEW.classifier_version := coalesce(NEW.base_classifier_version, NEW.classifier_version);
  NEW.confidence := coalesce(NEW.base_confidence, NEW.confidence);
  NEW.classification_reason := coalesce(NEW.base_classification_reason, NEW.classification_reason);
  NEW.economic_inflow_type := null;
  NEW.interpretation_source := 'deterministic';
  NEW.interpretation_override_id := null;
  NEW.interpretation_rule_id := null;
  NEW.user_confirmed_at := null;

  select t.amount, t.currency
  into v_amount, v_currency
  from public.financial_transactions t
  where t.id = NEW.transaction_id and t.user_id = NEW.user_id;

  if not found then return NEW; end if;
  v_direction := case when v_amount > 0 then 'credit' when v_amount < 0 then 'debit' else 'zero' end;

  select r.*
  into v_rule
  from public.financial_counterparty_rules r
  where r.user_id = NEW.user_id
    and r.is_active
    and r.match_normalized_label = NEW.base_normalized_label
    and r.currency = v_currency
    and r.amount_direction = v_direction
    and (r.match_amount is null or r.match_amount = abs(v_amount))
  order by (r.match_amount is not null) desc, r.confirmed_at desc
  limit 1;
  v_has_rule := found;

  if v_has_rule then
    v_semantic := v_rule.economic_inflow_type;
    if v_semantic is not null then
      NEW.economic_inflow_type := v_semantic;
      NEW.flow_type := public.financial_flow_type_for_inflow_semantic(v_semantic);
      NEW.category := public.financial_category_for_inflow_semantic(v_semantic);
      if v_semantic = 'internal_transfer' then NEW.is_internal_transfer := true; end if;
    end if;
    if v_rule.flow_type is not null then NEW.flow_type := v_rule.flow_type; end if;
    if v_rule.category is not null then NEW.category := v_rule.category; end if;
    if v_rule.subcategory is not null then NEW.subcategory := v_rule.subcategory; end if;
    if v_rule.display_label is not null then
      NEW.display_label := v_rule.display_label;
      NEW.normalized_label := public.financial_normalize_label(v_rule.display_label);
    end if;
    if v_rule.is_internal_transfer is not null then NEW.is_internal_transfer := v_rule.is_internal_transfer; end if;
    NEW.interpretation_source := 'counterparty_rule';
    NEW.interpretation_rule_id := v_rule.id;
    NEW.user_confirmed_at := v_rule.confirmed_at;
  end if;

  select o.*
  into v_override
  from public.financial_transaction_overrides o
  where o.user_id = NEW.user_id and o.transaction_id = NEW.transaction_id
  limit 1;
  v_has_override := found;

  if v_has_override then
    v_semantic := v_override.economic_inflow_type;
    if v_semantic is not null then
      NEW.economic_inflow_type := v_semantic;
      NEW.flow_type := public.financial_flow_type_for_inflow_semantic(v_semantic);
      NEW.category := public.financial_category_for_inflow_semantic(v_semantic);
      if v_semantic = 'internal_transfer' then NEW.is_internal_transfer := true; end if;
    end if;
    if v_override.flow_type is not null then NEW.flow_type := v_override.flow_type; end if;
    if v_override.category is not null then NEW.category := v_override.category; end if;
    if v_override.subcategory is not null then NEW.subcategory := v_override.subcategory; end if;
    if v_override.display_label is not null then
      NEW.display_label := v_override.display_label;
      NEW.normalized_label := public.financial_normalize_label(v_override.display_label);
    end if;
    if v_override.is_internal_transfer is not null then NEW.is_internal_transfer := v_override.is_internal_transfer; end if;
    NEW.interpretation_source := 'transaction_override';
    NEW.interpretation_override_id := v_override.id;
    NEW.user_confirmed_at := v_override.confirmed_at;
  end if;

  if v_has_override or v_has_rule then
    NEW.classifier_name := 'kleos_user_interpretation';
    NEW.classifier_version := '1.0.1';
    NEW.confidence := 1.000;
    NEW.classification_reason := case when v_has_override then 'user_confirmed_transaction_override' else 'user_confirmed_counterparty_rule' end;
  end if;

  return NEW;
end;
$$;

revoke all on function public.financial_apply_interpretation_trigger() from public, anon, authenticated, service_role;

drop function if exists public.save_financial_transaction_correction(uuid,text,text,text,text,text,boolean,boolean);

create function public.save_financial_transaction_correction(
  p_transaction_id uuid,
  p_flow_type text default null,
  p_category text default null,
  p_subcategory text default null,
  p_display_label text default null,
  p_economic_inflow_type text default null,
  p_is_internal_transfer boolean default null,
  p_apply_matching boolean default false,
  p_match_exact_amount boolean default false
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
  v_semantic text := nullif(btrim(p_economic_inflow_type), '');
  v_flow_type text := nullif(btrim(p_flow_type), '');
  v_category text := nullif(btrim(p_category), '');
  v_subcategory text := nullif(btrim(p_subcategory), '');
  v_display_label text := nullif(btrim(p_display_label), '');
  v_internal_transfer boolean := p_is_internal_transfer;
  v_match_amount numeric;
begin
  if v_user_id is null or v_email <> 'theneolorenzo@gmail.com' then
    raise exception using errcode = '42501', message = 'FINANCIAL_CORRECTION_NOT_AUTHORIZED';
  end if;

  if num_nonnulls(v_flow_type, v_category, v_subcategory, v_display_label, v_semantic, v_internal_transfer) = 0 then
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

  if v_semantic is not null then
    if v_amount <= 0 then
      raise exception using errcode = '22023', message = 'FINANCIAL_CORRECTION_INFLOW_REQUIRES_CREDIT';
    end if;
    v_flow_type := public.financial_flow_type_for_inflow_semantic(v_semantic);
    v_category := coalesce(v_category, public.financial_category_for_inflow_semantic(v_semantic));
    if v_semantic = 'internal_transfer' then v_internal_transfer := true; end if;
  end if;

  insert into public.financial_transaction_overrides (
    user_id, transaction_id, flow_type, category, subcategory, display_label,
    economic_inflow_type, is_internal_transfer, confirmed_at, updated_at
  ) values (
    v_user_id, p_transaction_id, v_flow_type, v_category, v_subcategory, v_display_label,
    v_semantic, v_internal_transfer, now(), now()
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
  v_match_amount := case when p_apply_matching and p_match_exact_amount then abs(v_amount) else null end;

  if p_apply_matching then
    insert into public.financial_counterparty_rules (
      user_id, match_normalized_label, currency, amount_direction, match_amount,
      flow_type, category, subcategory, display_label, economic_inflow_type,
      is_internal_transfer, is_active, confirmed_at, updated_at
    ) values (
      v_user_id, v_base_label, v_currency, v_direction, v_match_amount,
      v_flow_type, v_category, v_subcategory, v_display_label, v_semantic,
      v_internal_transfer, true, now(), now()
    )
    on conflict on constraint financial_counterparty_rules_exact_match_unique do update
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
      and (case when t.amount > 0 then 'credit' when t.amount < 0 then 'debit' else 'zero' end) = v_direction
      and (v_match_amount is null or abs(t.amount) = v_match_amount);
    get diagnostics v_affected = row_count;
  else
    update public.financial_transaction_classifications set updated_at = now()
    where transaction_id = p_transaction_id and user_id = v_user_id;
    get diagnostics v_affected = row_count;
  end if;

  return jsonb_build_object('override_id', v_override_id, 'rule_id', v_rule_id, 'match_amount', v_match_amount, 'affected_transactions', v_affected);
end;
$$;

revoke all on function public.save_financial_transaction_correction(uuid,text,text,text,text,text,boolean,boolean,boolean) from public, anon, service_role;
grant execute on function public.save_financial_transaction_correction(uuid,text,text,text,text,text,boolean,boolean,boolean) to authenticated;

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
  v_rule_id uuid;
  v_rule_label text;
  v_rule_currency text;
  v_rule_direction text;
  v_rule_match_amount numeric;
  v_override_deleted integer := 0;
  v_rule_deleted integer := 0;
  v_affected integer := 0;
begin
  if v_user_id is null or v_email <> 'theneolorenzo@gmail.com' then
    raise exception using errcode = '42501', message = 'FINANCIAL_CORRECTION_NOT_AUTHORIZED';
  end if;

  select c.interpretation_rule_id into v_rule_id
  from public.financial_transaction_classifications c
  where c.transaction_id = p_transaction_id and c.user_id = v_user_id;

  if not found then
    raise exception using errcode = '22023', message = 'FINANCIAL_CORRECTION_TRANSACTION_NOT_FOUND';
  end if;

  delete from public.financial_transaction_overrides where user_id = v_user_id and transaction_id = p_transaction_id;
  get diagnostics v_override_deleted = row_count;

  if p_clear_matching_rule and v_rule_id is not null then
    select match_normalized_label, currency, amount_direction, match_amount
    into v_rule_label, v_rule_currency, v_rule_direction, v_rule_match_amount
    from public.financial_counterparty_rules
    where id = v_rule_id and user_id = v_user_id;

    delete from public.financial_counterparty_rules where id = v_rule_id and user_id = v_user_id;
    get diagnostics v_rule_deleted = row_count;

    update public.financial_transaction_classifications c
    set updated_at = now()
    from public.financial_transactions t
    where c.transaction_id = t.id
      and c.user_id = v_user_id
      and c.base_normalized_label = v_rule_label
      and t.currency = v_rule_currency
      and (case when t.amount > 0 then 'credit' when t.amount < 0 then 'debit' else 'zero' end) = v_rule_direction
      and (v_rule_match_amount is null or abs(t.amount) = v_rule_match_amount);
    get diagnostics v_affected = row_count;
  else
    update public.financial_transaction_classifications set updated_at = now()
    where transaction_id = p_transaction_id and user_id = v_user_id;
    get diagnostics v_affected = row_count;
  end if;

  return jsonb_build_object('override_deleted', v_override_deleted, 'rule_deleted', v_rule_deleted, 'affected_transactions', v_affected);
end;
$$;

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
  c.base_category,
  r.match_amount as interpretation_rule_match_amount
from public.financial_transactions t
join public.financial_transaction_classifications c on c.transaction_id = t.id and c.user_id = t.user_id
join public.financial_accounts a on a.id = t.account_id
join public.financial_preferred_bank_connection p on p.id = a.connection_id and p.user_id = t.user_id
left join public.financial_counterparty_rules r on r.id = c.interpretation_rule_id and r.user_id = t.user_id;

revoke all on table public.financial_transaction_review_queue from public, anon;
grant select on table public.financial_transaction_review_queue to authenticated;

commit;

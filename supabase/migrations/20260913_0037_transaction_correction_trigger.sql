begin;
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

  if not found then
    return NEW;
  end if;

  v_direction := case when v_amount > 0 then 'credit' when v_amount < 0 then 'debit' else 'zero' end;

  select r.*
  into v_rule
  from public.financial_counterparty_rules r
  where r.user_id = NEW.user_id
    and r.is_active
    and r.match_normalized_label = NEW.base_normalized_label
    and r.currency = v_currency
    and r.amount_direction = v_direction
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
    NEW.classifier_version := '1.0.0';
    NEW.confidence := 1.000;
    NEW.classification_reason := case
      when v_has_override then 'user_confirmed_transaction_override'
      else 'user_confirmed_counterparty_rule'
    end;
  end if;

  return NEW;
end;
$$;

revoke all on function public.financial_apply_interpretation_trigger() from public, anon, authenticated, service_role;

drop trigger if exists financial_apply_interpretation_before_write
on public.financial_transaction_classifications;
create trigger financial_apply_interpretation_before_write
before insert or update on public.financial_transaction_classifications
for each row execute function public.financial_apply_interpretation_trigger();

commit;

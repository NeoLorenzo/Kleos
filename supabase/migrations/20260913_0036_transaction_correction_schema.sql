begin;

create or replace function public.financial_flow_type_for_inflow_semantic(p_semantic text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_semantic
    when 'earned_income' then 'income'
    when 'business_income' then 'income'
    when 'investment_income' then 'income'
    when 'trust_distribution' then 'transfer'
    when 'family_support' then 'transfer'
    when 'internal_transfer' then 'transfer'
    when 'sale_proceeds' then 'transfer'
    when 'refund_reimbursement' then 'refund'
    when 'other_inflow' then 'transfer'
    else null
  end;
$$;

create or replace function public.financial_category_for_inflow_semantic(p_semantic text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_semantic
    when 'earned_income' then 'earned_income'
    when 'business_income' then 'business_income'
    when 'investment_income' then 'investment_income'
    when 'trust_distribution' then 'trust_distribution'
    when 'family_support' then 'family_support'
    when 'internal_transfer' then 'internal_transfer'
    when 'sale_proceeds' then 'sale_proceeds'
    when 'refund_reimbursement' then 'refund_reimbursement'
    when 'other_inflow' then 'other_inflow'
    else null
  end;
$$;

create or replace function public.financial_independence_class_for_inflow_semantic(p_semantic text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_semantic
    when 'earned_income' then 'independent_earned'
    when 'business_income' then 'independent_earned'
    when 'investment_income' then 'independent_investment'
    when 'trust_distribution' then 'owned_capital_distribution'
    when 'family_support' then 'external_support'
    when 'internal_transfer' then 'internal_transfer'
    when 'sale_proceeds' then 'asset_sale'
    when 'refund_reimbursement' then 'refund'
    when 'other_inflow' then 'other'
    else null
  end;
$$;

revoke all on function public.financial_flow_type_for_inflow_semantic(text) from public, anon;
revoke all on function public.financial_category_for_inflow_semantic(text) from public, anon;
revoke all on function public.financial_independence_class_for_inflow_semantic(text) from public, anon;
grant execute on function public.financial_flow_type_for_inflow_semantic(text) to authenticated, service_role;
grant execute on function public.financial_category_for_inflow_semantic(text) to authenticated, service_role;
grant execute on function public.financial_independence_class_for_inflow_semantic(text) to authenticated, service_role;

create table if not exists public.financial_transaction_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  transaction_id uuid not null unique references public.financial_transactions(id) on delete cascade,
  flow_type text,
  category text,
  subcategory text,
  display_label text,
  economic_inflow_type text,
  is_internal_transfer boolean,
  confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_transaction_overrides_flow_check
    check (flow_type is null or flow_type in ('expense','income','transfer','refund','fee','interest','investment','tax','zero_value','unknown')),
  constraint financial_transaction_overrides_category_check
    check (category is null or length(btrim(category)) > 0),
  constraint financial_transaction_overrides_subcategory_check
    check (subcategory is null or length(btrim(subcategory)) > 0),
  constraint financial_transaction_overrides_display_label_check
    check (display_label is null or length(btrim(display_label)) > 0),
  constraint financial_transaction_overrides_inflow_semantic_check
    check (economic_inflow_type is null or economic_inflow_type in (
      'earned_income','business_income','investment_income','trust_distribution','family_support',
      'internal_transfer','sale_proceeds','refund_reimbursement','other_inflow'
    )),
  constraint financial_transaction_overrides_semantic_flow_consistency
    check (
      economic_inflow_type is null
      or flow_type is null
      or flow_type = public.financial_flow_type_for_inflow_semantic(economic_inflow_type)
    ),
  constraint financial_transaction_overrides_internal_transfer_consistency
    check (economic_inflow_type <> 'internal_transfer' or is_internal_transfer is distinct from false),
  constraint financial_transaction_overrides_has_interpretation
    check (num_nonnulls(flow_type, category, subcategory, display_label, economic_inflow_type, is_internal_transfer) > 0)
);

create index if not exists financial_transaction_overrides_user_confirmed_idx
on public.financial_transaction_overrides (user_id, confirmed_at desc);

create table if not exists public.financial_counterparty_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  match_normalized_label text not null,
  currency text not null,
  amount_direction text not null,
  flow_type text,
  category text,
  subcategory text,
  display_label text,
  economic_inflow_type text,
  is_internal_transfer boolean,
  is_active boolean not null default true,
  confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_counterparty_rules_match_label_check
    check (length(btrim(match_normalized_label)) > 0),
  constraint financial_counterparty_rules_currency_check
    check (currency ~ '^[A-Z]{3}$'),
  constraint financial_counterparty_rules_direction_check
    check (amount_direction in ('credit','debit','zero')),
  constraint financial_counterparty_rules_flow_check
    check (flow_type is null or flow_type in ('expense','income','transfer','refund','fee','interest','investment','tax','zero_value','unknown')),
  constraint financial_counterparty_rules_category_check
    check (category is null or length(btrim(category)) > 0),
  constraint financial_counterparty_rules_subcategory_check
    check (subcategory is null or length(btrim(subcategory)) > 0),
  constraint financial_counterparty_rules_display_label_check
    check (display_label is null or length(btrim(display_label)) > 0),
  constraint financial_counterparty_rules_inflow_semantic_check
    check (economic_inflow_type is null or economic_inflow_type in (
      'earned_income','business_income','investment_income','trust_distribution','family_support',
      'internal_transfer','sale_proceeds','refund_reimbursement','other_inflow'
    )),
  constraint financial_counterparty_rules_semantic_credit_only
    check (economic_inflow_type is null or amount_direction = 'credit'),
  constraint financial_counterparty_rules_semantic_flow_consistency
    check (
      economic_inflow_type is null
      or flow_type is null
      or flow_type = public.financial_flow_type_for_inflow_semantic(economic_inflow_type)
    ),
  constraint financial_counterparty_rules_internal_transfer_consistency
    check (economic_inflow_type <> 'internal_transfer' or is_internal_transfer is distinct from false),
  constraint financial_counterparty_rules_has_interpretation
    check (num_nonnulls(flow_type, category, subcategory, display_label, economic_inflow_type, is_internal_transfer) > 0),
  constraint financial_counterparty_rules_exact_match_unique
    unique (user_id, match_normalized_label, currency, amount_direction)
);

create index if not exists financial_counterparty_rules_user_active_idx
on public.financial_counterparty_rules (user_id, is_active, match_normalized_label, currency, amount_direction);

comment on table public.financial_transaction_overrides is
  'User-confirmed interpretation overrides for canonical bank transactions. These rows never mutate financial_transactions provider facts.';
comment on table public.financial_counterparty_rules is
  'Exact reusable user-confirmed interpretation rules keyed by deterministic normalized label, currency, and debit/credit direction.';

alter table public.financial_transaction_overrides enable row level security;
alter table public.financial_counterparty_rules enable row level security;

revoke all on table public.financial_transaction_overrides from public, anon, authenticated;
revoke all on table public.financial_counterparty_rules from public, anon, authenticated;
grant select on table public.financial_transaction_overrides to authenticated;
grant select on table public.financial_counterparty_rules to authenticated;
grant select, insert, update, delete on table public.financial_transaction_overrides to service_role;
grant select, insert, update, delete on table public.financial_counterparty_rules to service_role;

drop policy if exists "Authorized user can read financial transaction overrides"
on public.financial_transaction_overrides;
create policy "Authorized user can read financial transaction overrides"
on public.financial_transaction_overrides
for select to authenticated
using (
  auth.uid() = user_id
  and lower(coalesce(auth.jwt()->>'email', '')) = 'theneolorenzo@gmail.com'
);

drop policy if exists "Authorized user can read financial counterparty rules"
on public.financial_counterparty_rules;
create policy "Authorized user can read financial counterparty rules"
on public.financial_counterparty_rules
for select to authenticated
using (
  auth.uid() = user_id
  and lower(coalesce(auth.jwt()->>'email', '')) = 'theneolorenzo@gmail.com'
);

alter table public.financial_transaction_classifications
  add column if not exists base_display_label text,
  add column if not exists base_normalized_label text,
  add column if not exists base_flow_type text,
  add column if not exists base_category text,
  add column if not exists base_subcategory text,
  add column if not exists base_is_internal_transfer boolean,
  add column if not exists base_classifier_name text,
  add column if not exists base_classifier_version text,
  add column if not exists base_confidence numeric(4,3),
  add column if not exists base_classification_reason text,
  add column if not exists economic_inflow_type text,
  add column if not exists interpretation_source text not null default 'deterministic',
  add column if not exists interpretation_override_id uuid,
  add column if not exists interpretation_rule_id uuid,
  add column if not exists user_confirmed_at timestamptz;

alter table public.financial_transaction_classifications
  drop constraint if exists financial_transaction_classifications_interpretation_source_check;
alter table public.financial_transaction_classifications
  add constraint financial_transaction_classifications_interpretation_source_check
  check (interpretation_source in ('deterministic','counterparty_rule','transaction_override'));

alter table public.financial_transaction_classifications
  drop constraint if exists financial_transaction_classifications_economic_inflow_type_check;
alter table public.financial_transaction_classifications
  add constraint financial_transaction_classifications_economic_inflow_type_check
  check (economic_inflow_type is null or economic_inflow_type in (
    'earned_income','business_income','investment_income','trust_distribution','family_support',
    'internal_transfer','sale_proceeds','refund_reimbursement','other_inflow'
  ));

update public.financial_transaction_classifications
set base_display_label = coalesce(base_display_label, display_label),
    base_normalized_label = coalesce(base_normalized_label, normalized_label),
    base_flow_type = coalesce(base_flow_type, flow_type),
    base_category = coalesce(base_category, category),
    base_subcategory = coalesce(base_subcategory, subcategory),
    base_is_internal_transfer = coalesce(base_is_internal_transfer, is_internal_transfer),
    base_classifier_name = coalesce(base_classifier_name, classifier_name),
    base_classifier_version = coalesce(base_classifier_version, classifier_version),
    base_confidence = coalesce(base_confidence, confidence),
    base_classification_reason = coalesce(base_classification_reason, classification_reason),
    interpretation_source = 'deterministic',
    economic_inflow_type = null,
    interpretation_override_id = null,
    interpretation_rule_id = null,
    user_confirmed_at = null
where base_normalized_label is null;

commit;

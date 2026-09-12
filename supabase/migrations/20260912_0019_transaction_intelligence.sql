begin;

create table if not exists public.financial_transaction_classifications (
  transaction_id uuid primary key references public.financial_transactions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_label text not null,
  normalized_label text not null,
  flow_type text not null,
  category text not null,
  subcategory text,
  is_internal_transfer boolean not null default false,
  is_fx_conversion boolean not null default false,
  is_recurring boolean not null default false,
  recurrence_interval_days numeric(8,2),
  recurrence_occurrences integer,
  classifier_name text not null,
  classifier_version text not null,
  confidence numeric(4,3) not null,
  classification_reason text not null,
  classified_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_transaction_classifications_flow_type_check
    check (flow_type in ('expense','income','transfer','refund','fee','interest','investment','tax','zero_value','unknown')),
  constraint financial_transaction_classifications_category_not_blank
    check (length(btrim(category)) > 0),
  constraint financial_transaction_classifications_label_not_blank
    check (length(btrim(normalized_label)) > 0),
  constraint financial_transaction_classifications_confidence_check
    check (confidence >= 0 and confidence <= 1),
  constraint financial_transaction_classifications_recurrence_check
    check (
      (is_recurring = false and recurrence_interval_days is null and recurrence_occurrences is null)
      or
      (is_recurring = true and recurrence_occurrences is not null and recurrence_occurrences >= 2)
    )
);

create index if not exists financial_transaction_classifications_user_flow_idx
on public.financial_transaction_classifications (user_id, flow_type, category);

create index if not exists financial_transaction_classifications_user_recurring_idx
on public.financial_transaction_classifications (user_id, is_recurring, normalized_label)
where is_recurring = true;

comment on table public.financial_transaction_classifications is
  'Versioned derived interpretation of canonical bank transactions. Raw financial_transactions remain factual Open Banking evidence.';
comment on column public.financial_transaction_classifications.confidence is
  'Rule confidence for the combined flow/category interpretation, not a probability of transaction correctness.';

alter table public.financial_transaction_classifications enable row level security;

revoke all on table public.financial_transaction_classifications from public, anon, authenticated;
grant select on table public.financial_transaction_classifications to authenticated;
grant select, insert, update, delete on table public.financial_transaction_classifications to service_role;

drop policy if exists "Authorized user can read financial transaction classifications"
on public.financial_transaction_classifications;
create policy "Authorized user can read financial transaction classifications"
on public.financial_transaction_classifications
for select to authenticated
using (
  auth.uid() = user_id
  and lower(coalesce(auth.jwt()->>'email', '')) = 'theneolorenzo@gmail.com'
);

create or replace function public.financial_normalize_label(p_label text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    nullif(
      btrim(
        regexp_replace(
          regexp_replace(lower(coalesce(p_label, '')), '[^[:alnum:]&]+', ' ', 'g'),
          '\s+', ' ', 'g'
        )
      ),
      ''
    ),
    'transaction'
  );
$$;

revoke all on function public.financial_normalize_label(text) from public, anon, authenticated;
grant execute on function public.financial_normalize_label(text) to service_role;

create or replace function public.financial_category_for_label(p_label text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_label ~ '(uber eats|deliveroo|just eat|doordash|restaurant|restaurante|pizz|pizza|cafe|coffee|starbucks|mcdonald|burger|kfc|chick fil a|sushi|nando|five guys|domino|glovo|bolt food|terry|hopdoddy|yazawa|krispy|pastelaria|ramen|isteaks|falmer bar|hamb bairro)' then 'food_dining'
    when p_label ~ '(sainsbur|waitrose|tesco|aldi|lidl|mercadona|pingo doce|continente|supercor|cold storage|whole foods|wholefds|trader joe|heb store|co op retail|coop retail|grocery|supermarket|food mart|m&s simply food|apolonia|meidi ya|quad food store|wm supercenter)' then 'groceries'
    when p_label ~ '(uber trip|trainline|southern|transport for london|tfl travel|carris|metro|rail|taxi|parking|parq|bp restelo|shell|galp|repsol|fuel|gas station|chevron|brighton and hove bus|lim ride|lime ride)' then 'transport'
    when p_label ~ '(easyjet|ryanair|tap air|airbnb|booking com|hotel|hostel|headout|flight|airline|airport)' then 'travel'
    when p_label ~ '(epidemic sound|lucidchart|wemod|discord|youtube premium|google youtube|microsoft|nounproject|autocut|openai|chatgpt|adobe|notion|dropbox|google one|icloud|spotify|netflix|amazon prime|midjourney|github|canva|apple com|remini|vidiq|obsidian|soundraw|blackmagic cloud|godaddy|looka|restream|fantasypros|copyleaks|uber one|uber pass)' then 'subscriptions_software'
    when p_label ~ '(cinema|movie|steam|playstation|xbox|ticketmaster|eventbrite|night safari|uci el corte ingles|paypal ea|cdkeys|xsolla|twitch)' then 'entertainment'
    when p_label ~ '(gym|fitness|pharmacy|farmacia|dentist|dental|clinic|clinica|health|sports complex|academia life club|cuf)' then 'fitness_health'
    when p_label ~ '(university|college|udemy|coursera|edx|school|tuition|bookshop|baccalaureate|bertrand)' then 'education'
    when p_label ~ '(vodafone|(^| )meo( |$)|(^| )nos( |$)|att bill|at&t|octopus energy|electric|water|internet|broadband|utility)' then 'telecom_utilities'
    when p_label ~ '(laundry|lovespace|cleaning|storage|moving)' then 'household'
    when p_label ~ '(amazon|amzn|zara|h&m|nike|adidas|uniqlo|asos|ikea|temu|shein|ebay|etsy|el corte ingles|target|walmart|wal mart|mpb com|youngla|cosmetics|wh smith|smoke shop)' then 'shopping'
    else 'other'
  end;
$$;

revoke all on function public.financial_category_for_label(text) from public, anon, authenticated;
grant execute on function public.financial_category_for_label(text) to service_role;

create or replace function public.refresh_financial_transaction_classifications(
  p_user_id uuid,
  p_connection_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_classified_count integer := 0;
  v_recurring_count integer := 0;
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'FINANCIAL_CLASSIFICATION_USER_REQUIRED';
  end if;

  if p_connection_id is not null and not exists (
    select 1
    from public.financial_bank_connections c
    where c.id = p_connection_id and c.user_id = p_user_id
  ) then
    raise exception using errcode = '22023', message = 'FINANCIAL_CLASSIFICATION_CONNECTION_NOT_FOUND';
  end if;

  with scoped as (
    select
      t.id as transaction_id,
      t.user_id,
      t.amount,
      t.currency,
      t.merchant_name,
      t.counterparty_name,
      t.description,
      coalesce(t.raw_data->'bank_transaction_code'->>'code', '') as bank_code,
      a.connection_id
    from public.financial_transactions t
    join public.financial_accounts a on a.id = t.account_id
    where t.user_id = p_user_id
      and (p_connection_id is null or a.connection_id = p_connection_id)
  ), labels as (
    select
      s.*,
      case
        when s.bank_code = 'CARD_REFUND' and coalesce(s.description, '') ~* '^refund from\s+'
          then regexp_replace(s.description, '^refund from\s+', '', 'i')
        else coalesce(nullif(s.merchant_name, ''), nullif(s.counterparty_name, ''), nullif(s.description, ''), 'Transaction')
      end as display_label
    from scoped s
  ), normalized as (
    select l.*, public.financial_normalize_label(l.display_label) as normalized_label
    from labels l
  ), derived as (
    select
      n.*,
      case
        when n.amount = 0 then 'zero_value'
        when n.bank_code = 'EXCHANGE' then 'transfer'
        when n.bank_code in ('TRANSFER', 'TOPUP', 'ATM') then 'transfer'
        when n.bank_code in ('FEE', 'CHARGE') then 'fee'
        when n.bank_code = 'CARD_REFUND' then 'refund'
        when n.bank_code in ('CARD_PAYMENT', 'REV_PAYMENT') and n.amount < 0 then 'expense'
        when n.bank_code ~ '(SALARY|INCOME)' and n.amount > 0 then 'income'
        when n.bank_code ~ 'INTEREST' then 'interest'
        when n.bank_code ~ 'INVEST|SECURIT|BROKER' then 'investment'
        when n.bank_code ~ 'TAX' then 'tax'
        else 'unknown'
      end as flow_type,
      case
        when n.amount = 0 then 'zero_value'
        when n.bank_code = 'EXCHANGE' then 'currency_exchange'
        when n.bank_code = 'TRANSFER' then 'transfers'
        when n.bank_code = 'TOPUP' then 'account_topup'
        when n.bank_code = 'ATM' then 'cash_withdrawal'
        when n.bank_code in ('FEE', 'CHARGE') then 'bank_fees'
        when n.bank_code = 'CARD_REFUND' then public.financial_category_for_label(n.normalized_label)
        when n.bank_code in ('CARD_PAYMENT', 'REV_PAYMENT') then public.financial_category_for_label(n.normalized_label)
        when n.bank_code ~ '(SALARY|INCOME)' then 'income'
        when n.bank_code ~ 'INTEREST' then 'interest'
        when n.bank_code ~ 'INVEST|SECURIT|BROKER' then 'investments'
        when n.bank_code ~ 'TAX' then 'taxes'
        else 'unknown'
      end as category,
      case when n.bank_code in ('EXCHANGE', 'ATM') then true else false end as is_internal_transfer,
      case when n.bank_code = 'EXCHANGE' then true else false end as is_fx_conversion
    from normalized n
  )
  insert into public.financial_transaction_classifications (
    transaction_id,
    user_id,
    display_label,
    normalized_label,
    flow_type,
    category,
    subcategory,
    is_internal_transfer,
    is_fx_conversion,
    is_recurring,
    recurrence_interval_days,
    recurrence_occurrences,
    classifier_name,
    classifier_version,
    confidence,
    classification_reason,
    classified_at,
    updated_at
  )
  select
    d.transaction_id,
    d.user_id,
    d.display_label,
    d.normalized_label,
    d.flow_type,
    d.category,
    null,
    d.is_internal_transfer,
    d.is_fx_conversion,
    false,
    null,
    null,
    'kleos_deterministic_rules',
    '1.0.0',
    case
      when d.amount = 0 then 1.000
      when d.bank_code in ('EXCHANGE','TRANSFER','TOPUP','ATM','FEE','CHARGE','CARD_REFUND') then 0.990
      when d.bank_code in ('CARD_PAYMENT','REV_PAYMENT') and d.category <> 'other' then 0.900
      when d.bank_code in ('CARD_PAYMENT','REV_PAYMENT') then 0.700
      when d.flow_type <> 'unknown' then 0.750
      else 0.200
    end,
    case
      when d.amount = 0 then 'provider_zero_amount'
      when d.bank_code = 'EXCHANGE' then 'provider_code_exchange'
      when d.bank_code = 'TRANSFER' then 'provider_code_transfer'
      when d.bank_code = 'TOPUP' then 'provider_code_topup'
      when d.bank_code = 'ATM' then 'provider_code_atm'
      when d.bank_code in ('FEE','CHARGE') then 'provider_code_fee'
      when d.bank_code = 'CARD_REFUND' then 'provider_code_card_refund'
      when d.bank_code in ('CARD_PAYMENT','REV_PAYMENT') then 'provider_code_card_spend'
      when d.bank_code ~ '(SALARY|INCOME)' then 'provider_code_income'
      when d.bank_code ~ 'INTEREST' then 'provider_code_interest'
      when d.bank_code ~ 'INVEST|SECURIT|BROKER' then 'provider_code_investment'
      when d.bank_code ~ 'TAX' then 'provider_code_tax'
      else 'unrecognized_provider_code'
    end,
    now(),
    now()
  from derived d
  on conflict (transaction_id) do update
  set user_id = excluded.user_id,
      display_label = excluded.display_label,
      normalized_label = excluded.normalized_label,
      flow_type = excluded.flow_type,
      category = excluded.category,
      subcategory = excluded.subcategory,
      is_internal_transfer = excluded.is_internal_transfer,
      is_fx_conversion = excluded.is_fx_conversion,
      is_recurring = false,
      recurrence_interval_days = null,
      recurrence_occurrences = null,
      classifier_name = excluded.classifier_name,
      classifier_version = excluded.classifier_version,
      confidence = excluded.confidence,
      classification_reason = excluded.classification_reason,
      classified_at = excluded.classified_at,
      updated_at = excluded.updated_at;

  get diagnostics v_classified_count = row_count;

  with eligible as (
    select
      c.transaction_id,
      c.user_id,
      c.normalized_label,
      t.currency,
      coalesce(t.booking_date, t.value_date, t.first_seen_at::date) as tx_date,
      abs(t.amount) as amount_abs,
      lag(coalesce(t.booking_date, t.value_date, t.first_seen_at::date)) over (
        partition by c.user_id, c.normalized_label, t.currency
        order by coalesce(t.booking_date, t.value_date, t.first_seen_at::date), t.id
      ) as previous_date
    from public.financial_transaction_classifications c
    join public.financial_transactions t on t.id = c.transaction_id
    join public.financial_accounts a on a.id = t.account_id
    where c.user_id = p_user_id
      and (p_connection_id is null or a.connection_id = p_connection_id)
      and c.flow_type in ('expense', 'fee')
      and t.status = 'booked'
      and t.amount < 0
      and coalesce(t.booking_date, t.value_date, t.first_seen_at::date) is not null
  ), stats as (
    select
      user_id,
      normalized_label,
      currency,
      count(*)::integer as occurrences,
      count(distinct date_trunc('month', tx_date::timestamp))::integer as active_months,
      avg(amount_abs) as average_amount,
      stddev_pop(amount_abs) as amount_stddev,
      avg((tx_date - previous_date)::numeric) filter (where previous_date is not null) as average_gap_days
    from eligible
    group by user_id, normalized_label, currency
  ), recurring_groups as (
    select s.*
    from stats s
    where (
      s.active_months >= 3
      and s.occurrences >= 3
      and s.normalized_label ~ '(epidemic sound|lucidchart|wemod|discord|youtube premium|google youtube|microsoft|nounproject|autocut|openai|chatgpt|adobe|notion|dropbox|google one|icloud|spotify|netflix|amazon prime|midjourney|github|canva|remini|vidiq|obsidian|soundraw|blackmagic cloud|godaddy|looka|restream|fantasypros|copyleaks|uber one|uber pass|metal .*plan fee|metal repricing)'
    )
    or (
      s.active_months >= 3
      and s.occurrences >= 3
      and s.average_gap_days between 25 and 36
      and coalesce(s.amount_stddev / nullif(s.average_amount, 0), 0) <= 0.20
    )
    or (
      s.active_months >= 2
      and s.occurrences >= 2
      and s.average_gap_days between 330 and 400
      and coalesce(s.amount_stddev / nullif(s.average_amount, 0), 0) <= 0.20
    )
  )
  update public.financial_transaction_classifications c
  set is_recurring = true,
      recurrence_interval_days = round(r.average_gap_days, 2),
      recurrence_occurrences = r.occurrences,
      updated_at = now()
  from public.financial_transactions t,
       recurring_groups r
  where c.transaction_id = t.id
    and c.user_id = r.user_id
    and c.normalized_label = r.normalized_label
    and t.currency = r.currency
    and c.user_id = p_user_id;

  select count(*)::integer
  into v_recurring_count
  from public.financial_transaction_classifications c
  join public.financial_transactions t on t.id = c.transaction_id
  join public.financial_accounts a on a.id = t.account_id
  where c.user_id = p_user_id
    and c.is_recurring = true
    and (p_connection_id is null or a.connection_id = p_connection_id);

  return jsonb_build_object(
    'classified_count', v_classified_count,
    'recurring_transaction_count', v_recurring_count,
    'classifier_version', '1.0.0'
  );
end;
$$;

revoke all on function public.refresh_financial_transaction_classifications(uuid, uuid) from public, anon, authenticated;
grant execute on function public.refresh_financial_transaction_classifications(uuid, uuid) to service_role;

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
  round(
    avg(abs(t.amount)) * 365 / nullif(avg(c.recurrence_interval_days), 0),
    2
  ) as annualized_estimate,
  max(coalesce(t.booking_date, t.value_date, t.first_seen_at::date)) >=
    current_date - greatest(90, coalesce((avg(c.recurrence_interval_days) * 2)::integer, 90)) as active_recently
from public.financial_transactions t
join public.financial_transaction_classifications c on c.transaction_id = t.id
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
where t.status = 'booked'
group by t.user_id, t.currency;

revoke all on table public.financial_cash_flow_monthly from public, anon, authenticated;
revoke all on table public.financial_spending_by_category from public, anon, authenticated;
revoke all on table public.financial_cash_flow_rolling from public, anon, authenticated;
revoke all on table public.financial_top_merchants from public, anon, authenticated;
revoke all on table public.financial_recurring_expenses from public, anon, authenticated;
revoke all on table public.financial_classification_coverage from public, anon, authenticated;

grant select on table public.financial_cash_flow_monthly to authenticated;
grant select on table public.financial_spending_by_category to authenticated;
grant select on table public.financial_cash_flow_rolling to authenticated;
grant select on table public.financial_top_merchants to authenticated;
grant select on table public.financial_recurring_expenses to authenticated;
grant select on table public.financial_classification_coverage to authenticated;

insert into public.kleos_evidence_sources (group_key, relation_name, enabled)
values
  ('financial_cash_flow_monthly', 'public.financial_cash_flow_monthly'::regclass, true),
  ('financial_spending_by_category', 'public.financial_spending_by_category'::regclass, true),
  ('financial_recurring_expenses', 'public.financial_recurring_expenses'::regclass, true),
  ('financial_classification_coverage', 'public.financial_classification_coverage'::regclass, true)
on conflict (group_key) do update
set relation_name = excluded.relation_name,
    enabled = excluded.enabled,
    updated_at = now();

do $$
declare
  r record;
begin
  for r in
    select distinct a.user_id, a.connection_id
    from public.financial_accounts a
  loop
    perform public.refresh_financial_transaction_classifications(r.user_id, r.connection_id);
  end loop;
end;
$$;

commit;

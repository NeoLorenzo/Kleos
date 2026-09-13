begin;

-- Kleos #72: canonical personal balance sheet with historical observations.
-- Currency remains explicit throughout; no implicit FX conversion is performed.

create table if not exists public.financial_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  category text not null,
  currency text not null,
  ownership_pct numeric(5,2) not null default 100,
  control_level text not null default 'direct',
  liquidity_class text not null default 'unknown',
  source_type text not null default 'manual',
  started_on date not null default current_date,
  ended_on date,
  is_active boolean generated always as (ended_on is null) stored,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_assets_name_not_blank check (length(btrim(name)) > 0),
  constraint financial_assets_category_check check (category in (
    'cash_bank', 'brokerage_investments', 'trust_beneficial_interest', 'property',
    'private_company_interest', 'crypto', 'vehicle', 'tangible_valuables',
    'receivable', 'other'
  )),
  constraint financial_assets_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint financial_assets_ownership_check check (ownership_pct > 0 and ownership_pct <= 100),
  constraint financial_assets_control_check check (control_level in (
    'direct', 'shared', 'restricted', 'trustee_controlled', 'unknown'
  )),
  constraint financial_assets_liquidity_check check (liquidity_class in (
    'immediate', 'within_30_days', 'within_1_year', 'illiquid', 'unknown'
  )),
  constraint financial_assets_source_check check (source_type in ('manual', 'external_sync', 'other')),
  constraint financial_assets_lifecycle_check check (ended_on is null or ended_on >= started_on)
);

create index if not exists financial_assets_user_active_idx
on public.financial_assets (user_id, is_active desc, category, name);

create table if not exists public.financial_asset_valuations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  asset_id uuid not null references public.financial_assets(id) on delete cascade,
  value numeric(24,8) not null,
  currency text not null,
  valuation_date date not null,
  valuation_method text not null default 'manual_estimate',
  valuation_source text not null default 'user',
  confidence text not null default 'medium',
  notes text,
  created_at timestamptz not null default now(),
  constraint financial_asset_valuations_value_check check (value >= 0),
  constraint financial_asset_valuations_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint financial_asset_valuations_method_check check (valuation_method in (
    'manual_estimate', 'statement', 'market_price', 'appraisal', 'nominal', 'other'
  )),
  constraint financial_asset_valuations_source_check check (valuation_source in (
    'user', 'institution_statement', 'market_quote', 'appraisal', 'other'
  )),
  constraint financial_asset_valuations_confidence_check check (confidence in ('low', 'medium', 'high'))
);

create index if not exists financial_asset_valuations_asset_date_idx
on public.financial_asset_valuations (asset_id, valuation_date desc, created_at desc);
create index if not exists financial_asset_valuations_user_date_idx
on public.financial_asset_valuations (user_id, valuation_date desc, created_at desc);

create table if not exists public.financial_liabilities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  category text not null,
  currency text not null,
  source_type text not null default 'manual',
  started_on date not null default current_date,
  ended_on date,
  is_active boolean generated always as (ended_on is null) stored,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_liabilities_name_not_blank check (length(btrim(name)) > 0),
  constraint financial_liabilities_category_check check (category in (
    'mortgage', 'personal_bank_loan', 'credit_card', 'student_debt', 'tax_liability',
    'bnpl', 'margin_debt', 'family_personal_loan', 'other'
  )),
  constraint financial_liabilities_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint financial_liabilities_source_check check (source_type in ('manual', 'external_sync', 'other')),
  constraint financial_liabilities_lifecycle_check check (ended_on is null or ended_on >= started_on)
);

create index if not exists financial_liabilities_user_active_idx
on public.financial_liabilities (user_id, is_active desc, category, name);

create table if not exists public.financial_liability_balances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  liability_id uuid not null references public.financial_liabilities(id) on delete cascade,
  amount numeric(24,8) not null,
  currency text not null,
  balance_date date not null,
  balance_source text not null default 'user',
  confidence text not null default 'high',
  notes text,
  created_at timestamptz not null default now(),
  constraint financial_liability_balances_amount_check check (amount >= 0),
  constraint financial_liability_balances_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint financial_liability_balances_source_check check (balance_source in (
    'user', 'institution_statement', 'creditor_statement', 'other'
  )),
  constraint financial_liability_balances_confidence_check check (confidence in ('low', 'medium', 'high'))
);

create index if not exists financial_liability_balances_liability_date_idx
on public.financial_liability_balances (liability_id, balance_date desc, created_at desc);
create index if not exists financial_liability_balances_user_date_idx
on public.financial_liability_balances (user_id, balance_date desc, created_at desc);

create table if not exists public.financial_liability_attestations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  attestation_type text not null default 'no_known_liabilities',
  scope text not null default 'personal',
  as_of_date date not null,
  created_at timestamptz not null default now(),
  constraint financial_liability_attestations_type_check
    check (attestation_type = 'no_known_liabilities'),
  constraint financial_liability_attestations_scope_check
    check (scope = 'personal'),
  constraint financial_liability_attestations_unique
    unique (user_id, attestation_type, scope, as_of_date)
);

create index if not exists financial_liability_attestations_user_date_idx
on public.financial_liability_attestations (user_id, as_of_date desc, created_at desc);

comment on table public.financial_assets is
  'Canonical asset identities maintained independently from historical valuations. Synced bank cash is not duplicated here by default.';
comment on table public.financial_asset_valuations is
  'Append-only dated asset valuation evidence. Historical valuations are preserved rather than overwritten.';
comment on table public.financial_liabilities is
  'Canonical liability identities. An empty table is not evidence that the user has no liabilities.';
comment on table public.financial_liability_balances is
  'Append-only dated outstanding-liability observations.';
comment on table public.financial_liability_attestations is
  'Append-only affirmative user attestations such as no known personal liabilities as of a specific date.';
comment on column public.financial_assets.ownership_pct is
  'Economic ownership percentage used to derive ownership-adjusted asset value.';
comment on column public.financial_assets.liquidity_class is
  'Conservative accessibility class; only immediate and within_30_days count as liquid in current balance-sheet views.';

alter table public.financial_assets enable row level security;
alter table public.financial_asset_valuations enable row level security;
alter table public.financial_liabilities enable row level security;
alter table public.financial_liability_balances enable row level security;
alter table public.financial_liability_attestations enable row level security;

revoke all on table public.financial_assets from public, anon, authenticated;
revoke all on table public.financial_asset_valuations from public, anon, authenticated;
revoke all on table public.financial_liabilities from public, anon, authenticated;
revoke all on table public.financial_liability_balances from public, anon, authenticated;
revoke all on table public.financial_liability_attestations from public, anon, authenticated;

grant select, insert, update, delete on table public.financial_assets to authenticated;
grant select, insert on table public.financial_asset_valuations to authenticated;
grant select, insert, update, delete on table public.financial_liabilities to authenticated;
grant select, insert on table public.financial_liability_balances to authenticated;
grant select, insert on table public.financial_liability_attestations to authenticated;

drop policy if exists "Authorized user can manage financial assets" on public.financial_assets;
create policy "Authorized user can manage financial assets"
on public.financial_assets for all to authenticated
using (
  auth.uid() = user_id
  and lower(coalesce(auth.jwt()->>'email', '')) = 'theneolorenzo@gmail.com'
)
with check (
  auth.uid() = user_id
  and lower(coalesce(auth.jwt()->>'email', '')) = 'theneolorenzo@gmail.com'
);

drop policy if exists "Authorized user can read financial asset valuations" on public.financial_asset_valuations;
create policy "Authorized user can read financial asset valuations"
on public.financial_asset_valuations for select to authenticated
using (
  auth.uid() = user_id
  and lower(coalesce(auth.jwt()->>'email', '')) = 'theneolorenzo@gmail.com'
);

drop policy if exists "Authorized user can add financial asset valuations" on public.financial_asset_valuations;
create policy "Authorized user can add financial asset valuations"
on public.financial_asset_valuations for insert to authenticated
with check (
  auth.uid() = user_id
  and lower(coalesce(auth.jwt()->>'email', '')) = 'theneolorenzo@gmail.com'
  and exists (
    select 1 from public.financial_assets a
    where a.id = asset_id and a.user_id = auth.uid()
  )
);

drop policy if exists "Authorized user can manage financial liabilities" on public.financial_liabilities;
create policy "Authorized user can manage financial liabilities"
on public.financial_liabilities for all to authenticated
using (
  auth.uid() = user_id
  and lower(coalesce(auth.jwt()->>'email', '')) = 'theneolorenzo@gmail.com'
)
with check (
  auth.uid() = user_id
  and lower(coalesce(auth.jwt()->>'email', '')) = 'theneolorenzo@gmail.com'
);

drop policy if exists "Authorized user can read financial liability balances" on public.financial_liability_balances;
create policy "Authorized user can read financial liability balances"
on public.financial_liability_balances for select to authenticated
using (
  auth.uid() = user_id
  and lower(coalesce(auth.jwt()->>'email', '')) = 'theneolorenzo@gmail.com'
);

drop policy if exists "Authorized user can add financial liability balances" on public.financial_liability_balances;
create policy "Authorized user can add financial liability balances"
on public.financial_liability_balances for insert to authenticated
with check (
  auth.uid() = user_id
  and lower(coalesce(auth.jwt()->>'email', '')) = 'theneolorenzo@gmail.com'
  and exists (
    select 1 from public.financial_liabilities l
    where l.id = liability_id and l.user_id = auth.uid()
  )
);

drop policy if exists "Authorized user can read financial liability attestations" on public.financial_liability_attestations;
create policy "Authorized user can read financial liability attestations"
on public.financial_liability_attestations for select to authenticated
using (
  auth.uid() = user_id
  and lower(coalesce(auth.jwt()->>'email', '')) = 'theneolorenzo@gmail.com'
);

drop policy if exists "Authorized user can add financial liability attestations" on public.financial_liability_attestations;
create policy "Authorized user can add financial liability attestations"
on public.financial_liability_attestations for insert to authenticated
with check (
  auth.uid() = user_id
  and lower(coalesce(auth.jwt()->>'email', '')) = 'theneolorenzo@gmail.com'
);

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
  v.currency,
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
  b.currency,
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

create or replace view public.financial_liability_status
with (security_invoker = true)
as
with owners as (
  select user_id from public.financial_liabilities
  union
  select user_id from public.financial_liability_attestations
), current_counts as (
  select user_id,
         count(*)::integer as active_liability_count,
         count(*) filter (where amount is not null and amount > 0)::integer as positive_balance_liability_count,
         max(balance_date) as latest_liability_balance_date
  from public.financial_current_liabilities
  group by user_id
), latest_attestation as (
  select distinct on (user_id)
    user_id,
    id as attestation_id,
    as_of_date,
    created_at
  from public.financial_liability_attestations
  where attestation_type = 'no_known_liabilities'
    and scope = 'personal'
  order by user_id, as_of_date desc, created_at desc, id desc
)
select
  o.user_id,
  coalesce(c.active_liability_count, 0) as active_liability_count,
  coalesce(c.positive_balance_liability_count, 0) as positive_balance_liability_count,
  c.latest_liability_balance_date,
  a.attestation_id as latest_no_known_liabilities_attestation_id,
  a.as_of_date as latest_no_known_liabilities_as_of,
  a.created_at as latest_no_known_liabilities_confirmed_at,
  (a.attestation_id is not null and coalesce(c.active_liability_count, 0) = 0) as affirmative_no_known_liabilities
from owners o
left join current_counts c on c.user_id = o.user_id
left join latest_attestation a on a.user_id = o.user_id;

create or replace view public.financial_balance_sheet_current
with (security_invoker = true)
as
with manual_assets as (
  select
    user_id,
    currency,
    sum(ownership_adjusted_value) filter (where ownership_adjusted_value is not null) as manual_asset_value,
    sum(ownership_adjusted_value) filter (
      where ownership_adjusted_value is not null
        and liquidity_class in ('immediate', 'within_30_days')
    ) as manual_liquid_value,
    count(*) filter (where ownership_adjusted_value is not null)::integer as valued_manual_asset_count,
    count(*)::integer as manual_asset_count,
    max(valuation_date) as latest_asset_valuation_date
  from public.financial_current_assets
  group by user_id, currency
), preferred_bank_balance_ranked as (
  select
    b.user_id,
    b.account_id,
    b.currency,
    b.amount,
    b.reference_date,
    b.observed_at,
    row_number() over (
      partition by b.account_id, b.currency
      order by case b.balance_type
        when 'CLAV' then 1
        when 'ITAV' then 2
        when 'CLBD' then 3
        when 'ITBD' then 4
        when 'XPCD' then 5
        when 'FWAV' then 6
        when 'OPAV' then 7
        when 'OPBD' then 8
        else 99
      end,
      b.observed_at desc
    ) as rn
  from public.financial_current_balances b
  join public.financial_accounts fa
    on fa.id = b.account_id
   and fa.user_id = b.user_id
   and fa.is_current
  join public.financial_preferred_bank_connection pc
    on pc.id = fa.connection_id
   and pc.user_id = fa.user_id
), bank_assets as (
  select
    user_id,
    currency,
    sum(amount) as bank_asset_value,
    count(*)::integer as bank_account_count,
    max(coalesce(reference_date, observed_at::date)) as latest_bank_balance_date
  from preferred_bank_balance_ranked
  where rn = 1
  group by user_id, currency
), liabilities as (
  select
    user_id,
    currency,
    sum(amount) filter (where amount is not null) as liability_value,
    count(*) filter (where amount is not null)::integer as valued_liability_count,
    count(*)::integer as liability_count,
    max(balance_date) as latest_liability_balance_date
  from public.financial_current_liabilities
  group by user_id, currency
), keys as (
  select user_id, currency from manual_assets
  union
  select user_id, currency from bank_assets
  union
  select user_id, currency from liabilities
)
select
  k.user_id,
  k.currency,
  coalesce(ma.manual_asset_value, 0) as manual_asset_value,
  coalesce(ba.bank_asset_value, 0) as bank_asset_value,
  coalesce(ma.manual_asset_value, 0) + coalesce(ba.bank_asset_value, 0) as total_assets,
  coalesce(li.liability_value, 0) as total_liabilities,
  coalesce(ma.manual_asset_value, 0) + coalesce(ba.bank_asset_value, 0) - coalesce(li.liability_value, 0) as net_worth,
  coalesce(ma.manual_liquid_value, 0) + coalesce(ba.bank_asset_value, 0) as liquid_assets,
  coalesce(ma.manual_liquid_value, 0) + coalesce(ba.bank_asset_value, 0) - coalesce(li.liability_value, 0) as liquid_net_worth,
  coalesce(ma.manual_asset_count, 0) as manual_asset_count,
  coalesce(ma.valued_manual_asset_count, 0) as valued_manual_asset_count,
  coalesce(ba.bank_account_count, 0) as bank_account_count,
  coalesce(li.liability_count, 0) as liability_count,
  coalesce(li.valued_liability_count, 0) as valued_liability_count,
  ma.latest_asset_valuation_date,
  ba.latest_bank_balance_date,
  li.latest_liability_balance_date
from keys k
left join manual_assets ma on ma.user_id = k.user_id and ma.currency = k.currency
left join bank_assets ba on ba.user_id = k.user_id and ba.currency = k.currency
left join liabilities li on li.user_id = k.user_id and li.currency = k.currency;

create or replace view public.financial_asset_allocation_current
with (security_invoker = true)
as
with manual as (
  select
    user_id,
    currency,
    category,
    'manual'::text as source_type,
    sum(ownership_adjusted_value) as value,
    count(*)::integer as item_count
  from public.financial_current_assets
  where ownership_adjusted_value is not null
  group by user_id, currency, category
), bank_ranked as (
  select
    b.user_id,
    b.account_id,
    b.currency,
    b.amount,
    row_number() over (
      partition by b.account_id, b.currency
      order by case b.balance_type
        when 'CLAV' then 1 when 'ITAV' then 2 when 'CLBD' then 3 when 'ITBD' then 4
        when 'XPCD' then 5 when 'FWAV' then 6 when 'OPAV' then 7 when 'OPBD' then 8 else 99 end,
      b.observed_at desc
    ) as rn
  from public.financial_current_balances b
  join public.financial_accounts fa
    on fa.id = b.account_id and fa.user_id = b.user_id and fa.is_current
  join public.financial_preferred_bank_connection pc
    on pc.id = fa.connection_id and pc.user_id = fa.user_id
), bank as (
  select
    user_id,
    currency,
    'cash_bank'::text as category,
    'bank_synced'::text as source_type,
    sum(amount) as value,
    count(*)::integer as item_count
  from bank_ranked
  where rn = 1
  group by user_id, currency
)
select * from manual
union all
select * from bank;

create or replace view public.financial_net_worth_history
with (security_invoker = true)
as
with event_dates as (
  select av.user_id, av.currency, av.valuation_date as as_of_date
  from public.financial_asset_valuations av
  union
  select lb.user_id, lb.currency, lb.balance_date
  from public.financial_liability_balances lb
), asset_state as (
  select
    d.user_id,
    d.currency,
    d.as_of_date,
    a.id as asset_id,
    v.value * a.ownership_pct / 100.0 as value
  from event_dates d
  join public.financial_assets a
    on a.user_id = d.user_id
   and a.currency = d.currency
   and a.started_on <= d.as_of_date
   and (a.ended_on is null or d.as_of_date < a.ended_on)
  left join lateral (
    select av.value
    from public.financial_asset_valuations av
    where av.asset_id = a.id
      and av.user_id = a.user_id
      and av.currency = d.currency
      and av.valuation_date <= d.as_of_date
    order by av.valuation_date desc, av.created_at desc, av.id desc
    limit 1
  ) v on true
), liability_state as (
  select
    d.user_id,
    d.currency,
    d.as_of_date,
    l.id as liability_id,
    b.amount
  from event_dates d
  join public.financial_liabilities l
    on l.user_id = d.user_id
   and l.currency = d.currency
   and l.started_on <= d.as_of_date
   and (l.ended_on is null or d.as_of_date < l.ended_on)
  left join lateral (
    select lb.amount
    from public.financial_liability_balances lb
    where lb.liability_id = l.id
      and lb.user_id = l.user_id
      and lb.currency = d.currency
      and lb.balance_date <= d.as_of_date
    order by lb.balance_date desc, lb.created_at desc, lb.id desc
    limit 1
  ) b on true
), asset_agg as (
  select
    user_id, currency, as_of_date,
    sum(value) filter (where value is not null) as known_asset_value,
    count(*)::integer as asset_count,
    count(value)::integer as valued_asset_count
  from asset_state
  group by user_id, currency, as_of_date
), liability_agg as (
  select
    user_id, currency, as_of_date,
    sum(amount) filter (where amount is not null) as known_liability_value,
    count(*)::integer as liability_count,
    count(amount)::integer as valued_liability_count
  from liability_state
  group by user_id, currency, as_of_date
)
select
  d.user_id,
  d.currency,
  d.as_of_date,
  coalesce(a.known_asset_value, 0) as known_asset_value,
  coalesce(l.known_liability_value, 0) as known_liability_value,
  coalesce(a.known_asset_value, 0) - coalesce(l.known_liability_value, 0) as known_net_worth,
  coalesce(a.asset_count, 0) as asset_count,
  coalesce(a.valued_asset_count, 0) as valued_asset_count,
  coalesce(l.liability_count, 0) as liability_count,
  coalesce(l.valued_liability_count, 0) as valued_liability_count,
  (
    coalesce(a.asset_count, 0) = coalesce(a.valued_asset_count, 0)
    and coalesce(l.liability_count, 0) = coalesce(l.valued_liability_count, 0)
  ) as observation_complete
from event_dates d
left join asset_agg a
  on a.user_id = d.user_id and a.currency = d.currency and a.as_of_date = d.as_of_date
left join liability_agg l
  on l.user_id = d.user_id and l.currency = d.currency and l.as_of_date = d.as_of_date;

comment on view public.financial_current_assets is
  'Current active asset identities with their latest recorded valuation and ownership-adjusted value.';
comment on view public.financial_current_liabilities is
  'Current active liability identities with their latest recorded outstanding balance.';
comment on view public.financial_liability_status is
  'Compact liability evidence distinguishing no recorded liabilities from an affirmative dated no-known-liabilities attestation.';
comment on view public.financial_balance_sheet_current is
  'Currency-native current financial position. Synced bank cash and manually valued assets are combined without cross-currency conversion. Liquid net worth conservatively subtracts all recorded liabilities.';
comment on view public.financial_asset_allocation_current is
  'Current currency-native asset allocation with manual assets and bank-synced cash separated by provenance.';
comment on view public.financial_net_worth_history is
  'Manual valuation/balance history with explicit coverage. known_net_worth is only a complete historical position when observation_complete is true; bank balances are intentionally excluded from this historical view.';

grant select on table public.financial_current_assets to authenticated;
grant select on table public.financial_current_liabilities to authenticated;
grant select on table public.financial_liability_status to authenticated;
grant select on table public.financial_balance_sheet_current to authenticated;
grant select on table public.financial_asset_allocation_current to authenticated;
grant select on table public.financial_net_worth_history to authenticated;

-- Register only compact, low-volume derived relations for Kleos Bot evidence.
insert into public.kleos_evidence_sources (group_key, relation_name, enabled)
values
  ('financial_balance_sheet_current', 'public.financial_balance_sheet_current'::regclass, true),
  ('financial_asset_allocation_current', 'public.financial_asset_allocation_current'::regclass, true),
  ('financial_liability_status', 'public.financial_liability_status'::regclass, true)
on conflict (group_key) do update
set relation_name = excluded.relation_name,
    enabled = excluded.enabled,
    updated_at = now();

commit;

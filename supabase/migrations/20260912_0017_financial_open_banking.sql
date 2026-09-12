begin;

create table if not exists public.financial_bank_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'gocardless',
  institution_id text not null,
  institution_name text not null,
  institution_country text not null,
  requisition_id text not null unique,
  provider_reference text not null unique,
  requisition_status text,
  connected_at timestamptz,
  last_synced_at timestamptz,
  last_error_code text,
  last_error_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_bank_connections_provider_check
    check (provider = 'gocardless'),
  constraint financial_bank_connections_country_check
    check (institution_country ~ '^[A-Z]{2}$'),
  constraint financial_bank_connections_institution_not_blank
    check (length(btrim(institution_id)) > 0 and length(btrim(institution_name)) > 0)
);

create index if not exists financial_bank_connections_user_created_idx
on public.financial_bank_connections (user_id, created_at desc);

create table if not exists public.financial_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null references public.financial_bank_connections(id) on delete cascade,
  provider_account_id text not null,
  provider_status text,
  account_name text,
  owner_name text,
  currency text,
  cash_account_type text,
  masked_identifier text,
  is_current boolean not null default true,
  last_synced_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_accounts_provider_id_not_blank
    check (length(btrim(provider_account_id)) > 0),
  constraint financial_accounts_currency_check
    check (currency is null or currency ~ '^[A-Z]{3}$'),
  constraint financial_accounts_connection_provider_unique
    unique (connection_id, provider_account_id)
);

create index if not exists financial_accounts_user_current_idx
on public.financial_accounts (user_id, is_current desc, account_name);

create table if not exists public.financial_account_balances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.financial_accounts(id) on delete cascade,
  balance_type text not null,
  amount numeric(24,8) not null,
  currency text not null,
  reference_date date,
  provider_changed_at timestamptz,
  observed_at timestamptz not null default now(),
  constraint financial_account_balances_type_not_blank
    check (length(btrim(balance_type)) > 0),
  constraint financial_account_balances_currency_check
    check (currency ~ '^[A-Z]{3}$')
);

create index if not exists financial_account_balances_account_observed_idx
on public.financial_account_balances (account_id, observed_at desc);

create index if not exists financial_account_balances_user_observed_idx
on public.financial_account_balances (user_id, observed_at desc);

create table if not exists public.financial_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.financial_accounts(id) on delete cascade,
  provider_transaction_key text not null,
  provider_transaction_id text,
  status text not null,
  booking_date date,
  value_date date,
  amount numeric(24,8) not null,
  currency text not null,
  counterparty_name text,
  merchant_name text,
  description text,
  raw_data jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint financial_transactions_status_check
    check (status in ('booked', 'pending')),
  constraint financial_transactions_currency_check
    check (currency ~ '^[A-Z]{3}$'),
  constraint financial_transactions_key_not_blank
    check (length(btrim(provider_transaction_key)) > 0),
  constraint financial_transactions_raw_object
    check (jsonb_typeof(raw_data) = 'object'),
  constraint financial_transactions_account_key_unique
    unique (account_id, provider_transaction_key)
);

create index if not exists financial_transactions_user_date_idx
on public.financial_transactions (user_id, booking_date desc nulls last, last_seen_at desc);

create index if not exists financial_transactions_account_status_idx
on public.financial_transactions (account_id, status, last_seen_at desc);

comment on table public.financial_bank_connections is
  'Read-only PSD2/Open Banking connection metadata. Provider credentials and bank credentials are never stored here.';
comment on table public.financial_accounts is
  'Normalized bank accounts synchronized through the trusted financial Open Banking backend.';
comment on table public.financial_account_balances is
  'Append-only observed account balances. Currency is explicit; different currencies must not be silently summed.';
comment on table public.financial_transactions is
  'Normalized booked and pending Open Banking transactions. raw_data preserves provider evidence but is not exposed to Kleos Bot.';
comment on column public.financial_accounts.masked_identifier is
  'Masked account identifier containing at most the final four characters; full IBAN/BBAN is not persisted.';

alter table public.financial_bank_connections enable row level security;
alter table public.financial_accounts enable row level security;
alter table public.financial_account_balances enable row level security;
alter table public.financial_transactions enable row level security;

revoke all on table public.financial_bank_connections from public, anon, authenticated;
revoke all on table public.financial_accounts from public, anon, authenticated;
revoke all on table public.financial_account_balances from public, anon, authenticated;
revoke all on table public.financial_transactions from public, anon, authenticated;

grant select on table public.financial_bank_connections to authenticated;
grant select on table public.financial_accounts to authenticated;
grant select on table public.financial_account_balances to authenticated;
grant select on table public.financial_transactions to authenticated;

drop policy if exists "Authorized user can read financial bank connections"
on public.financial_bank_connections;
create policy "Authorized user can read financial bank connections"
on public.financial_bank_connections
for select to authenticated
using (
  auth.uid() = user_id
  and lower(coalesce(auth.jwt()->>'email', '')) = 'theneolorenzo@gmail.com'
);

drop policy if exists "Authorized user can read financial accounts"
on public.financial_accounts;
create policy "Authorized user can read financial accounts"
on public.financial_accounts
for select to authenticated
using (
  auth.uid() = user_id
  and lower(coalesce(auth.jwt()->>'email', '')) = 'theneolorenzo@gmail.com'
);

drop policy if exists "Authorized user can read financial account balances"
on public.financial_account_balances;
create policy "Authorized user can read financial account balances"
on public.financial_account_balances
for select to authenticated
using (
  auth.uid() = user_id
  and lower(coalesce(auth.jwt()->>'email', '')) = 'theneolorenzo@gmail.com'
);

drop policy if exists "Authorized user can read financial transactions"
on public.financial_transactions;
create policy "Authorized user can read financial transactions"
on public.financial_transactions
for select to authenticated
using (
  auth.uid() = user_id
  and lower(coalesce(auth.jwt()->>'email', '')) = 'theneolorenzo@gmail.com'
);

create or replace function public.persist_financial_bank_sync(
  p_user_id uuid,
  p_connection_id uuid,
  p_requisition_status text,
  p_accounts jsonb,
  p_synced_at timestamptz default now()
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_account jsonb;
  v_balance jsonb;
  v_transaction jsonb;
  v_account_id uuid;
  v_account_count integer := 0;
  v_balance_count integer := 0;
  v_transaction_count integer := 0;
begin
  if p_user_id is null or p_connection_id is null then
    raise exception using errcode = '22023', message = 'FINANCIAL_SYNC_OWNER_AND_CONNECTION_REQUIRED';
  end if;

  if p_accounts is null or jsonb_typeof(p_accounts) <> 'array' then
    raise exception using errcode = '22023', message = 'FINANCIAL_SYNC_ACCOUNTS_MUST_BE_ARRAY';
  end if;

  if p_synced_at is null then
    raise exception using errcode = '22023', message = 'FINANCIAL_SYNC_TIME_REQUIRED';
  end if;

  if not exists (
    select 1
    from public.financial_bank_connections
    where id = p_connection_id and user_id = p_user_id
  ) then
    raise exception using errcode = '22023', message = 'FINANCIAL_CONNECTION_NOT_FOUND';
  end if;

  update public.financial_accounts
  set is_current = false,
      updated_at = p_synced_at
  where user_id = p_user_id
    and connection_id = p_connection_id;

  for v_account in select value from jsonb_array_elements(p_accounts)
  loop
    if nullif(btrim(v_account->>'provider_account_id'), '') is null then
      raise exception using errcode = '22023', message = 'FINANCIAL_ACCOUNT_PROVIDER_ID_REQUIRED';
    end if;

    insert into public.financial_accounts (
      user_id,
      connection_id,
      provider_account_id,
      provider_status,
      account_name,
      owner_name,
      currency,
      cash_account_type,
      masked_identifier,
      is_current,
      last_synced_at,
      updated_at
    )
    values (
      p_user_id,
      p_connection_id,
      v_account->>'provider_account_id',
      nullif(v_account->>'provider_status', ''),
      nullif(v_account->>'account_name', ''),
      nullif(v_account->>'owner_name', ''),
      nullif(v_account->>'currency', ''),
      nullif(v_account->>'cash_account_type', ''),
      nullif(v_account->>'masked_identifier', ''),
      true,
      p_synced_at,
      p_synced_at
    )
    on conflict (connection_id, provider_account_id) do update
    set provider_status = excluded.provider_status,
        account_name = excluded.account_name,
        owner_name = excluded.owner_name,
        currency = excluded.currency,
        cash_account_type = excluded.cash_account_type,
        masked_identifier = excluded.masked_identifier,
        is_current = true,
        last_synced_at = excluded.last_synced_at,
        updated_at = excluded.updated_at
    returning id into v_account_id;

    v_account_count := v_account_count + 1;

    if coalesce(jsonb_typeof(v_account->'balances'), 'null') <> 'array' then
      raise exception using errcode = '22023', message = 'FINANCIAL_ACCOUNT_BALANCES_MUST_BE_ARRAY';
    end if;

    for v_balance in select value from jsonb_array_elements(v_account->'balances')
    loop
      insert into public.financial_account_balances (
        user_id,
        account_id,
        balance_type,
        amount,
        currency,
        reference_date,
        provider_changed_at,
        observed_at
      )
      values (
        p_user_id,
        v_account_id,
        v_balance->>'balance_type',
        (v_balance->>'amount')::numeric,
        v_balance->>'currency',
        nullif(v_balance->>'reference_date', '')::date,
        nullif(v_balance->>'provider_changed_at', '')::timestamptz,
        p_synced_at
      );
      v_balance_count := v_balance_count + 1;
    end loop;

    delete from public.financial_transactions
    where user_id = p_user_id
      and account_id = v_account_id
      and status = 'pending';

    if coalesce(jsonb_typeof(v_account->'transactions'), 'null') <> 'array' then
      raise exception using errcode = '22023', message = 'FINANCIAL_ACCOUNT_TRANSACTIONS_MUST_BE_ARRAY';
    end if;

    for v_transaction in select value from jsonb_array_elements(v_account->'transactions')
    loop
      insert into public.financial_transactions (
        user_id,
        account_id,
        provider_transaction_key,
        provider_transaction_id,
        status,
        booking_date,
        value_date,
        amount,
        currency,
        counterparty_name,
        merchant_name,
        description,
        raw_data,
        first_seen_at,
        last_seen_at
      )
      values (
        p_user_id,
        v_account_id,
        v_transaction->>'provider_transaction_key',
        nullif(v_transaction->>'provider_transaction_id', ''),
        v_transaction->>'status',
        nullif(v_transaction->>'booking_date', '')::date,
        nullif(v_transaction->>'value_date', '')::date,
        (v_transaction->>'amount')::numeric,
        v_transaction->>'currency',
        nullif(v_transaction->>'counterparty_name', ''),
        nullif(v_transaction->>'merchant_name', ''),
        nullif(v_transaction->>'description', ''),
        coalesce(v_transaction->'raw_data', '{}'::jsonb),
        p_synced_at,
        p_synced_at
      )
      on conflict (account_id, provider_transaction_key) do update
      set provider_transaction_id = excluded.provider_transaction_id,
          status = excluded.status,
          booking_date = excluded.booking_date,
          value_date = excluded.value_date,
          amount = excluded.amount,
          currency = excluded.currency,
          counterparty_name = excluded.counterparty_name,
          merchant_name = excluded.merchant_name,
          description = excluded.description,
          raw_data = excluded.raw_data,
          last_seen_at = excluded.last_seen_at;
      v_transaction_count := v_transaction_count + 1;
    end loop;
  end loop;

  update public.financial_bank_connections
  set requisition_status = nullif(p_requisition_status, ''),
      connected_at = coalesce(connected_at, p_synced_at),
      last_synced_at = p_synced_at,
      last_error_code = null,
      last_error_at = null,
      updated_at = p_synced_at
  where id = p_connection_id
    and user_id = p_user_id;

  return jsonb_build_object(
    'account_count', v_account_count,
    'balance_count', v_balance_count,
    'transaction_count', v_transaction_count,
    'synced_at', p_synced_at
  );
end;
$$;

revoke all on function public.persist_financial_bank_sync(uuid, uuid, text, jsonb, timestamptz) from public;
revoke all on function public.persist_financial_bank_sync(uuid, uuid, text, jsonb, timestamptz) from anon;
revoke all on function public.persist_financial_bank_sync(uuid, uuid, text, jsonb, timestamptz) from authenticated;
grant execute on function public.persist_financial_bank_sync(uuid, uuid, text, jsonb, timestamptz) to service_role;

create or replace view public.financial_current_balances as
select
  ranked.user_id,
  ranked.account_id,
  ranked.balance_type,
  ranked.amount,
  ranked.currency,
  ranked.reference_date,
  ranked.observed_at
from (
  select
    b.*,
    row_number() over (
      partition by b.account_id, b.balance_type, b.currency
      order by b.observed_at desc, b.id desc
    ) as rn
  from public.financial_account_balances b
) ranked
where ranked.rn = 1;

create or replace view public.financial_recent_transactions as
select
  t.user_id,
  t.account_id,
  t.status,
  t.booking_date,
  t.value_date,
  t.amount,
  t.currency,
  t.counterparty_name,
  t.merchant_name,
  t.description,
  t.first_seen_at,
  t.last_seen_at
from public.financial_transactions t
where coalesce(t.booking_date, t.value_date, t.first_seen_at::date) >= current_date - 90;

revoke all on table public.financial_current_balances from public, anon, authenticated, service_role;
revoke all on table public.financial_recent_transactions from public, anon, authenticated, service_role;

insert into public.kleos_evidence_sources (group_key, relation_name, enabled)
values
  ('financial_accounts', 'public.financial_accounts'::regclass, true),
  ('financial_current_balances', 'public.financial_current_balances'::regclass, true),
  ('financial_recent_transactions', 'public.financial_recent_transactions'::regclass, true)
on conflict (group_key) do update
set relation_name = excluded.relation_name,
    enabled = excluded.enabled,
    updated_at = now();

commit;

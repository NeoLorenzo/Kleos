begin;

alter table public.financial_transactions
  add column if not exists remittance_information text[] not null default '{}'::text[],
  add column if not exists transaction_note text,
  add column if not exists bank_transaction_code text,
  add column if not exists bank_transaction_subcode text,
  add column if not exists bank_transaction_description text,
  add column if not exists provider_reference_number text;

comment on column public.financial_transactions.remittance_information is
  'Ordered provider remittance/payment-purpose strings promoted from raw Open Banking evidence.';
comment on column public.financial_transactions.transaction_note is
  'Provider-supplied free-form transaction note when available.';
comment on column public.financial_transactions.bank_transaction_code is
  'Provider-normalized transaction code such as CARD_PAYMENT, TRANSFER, EXCHANGE, TOPUP, CHARGE, or CARD_REFUND.';
comment on column public.financial_transactions.provider_reference_number is
  'Provider reference number when supplied; not the Kleos transaction identity.';

create or replace function public.financial_jsonb_text_array(p_value jsonb)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    array(
      select left(btrim(item), 1000)
      from jsonb_array_elements_text(
        case
          when jsonb_typeof(p_value) = 'array' then p_value
          when jsonb_typeof(p_value) = 'string' then jsonb_build_array(p_value #>> '{}')
          else '[]'::jsonb
        end
      ) as x(item)
      where btrim(item) <> ''
      limit 20
    ),
    array[]::text[]
  );
$$;

revoke all on function public.financial_jsonb_text_array(jsonb) from public, anon, authenticated;
grant execute on function public.financial_jsonb_text_array(jsonb) to service_role;

update public.financial_transactions
set remittance_information = public.financial_jsonb_text_array(raw_data->'remittance_information'),
    transaction_note = nullif(btrim(raw_data->>'note'), ''),
    bank_transaction_code = nullif(btrim(raw_data->'bank_transaction_code'->>'code'), ''),
    bank_transaction_subcode = nullif(btrim(coalesce(
      raw_data->'bank_transaction_code'->>'sub_code',
      raw_data->'bank_transaction_code'->>'subcode'
    )), ''),
    bank_transaction_description = nullif(btrim(raw_data->'bank_transaction_code'->>'description'), ''),
    provider_reference_number = nullif(btrim(raw_data->>'reference_number'), '')
where raw_data is not null;

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
        remittance_information,
        transaction_note,
        bank_transaction_code,
        bank_transaction_subcode,
        bank_transaction_description,
        provider_reference_number,
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
        public.financial_jsonb_text_array(coalesce(
          v_transaction->'remittance_information',
          v_transaction->'raw_data'->'remittance_information'
        )),
        nullif(btrim(coalesce(v_transaction->>'transaction_note', v_transaction->'raw_data'->>'note')), ''),
        nullif(btrim(coalesce(v_transaction->>'bank_transaction_code', v_transaction->'raw_data'->'bank_transaction_code'->>'code')), ''),
        nullif(btrim(coalesce(
          v_transaction->>'bank_transaction_subcode',
          v_transaction->'raw_data'->'bank_transaction_code'->>'sub_code',
          v_transaction->'raw_data'->'bank_transaction_code'->>'subcode'
        )), ''),
        nullif(btrim(coalesce(v_transaction->>'bank_transaction_description', v_transaction->'raw_data'->'bank_transaction_code'->>'description')), ''),
        nullif(btrim(coalesce(v_transaction->>'provider_reference_number', v_transaction->'raw_data'->>'reference_number')), ''),
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
          remittance_information = excluded.remittance_information,
          transaction_note = excluded.transaction_note,
          bank_transaction_code = excluded.bank_transaction_code,
          bank_transaction_subcode = excluded.bank_transaction_subcode,
          bank_transaction_description = excluded.bank_transaction_description,
          provider_reference_number = excluded.provider_reference_number,
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

create or replace function public.financial_category_for_label(p_label text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_label ~ '(rent|rental|landlord|letting|housing)' then 'housing'
    when p_label ~ '(uber eats|deliveroo|just eat|doordash|restaurant|restaurante|pizz|pizza|cafe|coffee|starbucks|mcdonald|burger|kfc|chick fil a|sushi|nando|five guys|domino|glovo|bolt food|terry|hopdoddy|yazawa|krispy|pastelaria|ramen|isteaks|falmer bar|hamb bairro)' then 'food_dining'
    when p_label ~ '(sainsbur|waitrose|tesco|aldi|lidl|mercadona|pingo doce|continente|supercor|cold storage|whole foods|wholefds|trader joe|heb store|co op retail|coop retail|grocery|supermarket|food mart|m&s simply food|apolonia|meidi ya|quad food store|wm supercenter)' then 'groceries'
    when p_label ~ '(uber trip|trainline|southern|transport for london|tfl travel|carris|metro|rail|taxi|parking|parq|bp restelo|shell|galp|repsol|fuel|gas station|chevron|brighton and hove bus|lim ride|lime ride)' then 'transport'
    when p_label ~ '(easyjet|ryanair|tap air|airbnb|booking com|hotel|hostel|headout|flight|airline|airport)' then 'travel'
    when p_label ~ '(epidemic sound|lucidchart|wemod|discord|youtube premium|google youtube|microsoft|nounproject|autocut|openai|chatgpt|adobe|notion|dropbox|google one|icloud|spotify|netflix|amazon prime|midjourney|github|canva|apple com|remini|vidiq|obsidian|soundraw|blackmagic cloud|godaddy|looka|restream|fantasypros|copyleaks|uber one|uber pass)' then 'subscriptions_software'
    when p_label ~ '(cinema|movie|steam|playstation|xbox|ticketmaster|eventbrite|night safari|uci el corte ingles|paypal ea|cdkeys|xsolla|twitch)' then 'entertainment'
    when p_label ~ '(gym|fitness|pharmacy|farmacia|dentist|dental|clinic|clinica|health|sports complex|academia life club|cuf)' then 'fitness_health'
    when p_label ~ '(university|college|udemy|coursera|edx|school|tuition|bookshop|baccalaureate|bertrand)' then 'education'
    when p_label ~ '(vodafone|(^| )meo( |$)|(^| )nos( |$)|att bill|at&t|octopus energy|electric|water|internet|broadband|utility)' then 'telecom_utilities'
    when p_label ~ '(laundry|lovespace|cleaning|storage|moving|smartify|shutter)' then 'household'
    when p_label ~ '(amazon|amzn|zara|h&m|nike|adidas|uniqlo|asos|ikea|temu|shein|ebay|etsy|el corte ingles|target|walmart|wal mart|mpb com|youngla|cosmetics|wh smith|smoke shop|back market|apple watch)' then 'shopping'
    else 'other'
  end;
$$;

revoke all on function public.financial_category_for_label(text) from public, anon, authenticated;
grant execute on function public.financial_category_for_label(text) to service_role;

create or replace function public.enhance_financial_transaction_classifications(
  p_user_id uuid,
  p_connection_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer := 0;
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'FINANCIAL_CLASSIFICATION_USER_REQUIRED';
  end if;

  if p_connection_id is not null and not exists (
    select 1 from public.financial_bank_connections c
    where c.id = p_connection_id and c.user_id = p_user_id
  ) then
    raise exception using errcode = '22023', message = 'FINANCIAL_CLASSIFICATION_CONNECTION_NOT_FOUND';
  end if;

  with context as (
    select
      c.transaction_id,
      c.flow_type,
      c.category,
      c.subcategory,
      public.financial_normalize_label(
        concat_ws(
          ' ',
          c.display_label,
          array_to_string(t.remittance_information, ' '),
          t.transaction_note,
          t.bank_transaction_description
        )
      ) as context_label,
      a.connection_id
    from public.financial_transaction_classifications c
    join public.financial_transactions t on t.id = c.transaction_id
    join public.financial_accounts a on a.id = t.account_id
    where c.user_id = p_user_id
      and (p_connection_id is null or a.connection_id = p_connection_id)
  ), interpreted as (
    select
      x.*,
      public.financial_category_for_label(x.context_label) as context_category,
      case
        when x.context_label ~ '(^| )rent( |$)|rental|landlord' then 'rent'
        when x.context_label ~ 'tuition|university|college' then 'education'
        when x.context_label ~ 'grocer|supercor|supermarket' then 'groceries'
        else null
      end as context_subcategory
    from context x
  )
  update public.financial_transaction_classifications c
  set category = case
        when c.flow_type in ('expense','refund')
             and c.category = 'other'
             and i.context_category <> 'other'
          then i.context_category
        else c.category
      end,
      subcategory = case
        when c.flow_type = 'transfer' and i.context_subcategory is not null
          then i.context_subcategory
        else c.subcategory
      end,
      classifier_version = '1.1.0',
      confidence = case
        when c.flow_type in ('expense','refund') and c.category = 'other' and i.context_category <> 'other'
          then greatest(c.confidence, 0.850)
        when c.flow_type = 'transfer' and i.context_subcategory is not null
          then greatest(c.confidence, 0.850)
        else c.confidence
      end,
      classification_reason = case
        when c.flow_type in ('expense','refund') and c.category = 'other' and i.context_category <> 'other'
          then c.classification_reason || '+remittance_category_context'
        when c.flow_type = 'transfer' and i.context_subcategory = 'rent'
          then c.classification_reason || '+remittance_rent_context'
        when c.flow_type = 'transfer' and i.context_subcategory is not null
          then c.classification_reason || '+remittance_purpose_context'
        else c.classification_reason
      end,
      updated_at = now()
  from interpreted i
  where c.transaction_id = i.transaction_id;

  get diagnostics v_updated = row_count;
  return jsonb_build_object('enhanced_count', v_updated, 'classifier_version', '1.1.0');
end;
$$;

revoke all on function public.enhance_financial_transaction_classifications(uuid, uuid) from public, anon, authenticated;
grant execute on function public.enhance_financial_transaction_classifications(uuid, uuid) to service_role;

create or replace function public.refresh_financial_classifications_after_bank_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.last_synced_at is not null
     and new.last_synced_at is distinct from old.last_synced_at then
    begin
      perform public.refresh_financial_transaction_classifications(new.user_id, new.id);
      perform public.enhance_financial_transaction_classifications(new.user_id, new.id);
    exception when others then
      -- Derived transaction intelligence must never roll back canonical bank evidence.
      null;
    end;
  end if;
  return new;
end;
$$;

revoke all on function public.refresh_financial_classifications_after_bank_sync() from public, anon, authenticated;
grant execute on function public.refresh_financial_classifications_after_bank_sync() to service_role;

do $$
declare
  v_user_id uuid;
begin
  for v_user_id in
    select distinct user_id from public.financial_transactions
  loop
    perform public.enhance_financial_transaction_classifications(v_user_id, null);
  end loop;
end;
$$;

commit;

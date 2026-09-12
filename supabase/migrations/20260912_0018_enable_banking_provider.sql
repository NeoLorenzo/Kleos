begin;

alter table public.financial_bank_connections
  drop constraint if exists financial_bank_connections_provider_check;

alter table public.financial_bank_connections
  alter column provider set default 'enable_banking',
  add column if not exists provider_session_id text,
  add column if not exists consent_valid_until timestamptz;

alter table public.financial_bank_connections
  add constraint financial_bank_connections_provider_check
    check (provider in ('gocardless', 'enable_banking'));

create unique index if not exists financial_bank_connections_provider_session_unique
on public.financial_bank_connections (provider, provider_session_id)
where provider_session_id is not null;

comment on column public.financial_bank_connections.requisition_id is
  'Provider authorization identifier. For Enable Banking this stores authorization_id returned by POST /auth; historical GoCardless rows may contain a requisition ID.';
comment on column public.financial_bank_connections.provider_reference is
  'Opaque client-generated authorization state/reference used to bind the provider callback to the owned connection.';
comment on column public.financial_bank_connections.requisition_status is
  'Latest provider authorization/session state retained for compatibility with the original schema.';
comment on column public.financial_bank_connections.provider_session_id is
  'Provider user-session identifier created after successful authorization. For Enable Banking this is session_id returned by POST /sessions.';
comment on column public.financial_bank_connections.consent_valid_until is
  'Provider-reported expiry of the authorized account-information session when available.';

commit;

do $$
declare
  constraint_name text;
begin
  select c.conname
    into constraint_name
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = 'marketplace_integrations'
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) ilike '%platform%'
  limit 1;

  if constraint_name is not null then
    execute format('alter table public.marketplace_integrations drop constraint %I', constraint_name);
  end if;
end $$;

alter table public.marketplace_integrations
  add constraint marketplace_integrations_platform_check
  check (platform in ('zomato', 'swiggy', 'petpooja'));

alter table public.marketplace_integrations
  add column if not exists connection_method text not null default 'report_upload',
  add column if not exists webhook_url text,
  add column if not exists api_base_url text,
  add column if not exists credential_status text not null default 'not_provided',
  add column if not exists last_tested_at timestamptz,
  add column if not exists last_success_at timestamptz;

alter table public.marketplace_integrations
  drop constraint if exists marketplace_integrations_connection_method_check;

alter table public.marketplace_integrations
  add constraint marketplace_integrations_connection_method_check
  check (connection_method in ('report_upload', 'official_api', 'webhook', 'partner_connector'));

alter table public.marketplace_integrations
  drop constraint if exists marketplace_integrations_credential_status_check;

alter table public.marketplace_integrations
  add constraint marketplace_integrations_credential_status_check
  check (credential_status in ('not_provided', 'pending', 'verified', 'invalid'));

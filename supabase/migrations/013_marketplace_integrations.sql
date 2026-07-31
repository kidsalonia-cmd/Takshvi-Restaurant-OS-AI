create table if not exists marketplace_integrations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  location_id uuid references locations(id) on delete cascade,
  brand_id uuid references brands(id) on delete cascade,
  platform text not null check (platform in ('zomato','swiggy')),
  merchant_id text,
  outlet_id text,
  external_store_name text,
  integration_mode text not null default 'partner_api' check (integration_mode in ('partner_api','aggregator','webhook','manual')),
  status text not null default 'not_connected' check (status in ('not_connected','pending','connected','error','paused')),
  auto_accept_orders boolean not null default false,
  auto_print_kot boolean not null default false,
  sync_menu boolean not null default false,
  sync_inventory boolean not null default false,
  sync_payouts boolean not null default false,
  webhook_secret text,
  last_order_sync_at timestamptz,
  last_menu_sync_at timestamptz,
  last_payout_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(platform, location_id, brand_id)
);

create index if not exists marketplace_integrations_company_idx on marketplace_integrations(company_id);
create index if not exists marketplace_integrations_platform_status_idx on marketplace_integrations(platform, status);

comment on table marketplace_integrations is 'Connection and sync settings for Zomato and Swiggy outlets.';

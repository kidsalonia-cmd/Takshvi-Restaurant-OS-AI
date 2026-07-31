create extension if not exists pgcrypto;

create table if not exists brands (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  location_id uuid not null references locations(id) on delete cascade,
  name text not null,
  code text not null,
  description text,
  logo_url text,
  primary_color text default '#10b981',
  zomato_restaurant_id text,
  swiggy_restaurant_id text,
  fssai_number text,
  is_active boolean not null default true,
  shares_location_inventory boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(location_id, code)
);

create index if not exists brands_company_id_idx on brands(company_id);
create index if not exists brands_location_id_idx on brands(location_id);

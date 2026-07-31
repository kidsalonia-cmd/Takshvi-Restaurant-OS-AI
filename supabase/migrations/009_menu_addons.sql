create extension if not exists pgcrypto;

create table if not exists addon_groups (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  location_id uuid not null references locations(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  name text not null,
  code text not null,
  min_select integer not null default 0,
  max_select integer not null default 1,
  is_required boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(brand_id, code)
);

create table if not exists addon_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  location_id uuid not null references locations(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  addon_group_id uuid not null references addon_groups(id) on delete cascade,
  name text not null,
  sku text not null,
  price numeric(12,2) not null default 0,
  tax_rate numeric(5,2) not null default 5,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(brand_id, sku)
);

create table if not exists menu_item_addon_groups (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null references menu_items(id) on delete cascade,
  addon_group_id uuid not null references addon_groups(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(menu_item_id, addon_group_id)
);

create index if not exists addon_groups_location_id_idx on addon_groups(location_id);
create index if not exists addon_groups_brand_id_idx on addon_groups(brand_id);
create index if not exists addon_items_group_id_idx on addon_items(addon_group_id);
create index if not exists addon_items_brand_id_idx on addon_items(brand_id);
create index if not exists menu_item_addon_groups_menu_item_idx on menu_item_addon_groups(menu_item_id);

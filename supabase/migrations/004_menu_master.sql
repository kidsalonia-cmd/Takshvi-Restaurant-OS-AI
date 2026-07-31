create extension if not exists pgcrypto;

create table if not exists menu_categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(brand_id, name)
);

create table if not exists menu_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  location_id uuid not null references locations(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  category_id uuid references menu_categories(id) on delete set null,
  name text not null,
  sku text not null,
  description text,
  item_type text not null default 'veg' check (item_type in ('veg','non_veg','egg')),
  base_price numeric(12,2) not null default 0,
  packaging_charge numeric(12,2) not null default 0,
  tax_rate numeric(5,2) not null default 5,
  image_url text,
  is_active boolean not null default true,
  available_on_pos boolean not null default true,
  available_on_zomato boolean not null default true,
  available_on_swiggy boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(brand_id, sku)
);

create index if not exists menu_categories_brand_id_idx on menu_categories(brand_id);
create index if not exists menu_items_brand_id_idx on menu_items(brand_id);
create index if not exists menu_items_location_id_idx on menu_items(location_id);
create index if not exists menu_items_category_id_idx on menu_items(category_id);

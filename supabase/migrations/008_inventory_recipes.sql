create extension if not exists pgcrypto;

create table if not exists inventory_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  location_id uuid not null references locations(id) on delete cascade,
  name text not null,
  sku text,
  unit text not null default 'g',
  current_stock numeric(14,3) not null default 0,
  reorder_level numeric(14,3) not null default 0,
  average_cost numeric(12,4) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(location_id, name),
  constraint inventory_items_unit_check check (unit in ('g','kg','ml','l','piece','pack','slice','portion'))
);

create table if not exists recipes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  location_id uuid not null references locations(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  menu_item_id uuid not null references menu_items(id) on delete cascade,
  yield_quantity numeric(10,3) not null default 1,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(location_id, menu_item_id)
);

create table if not exists recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references recipes(id) on delete cascade,
  inventory_item_id uuid not null references inventory_items(id) on delete restrict,
  quantity numeric(14,3) not null,
  wastage_percent numeric(6,2) not null default 0,
  created_at timestamptz not null default now(),
  unique(recipe_id, inventory_item_id)
);

create table if not exists inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  location_id uuid not null references locations(id) on delete cascade,
  inventory_item_id uuid not null references inventory_items(id) on delete restrict,
  order_id uuid references orders(id) on delete set null,
  transaction_type text not null,
  quantity numeric(14,3) not null,
  unit_cost numeric(12,4),
  reference text,
  notes text,
  created_at timestamptz not null default now(),
  constraint inventory_transactions_type_check check (transaction_type in ('opening','purchase','sale_consumption','adjustment_in','adjustment_out','wastage','transfer_in','transfer_out','return'))
);

create index if not exists inventory_items_location_id_idx on inventory_items(location_id);
create index if not exists recipes_menu_item_id_idx on recipes(menu_item_id);
create index if not exists recipe_ingredients_recipe_id_idx on recipe_ingredients(recipe_id);
create index if not exists inventory_transactions_location_id_idx on inventory_transactions(location_id);
create index if not exists inventory_transactions_item_id_idx on inventory_transactions(inventory_item_id);

create extension if not exists pgcrypto;

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  location_id uuid not null references locations(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete restrict,
  order_number text not null,
  platform_order_id text,
  source text not null default 'pos',
  status text not null default 'new',
  customer_name text,
  customer_phone text,
  subtotal numeric(12,2) not null default 0,
  packaging_amount numeric(12,2) not null default 0,
  discount_amount numeric(12,2) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  delivery_charge numeric(12,2) not null default 0,
  grand_total numeric(12,2) not null default 0,
  payment_status text not null default 'pending',
  payment_method text,
  notes text,
  accepted_at timestamptz,
  ready_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(location_id, order_number),
  constraint orders_source_check check (source in ('zomato','swiggy','pos','website','phone','walk_in','takeaway')),
  constraint orders_status_check check (status in ('new','accepted','preparing','ready','completed','cancelled')),
  constraint orders_payment_status_check check (payment_status in ('pending','paid','refunded','partially_refunded'))
);

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  menu_item_id uuid references menu_items(id) on delete set null,
  item_name text not null,
  sku text,
  quantity numeric(10,3) not null default 1,
  unit_price numeric(12,2) not null default 0,
  packaging_amount numeric(12,2) not null default 0,
  discount_amount numeric(12,2) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  line_total numeric(12,2) not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists orders_company_id_idx on orders(company_id);
create index if not exists orders_location_id_idx on orders(location_id);
create index if not exists orders_brand_id_idx on orders(brand_id);
create index if not exists orders_status_idx on orders(status);
create index if not exists orders_source_idx on orders(source);
create index if not exists orders_created_at_idx on orders(created_at desc);
create index if not exists order_items_order_id_idx on order_items(order_id);

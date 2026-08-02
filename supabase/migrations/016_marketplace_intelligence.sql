create extension if not exists pgcrypto;

create table if not exists marketplace_reports (
  id uuid primary key default gen_random_uuid(),
  marketplace text not null check (marketplace in ('zomato','swiggy','petpooja','unknown')),
  report_type text not null,
  restaurant_name text,
  location_id uuid references locations(id) on delete set null,
  brand_id uuid references brands(id) on delete set null,
  period_start date,
  period_end date,
  original_file_name text not null,
  file_size_bytes bigint not null default 0,
  file_hash text,
  processing_status text not null default 'processed' check (processing_status in ('uploaded','processing','processed','failed','review_required')),
  detected_columns jsonb not null default '[]'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists marketplace_reports_file_hash_uidx
on marketplace_reports(file_hash)
where file_hash is not null;

create index if not exists marketplace_reports_period_idx
on marketplace_reports(marketplace, period_start desc, period_end desc);

create table if not exists marketplace_order_facts (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references marketplace_reports(id) on delete cascade,
  marketplace text not null,
  external_order_id text,
  invoice_number text,
  order_date timestamptz,
  restaurant_name text,
  brand_name text,
  order_source text,
  order_status text,
  gross_sales numeric(14,2) not null default 0,
  discount_amount numeric(14,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  packaging_amount numeric(14,2) not null default 0,
  commission_amount numeric(14,2) not null default 0,
  other_deductions numeric(14,2) not null default 0,
  net_order_value numeric(14,2) not null default 0,
  payout_amount numeric(14,2) not null default 0,
  raw_row jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists marketplace_order_facts_report_idx on marketplace_order_facts(report_id);
create index if not exists marketplace_order_facts_date_idx on marketplace_order_facts(order_date desc);
create index if not exists marketplace_order_facts_marketplace_idx on marketplace_order_facts(marketplace, order_date desc);

create table if not exists marketplace_item_facts (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references marketplace_reports(id) on delete cascade,
  marketplace text not null,
  external_order_id text,
  invoice_number text,
  order_date timestamptz,
  restaurant_name text,
  brand_name text,
  category_name text,
  item_name text not null,
  quantity numeric(14,3) not null default 0,
  gross_sales numeric(14,2) not null default 0,
  discount_amount numeric(14,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  final_total numeric(14,2) not null default 0,
  raw_row jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists marketplace_item_facts_report_idx on marketplace_item_facts(report_id);
create index if not exists marketplace_item_facts_item_idx on marketplace_item_facts(marketplace, item_name);

alter table marketplace_reports enable row level security;
alter table marketplace_order_facts enable row level security;
alter table marketplace_item_facts enable row level security;

create policy if not exists marketplace_reports_read on marketplace_reports for select using (true);
create policy if not exists marketplace_reports_insert on marketplace_reports for insert with check (true);
create policy if not exists marketplace_reports_update on marketplace_reports for update using (true) with check (true);

create policy if not exists marketplace_order_facts_read on marketplace_order_facts for select using (true);
create policy if not exists marketplace_order_facts_insert on marketplace_order_facts for insert with check (true);

create policy if not exists marketplace_item_facts_read on marketplace_item_facts for select using (true);
create policy if not exists marketplace_item_facts_insert on marketplace_item_facts for insert with check (true);

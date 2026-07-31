create extension if not exists pgcrypto;

create type public.app_role as enum (
  'super_admin',
  'company_admin',
  'location_manager',
  'cashier',
  'kitchen',
  'inventory_manager',
  'finance_manager',
  'marketing_manager',
  'viewer'
);

create type public.record_status as enum ('active', 'inactive', 'setup_pending', 'suspended');

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  gstin text,
  pan text,
  email text,
  phone text,
  website text,
  currency_code text not null default 'INR',
  timezone text not null default 'Asia/Kolkata',
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  code text not null,
  address_line_1 text,
  address_line_2 text,
  city text,
  state text,
  postal_code text,
  country_code text not null default 'IN',
  phone text,
  email text,
  gstin text,
  timezone text not null default 'Asia/Kolkata',
  is_central_warehouse boolean not null default false,
  status public.record_status not null default 'setup_pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, code)
);

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  code text not null,
  description text,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, code)
);

create table public.location_brands (
  location_id uuid not null references public.locations(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (location_id, brand_id)
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  full_name text not null,
  phone text,
  role public.app_role not null default 'viewer',
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_locations (
  user_id uuid not null references public.profiles(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, location_id)
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  company_id uuid references public.companies(id) on delete set null,
  location_id uuid references public.locations(id) on delete set null,
  actor_user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  before_data jsonb,
  after_data jsonb,
  ip_address inet,
  created_at timestamptz not null default now()
);

create index locations_company_id_idx on public.locations(company_id);
create index brands_company_id_idx on public.brands(company_id);
create index profiles_company_id_idx on public.profiles(company_id);
create index audit_logs_company_created_idx on public.audit_logs(company_id, created_at desc);

alter table public.companies enable row level security;
alter table public.locations enable row level security;
alter table public.brands enable row level security;
alter table public.location_brands enable row level security;
alter table public.profiles enable row level security;
alter table public.user_locations enable row level security;
alter table public.audit_logs enable row level security;

create or replace function public.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id from public.profiles where id = auth.uid()
$$;

create policy "users can view own profile"
on public.profiles for select
using (id = auth.uid());

create policy "company members can view company"
on public.companies for select
using (id = public.current_company_id());

create policy "company members can view locations"
on public.locations for select
using (company_id = public.current_company_id());

create policy "company members can view brands"
on public.brands for select
using (company_id = public.current_company_id());

create policy "company admins can manage locations"
on public.locations for all
using (
  company_id = public.current_company_id()
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('super_admin', 'company_admin')
  )
)
with check (company_id = public.current_company_id());

create policy "company admins can manage brands"
on public.brands for all
using (
  company_id = public.current_company_id()
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('super_admin', 'company_admin')
  )
)
with check (company_id = public.current_company_id());

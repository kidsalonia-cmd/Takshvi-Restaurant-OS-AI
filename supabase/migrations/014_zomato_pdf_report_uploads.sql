-- Zomato weekly PDF report upload support.

create table if not exists public.report_uploads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid null references public.companies(id) on delete set null,
  location_id uuid null references public.locations(id) on delete set null,
  brand_id uuid null references public.brands(id) on delete set null,
  platform text not null default 'zomato',
  report_type text not null default 'weekly_pdf',
  report_period_start date null,
  report_period_end date null,
  file_name text not null,
  storage_bucket text not null default 'zomato-weekly-reports',
  storage_path text not null,
  file_size_bytes bigint not null default 0,
  mime_type text not null default 'application/pdf',
  processing_status text not null default 'uploaded',
  processing_notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists report_uploads_platform_created_idx
  on public.report_uploads(platform, created_at desc);

create index if not exists report_uploads_location_brand_idx
  on public.report_uploads(location_id, brand_id, created_at desc);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'zomato-weekly-reports',
  'zomato-weekly-reports',
  false,
  20971520,
  array['application/pdf']
)
on conflict (id) do update
set file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

alter table public.report_uploads enable row level security;

-- Temporary authenticated/anon policies for the current internal dashboard build.
-- Replace with role-based policies when authentication and staff roles are enabled.
drop policy if exists "report uploads read" on public.report_uploads;
create policy "report uploads read"
on public.report_uploads for select
to anon, authenticated
using (true);

drop policy if exists "report uploads insert" on public.report_uploads;
create policy "report uploads insert"
on public.report_uploads for insert
to anon, authenticated
with check (true);

drop policy if exists "zomato reports upload" on storage.objects;
create policy "zomato reports upload"
on storage.objects for insert
to anon, authenticated
with check (bucket_id = 'zomato-weekly-reports');

drop policy if exists "zomato reports read" on storage.objects;
create policy "zomato reports read"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'zomato-weekly-reports');

comment on table public.report_uploads is
'Stores metadata for uploaded marketplace PDF reports awaiting automated extraction and analysis.';

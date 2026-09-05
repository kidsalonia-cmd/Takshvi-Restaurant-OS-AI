create table if not exists public.cafe_google_credentials (
  id text primary key default 'cafe-honeyman',
  refresh_token text,
  access_token text,
  access_token_expires_at timestamptz,
  account_id text,
  account_name text,
  location_id text,
  location_title text,
  updated_at timestamptz not null default now()
);

alter table public.cafe_google_credentials enable row level security;

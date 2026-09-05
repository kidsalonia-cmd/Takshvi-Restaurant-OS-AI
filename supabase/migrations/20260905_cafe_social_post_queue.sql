create table if not exists public.cafe_social_post_queue (
  id uuid primary key default gen_random_uuid(),
  business_slug text not null default 'cafe-honeyman',
  title text,
  focus text,
  google_caption text not null,
  instagram_caption text,
  image_url text,
  action_url text,
  action_type text default 'LEARN_MORE',
  publish_google boolean not null default true,
  publish_instagram boolean not null default false,
  scheduled_for timestamptz not null,
  status text not null default 'scheduled',
  google_post_id text,
  instagram_post_id text,
  last_error text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cafe_social_post_queue_due_idx
  on public.cafe_social_post_queue (status, scheduled_for);

create index if not exists cafe_social_post_queue_business_idx
  on public.cafe_social_post_queue (business_slug, created_at desc);

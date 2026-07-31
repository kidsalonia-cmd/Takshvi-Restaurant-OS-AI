-- Marketplace payout fields for daily online sales vs payout reporting.

alter table public.orders
  add column if not exists platform_gross_amount numeric(12,2),
  add column if not exists platform_commission_amount numeric(12,2) not null default 0,
  add column if not exists platform_other_deductions numeric(12,2) not null default 0,
  add column if not exists platform_payout_amount numeric(12,2),
  add column if not exists payout_status text not null default 'pending',
  add column if not exists payout_reference text,
  add column if not exists payout_date timestamptz;

alter table public.orders
  drop constraint if exists orders_payout_status_check;

alter table public.orders
  add constraint orders_payout_status_check
  check (payout_status in ('pending','processed','paid','failed','not_applicable'));

update public.orders
set platform_gross_amount = grand_total
where source in ('zomato','swiggy','ondc','website')
  and platform_gross_amount is null;

update public.orders
set platform_payout_amount = greatest(
  coalesce(platform_gross_amount, grand_total)
  - coalesce(platform_commission_amount, 0)
  - coalesce(platform_other_deductions, 0),
  0
)
where source in ('zomato','swiggy','ondc','website')
  and platform_payout_amount is null;

create index if not exists orders_payout_date_idx
  on public.orders(payout_date desc);

create index if not exists orders_payout_status_idx
  on public.orders(payout_status);

comment on column public.orders.platform_payout_amount is
'Net amount expected or received from the online ordering platform after commission and other deductions.';

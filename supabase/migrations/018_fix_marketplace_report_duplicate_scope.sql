-- Allow the same source file to be used for a different outlet, brand,
-- report type or reporting week, while still preventing a true duplicate
-- inside the same scope.

drop index if exists public.marketplace_reports_file_hash_uidx;

create unique index if not exists marketplace_reports_scoped_file_hash_uidx
on public.marketplace_reports (
  file_hash,
  location_id,
  brand_id,
  report_type,
  period_start,
  period_end
) nulls not distinct;

alter table if exists public.report_uploads
  add column if not exists restaurant_name text,
  add column if not exists report_notes text,
  add column if not exists analysis_requested_at timestamptz,
  add column if not exists analysis_completed_at timestamptz,
  add column if not exists extracted_summary jsonb,
  add column if not exists analysis_result jsonb,
  add column if not exists processing_error text;

create index if not exists report_uploads_processing_status_idx
  on public.report_uploads(processing_status);

create index if not exists report_uploads_period_idx
  on public.report_uploads(report_period_start, report_period_end);

-- Recent media every 30 minutes; refresh the entire available archive once daily.
alter table public.kw_instagram_sync add column last_full_at timestamptz;

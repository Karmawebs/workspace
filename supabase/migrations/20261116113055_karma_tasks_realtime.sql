-- Realtime still applies the existing SELECT RLS policies to subscribers.
do $$ begin
  if not exists (select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'kw_tasks') then
    alter publication supabase_realtime add table public.kw_tasks;
  end if;
end $$;

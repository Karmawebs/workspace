create or replace function kw_private.can_upload_care_project_file(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select auth.uid()) is not null
    and object_name ~ '^[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}/[^/]+$'
    and exists (
      select 1
      from public.kw_workspace_members m
      join public.kw_projects p
        on p.workspace_id = m.workspace_id
      where m.user_id = (select auth.uid())
        and m.workspace_id = split_part(object_name, '/', 1)::uuid
        and p.id = split_part(object_name, '/', 2)::uuid
        and p.workspace_id = m.workspace_id
        and p.app_key = 'care'
    );
$$;

revoke all on function kw_private.can_upload_care_project_file(text) from public, anon;
grant execute on function kw_private.can_upload_care_project_file(text) to authenticated;

drop policy if exists care_project_storage_insert on storage.objects;
create policy care_project_storage_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'care-project-files'
  and kw_private.can_upload_care_project_file(name)
);

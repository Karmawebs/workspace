drop policy if exists care_project_storage_insert on storage.objects;

create policy care_project_storage_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'care-project-files'
  and public.kw_is_workspace_member(((storage.foldername(name))[1])::uuid)
  and exists (
    select 1
    from public.kw_projects p
    where p.id = ((storage.foldername(name))[2])::uuid
      and p.workspace_id = ((storage.foldername(name))[1])::uuid
      and p.app_key = 'care'
  )
);

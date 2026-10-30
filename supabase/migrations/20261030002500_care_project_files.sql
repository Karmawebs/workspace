create table if not exists public.kw_project_files (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.kw_workspaces(id) on delete cascade,
  project_id uuid not null references public.kw_projects(id) on delete cascade,
  app_key text not null default 'care' check (app_key = 'care'),
  storage_path text not null unique,
  original_filename text not null check (length(original_filename) between 1 and 255),
  mime_type text not null,
  size bigint not null check (size > 0 and size <= 52428800),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists kw_project_files_project on public.kw_project_files(project_id, created_at desc);
create index if not exists kw_project_files_workspace on public.kw_project_files(workspace_id);

alter table public.kw_project_files enable row level security;
grant select, insert, delete on public.kw_project_files to authenticated;
revoke all on public.kw_project_files from anon;

create policy care_project_files_read on public.kw_project_files
for select to authenticated
using (
  public.kw_is_workspace_member(workspace_id)
  and exists (
    select 1 from public.kw_projects p
    where p.id = project_id and p.workspace_id = kw_project_files.workspace_id and p.app_key = 'care'
  )
);

create policy care_project_files_insert on public.kw_project_files
for insert to authenticated
with check (
  public.kw_is_workspace_member(workspace_id)
  and created_by = (select auth.uid())
  and exists (
    select 1 from public.kw_projects p
    where p.id = project_id and p.workspace_id = kw_project_files.workspace_id and p.app_key = 'care'
  )
);

create policy care_project_files_delete on public.kw_project_files
for delete to authenticated
using (
  public.kw_is_workspace_member(workspace_id)
  and exists (
    select 1 from public.kw_projects p
    where p.id = project_id and p.workspace_id = kw_project_files.workspace_id and p.app_key = 'care'
  )
);

insert into storage.buckets(id, name, public, file_size_limit)
values ('care-project-files', 'care-project-files', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = 52428800;

create policy care_project_storage_read on storage.objects
for select to authenticated
using (
  bucket_id = 'care-project-files'
  and exists (
    select 1 from public.kw_project_files f
    where f.storage_path = name and public.kw_is_workspace_member(f.workspace_id)
  )
);

create policy care_project_storage_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'care-project-files'
  and public.kw_is_workspace_member(((storage.foldername(name))[1])::uuid)
  and exists (
    select 1 from public.kw_projects p
    where p.id = ((storage.foldername(name))[2])::uuid
      and p.workspace_id = ((storage.foldername(name))[1])::uuid
      and p.app_key = 'care'
  )
);

create policy care_project_storage_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'care-project-files'
  and exists (
    select 1 from public.kw_project_files f
    where f.storage_path = name and public.kw_is_workspace_member(f.workspace_id)
  )
);

-- Social / Drive metadata foundation. NOT APPLIED until reviewed.
-- Tokens and OAuth secrets MUST NOT be stored in public schema.
create table if not exists public.kw_social_drive_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.kw_workspaces(id) on delete cascade,
  display_name text not null,
  google_account_email text,
  status text not null default 'disconnected' check (status in ('connected','disconnected','reauthorization_required')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id)
);
comment on table public.kw_social_drive_connections is 'Non-secret metadata only. OAuth tokens reside in server-only secure storage.';
create table if not exists public.kw_social_drive_folders (
  project_id uuid primary key references public.kw_projects(id) on delete cascade,
  workspace_id uuid not null references public.kw_workspaces(id) on delete cascade,
  connection_id uuid not null,
  drive_folder_id text not null check (length(drive_folder_id) between 10 and 255),
  folder_name text,
  updated_at timestamptz not null default now(),
  foreign key (connection_id, workspace_id) references public.kw_social_drive_connections(id, workspace_id) on delete cascade
);
create index if not exists kw_social_drive_folders_workspace_idx on public.kw_social_drive_folders(workspace_id);
create or replace function public.kw_social_drive_folder_project_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (
    select 1 from public.kw_projects p
    where p.id = new.project_id and p.workspace_id = new.workspace_id and p.app_key = 'social'
  ) then raise exception 'Drive folder must belong to a Social project in this workspace';
  end if;
  return new;
end; $$;
create trigger kw_social_drive_folder_project_guard
before insert or update on public.kw_social_drive_folders
for each row execute function public.kw_social_drive_folder_project_guard();

alter table public.kw_social_drive_connections enable row level security;
alter table public.kw_social_drive_folders enable row level security;
-- Metadata read is internal only; customers are never workspace members.
create policy kw_social_drive_connections_read on public.kw_social_drive_connections
for select to authenticated using (public.kw_is_workspace_member(workspace_id));
create policy kw_social_drive_folders_read on public.kw_social_drive_folders
for select to authenticated using (public.kw_is_workspace_member(workspace_id));
-- No browser writes. Authenticated users cannot add arbitrary Drive connections/folders.
revoke all on public.kw_social_drive_connections from anon, authenticated;
revoke all on public.kw_social_drive_folders from anon, authenticated;
grant select on public.kw_social_drive_connections to authenticated;
grant select on public.kw_social_drive_folders to authenticated;
-- Writes via authenticated server endpoints after checking owner/admin and project membership.
-- No OAuth tokens, refresh tokens, client secrets or access tokens in these tables.

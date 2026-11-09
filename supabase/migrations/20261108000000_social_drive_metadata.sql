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
-- All Drive operations pass through the project-authorized Edge functions.
revoke all on public.kw_social_drive_connections, public.kw_social_drive_folders from public, anon, authenticated;

-- A credential belongs to exactly one project. Only the Edge service can read ciphertext.
alter table public.kw_social_drive_connections
  add column project_id uuid not null unique references public.kw_projects(id) on delete cascade,
  add unique(id, workspace_id, project_id);
alter table public.kw_social_drive_folders
  add foreign key(connection_id,workspace_id,project_id)
  references public.kw_social_drive_connections(id,workspace_id,project_id) on delete cascade;
create table public.kw_social_drive_credentials (
  connection_id uuid primary key references public.kw_social_drive_connections(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  sealed_token text not null
);
create table public.kw_social_drive_oauth (
  project_id uuid primary key references public.kw_projects(id) on delete cascade,
  state uuid not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  verifier text not null,
  expires_at timestamptz not null
);
alter table public.kw_social_drive_oauth enable row level security;
alter table public.kw_social_drive_credentials enable row level security;
revoke all on public.kw_social_drive_oauth, public.kw_social_drive_credentials from public, anon, authenticated;
grant all on public.kw_social_drive_oauth, public.kw_social_drive_credentials, public.kw_social_drive_connections, public.kw_social_drive_folders to service_role;

create function public.kw_social_drive_replace(p_project uuid, p_workspace uuid, p_user uuid, p_token text, p_state uuid, p_session uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare conn uuid;
begin
  perform 1 from public.kw_projects where id=p_project and workspace_id=p_workspace and app_key='social' for update;
  if not found then raise exception 'invalid project'; end if;
  delete from public.kw_social_drive_oauth where project_id=p_project and user_id=p_user
    and state=p_state and session_id=p_session and expires_at>now();
  if not found then raise exception 'expired or superseded authorization'; end if;
  delete from public.kw_social_drive_connections where project_id=p_project;
  insert into public.kw_social_drive_connections(project_id,workspace_id,display_name,status)
    values(p_project,p_workspace,'Google Drive','connected') returning id into conn;
  insert into public.kw_social_drive_credentials values(conn,p_user,p_token);
end; $$;
revoke all on function public.kw_social_drive_replace(uuid,uuid,uuid,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.kw_social_drive_replace(uuid,uuid,uuid,text,uuid,uuid) to service_role;

create function public.kw_social_drive_disconnect(p_project uuid,p_workspace uuid)
returns void language plpgsql security invoker set search_path='' as $$
begin
  perform 1 from public.kw_projects where id=p_project and workspace_id=p_workspace and app_key='social' for update;
  if not found then raise exception 'invalid project'; end if;
  delete from public.kw_social_drive_oauth where project_id=p_project;
  delete from public.kw_social_drive_connections where project_id=p_project;
end; $$;
revoke all on function public.kw_social_drive_disconnect(uuid,uuid) from public,anon,authenticated;
grant execute on function public.kw_social_drive_disconnect(uuid,uuid) to service_role;

-- No accounts are provisioned by this migration.
create table public.kw_social_platform_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.kw_workspaces(id) on delete cascade,
  project_id uuid not null references public.kw_projects(id) on delete cascade,
  platform text not null check (platform in ('instagram','facebook','tiktok')),
  external_account_id text not null check (length(trim(external_account_id)) > 0),
  username text not null check (length(trim(username)) > 0),
  status text not null check (status in ('connected','reauthorization_required','disconnected')),
  authorized_scopes text[] not null default '{}',
  connected_at timestamptz not null,
  expires_at timestamptz,
  display_name text,
  account_type text,
  unique (project_id, platform, external_account_id)
);
create index kw_social_platform_workspace_idx on public.kw_social_platform_connections(workspace_id, project_id);
create function kw_private.guard_social_platform_connection() returns trigger
language plpgsql set search_path='' as $$
begin
  if tg_op='UPDATE' and (old.id,old.workspace_id,old.project_id,old.platform,old.external_account_id)
    is distinct from (new.id,new.workspace_id,new.project_id,new.platform,new.external_account_id) then
    raise exception 'Account identity is immutable';
  end if;
  perform 1 from public.kw_projects where id=new.project_id and workspace_id=new.workspace_id and app_key='social' for share;
  if not found then raise exception 'Invalid Social project'; end if;
  return new;
end $$;
create trigger guard_social_platform_connection before insert or update on public.kw_social_platform_connections
for each row execute function kw_private.guard_social_platform_connection();
alter table public.kw_social_platform_connections enable row level security;
revoke all on public.kw_social_platform_connections from public,anon,authenticated;
grant select on public.kw_social_platform_connections to authenticated;
grant select, insert, update, delete on public.kw_social_platform_connections to service_role;
create policy social_platform_admin_read on public.kw_social_platform_connections for select to authenticated
using (public.kw_is_workspace_admin(workspace_id) and exists (
  select 1 from public.kw_projects p where p.id=project_id and p.workspace_id=kw_social_platform_connections.workspace_id and p.app_key='social'
));

-- Only ciphertext reaches the Data API. Rotation uses a revision compare-and-swap.
create table public.kw_social_platform_credentials (
  connection_id uuid primary key references public.kw_social_platform_connections(id) on delete cascade,
  key_version integer not null check(key_version > 0),
  ciphertext text not null check(ciphertext ~ '^[0-9a-f]{24}\.[0-9a-f]{34,}$'),
  revision bigint not null default 1 check(revision>0)
);
alter table public.kw_social_platform_credentials enable row level security;
revoke all on public.kw_social_platform_credentials from public, anon, authenticated;
grant select,insert,update,delete on public.kw_social_platform_credentials to service_role;

-- Commit a refreshed envelope only if the worker still owns the revision it read.
create function public.kw_rotate_social_platform_credential(
  p_connection uuid, p_revision bigint, p_version integer, p_ciphertext text
) returns boolean language sql security invoker set search_path='' as $$
  with rotated as (
    update public.kw_social_platform_credentials
       set key_version=p_version, ciphertext=p_ciphertext, revision=revision+1
     where connection_id=p_connection and revision=p_revision
     returning connection_id
  ) select exists(select from rotated);
$$;
revoke all on function public.kw_rotate_social_platform_credential(uuid,bigint,integer,text) from public,anon,authenticated;
grant execute on function public.kw_rotate_social_platform_credential(uuid,bigint,integer,text) to service_role;

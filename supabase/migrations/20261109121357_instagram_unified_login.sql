create table public.kw_instagram_authorizations (
 project_id uuid primary key references public.kw_projects on delete cascade,
 state uuid not null unique, user_id uuid not null references auth.users on delete cascade,
 session_id uuid not null, expires_at timestamptz not null, claimed boolean not null default false
);
alter table public.kw_instagram_authorizations enable row level security;
revoke all on public.kw_instagram_authorizations from public, anon, authenticated;
grant select,insert,update,delete on public.kw_instagram_authorizations to service_role;
alter table public.kw_social_platform_connections add column meta_business_id text, add column meta_config_id text;

create function public.kw_finish_instagram(p_project uuid,p_workspace uuid,p_user uuid,p_session uuid,p_state uuid,
 p_id uuid,p_external text,p_username text,p_scopes text[],p_expires timestamptz,p_business text,p_config text,p_ciphertext text)
returns void language plpgsql security invoker set search_path='' as $$
begin
 perform 1 from public.kw_projects where id=p_project and workspace_id=p_workspace and app_key='social' for update;
 if not found or not exists(select from public.kw_workspace_members where workspace_id=p_workspace and user_id=p_user and role in ('owner','admin')) then raise exception 'Forbidden'; end if;
 delete from public.kw_instagram_authorizations where project_id=p_project and user_id=p_user and session_id=p_session and state=p_state and claimed and expires_at>now();
 if not found then raise exception 'Invalid authorization'; end if;
 insert into public.kw_social_platform_connections(id,workspace_id,project_id,platform,external_account_id,username,status,authorized_scopes,connected_at,expires_at,meta_business_id,meta_config_id)
 values(p_id,p_workspace,p_project,'instagram',p_external,p_username,'connected',p_scopes,now(),p_expires,p_business,p_config)
 on conflict(id) do update set username=excluded.username,status='connected',authorized_scopes=excluded.authorized_scopes,connected_at=now(),expires_at=excluded.expires_at,meta_business_id=p_business,meta_config_id=p_config
 where kw_social_platform_connections.project_id=p_project and kw_social_platform_connections.workspace_id=p_workspace and kw_social_platform_connections.platform='instagram' and kw_social_platform_connections.external_account_id=p_external;
 if not found then raise exception 'Account mismatch'; end if;
 insert into public.kw_social_platform_credentials(connection_id,key_version,ciphertext) values(p_id,1,p_ciphertext)
 on conflict(connection_id) do update set ciphertext=excluded.ciphertext,key_version=1,revision=kw_social_platform_credentials.revision+1;
end $$;
create function public.kw_disconnect_instagram(p_project uuid,p_workspace uuid,p_user uuid,p_id uuid)
returns void language plpgsql security invoker set search_path='' as $$
begin
 perform 1 from public.kw_projects where id=p_project and workspace_id=p_workspace and app_key='social' for update;
 if not found or not exists(select from public.kw_workspace_members where workspace_id=p_workspace and user_id=p_user and role in ('owner','admin')) then raise exception 'Forbidden'; end if;
 delete from public.kw_social_platform_connections where id=p_id and project_id=p_project and workspace_id=p_workspace and platform='instagram';
 if not found then raise exception 'Unknown connection'; end if;
 delete from public.kw_instagram_authorizations where project_id=p_project;
end $$;
revoke all on function public.kw_finish_instagram(uuid,uuid,uuid,uuid,uuid,uuid,text,text,text[],timestamptz,text,text,text),public.kw_disconnect_instagram(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.kw_finish_instagram(uuid,uuid,uuid,uuid,uuid,uuid,text,text,text[],timestamptz,text,text,text),public.kw_disconnect_instagram(uuid,uuid,uuid,uuid) to service_role;

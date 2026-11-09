-- Portal users have a GoTrue role that authenticator cannot assume. All portal reads
-- go through the project-scoped Edge Function; no Workspace memberships are created.
create table public.kw_portal_access (
 user_id uuid primary key references auth.users on delete cascade,
 project_id uuid not null references public.kw_projects on delete cascade,
 name text not null check(length(trim(name)) between 1 and 150),
 contact_email text not null, login_email text not null,
 active boolean not null default true, valid_after timestamptz not null default now(),
 preferences text[] not null default array['new','modified','scheduled','published','reply'],
 unique(project_id,contact_email)
);
create index kw_portal_access_project on public.kw_portal_access(project_id);
create function kw_private.portal_provision() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.role='kw_portal_client' and new.raw_app_meta_data->>'portal'='social' and not exists(select from public.kw_portal_access where user_id=new.id) then
  if new.raw_app_meta_data->>'portal' is distinct from 'social' or not exists(select 1 from public.kw_projects where id=(new.raw_app_meta_data->>'project')::uuid and app_key='social') then raise exception 'Invalid portal assignment';end if;
  insert into public.kw_portal_access(user_id,project_id,name,contact_email,login_email) values(new.id,(new.raw_app_meta_data->>'project')::uuid,new.raw_app_meta_data->>'name',lower(new.raw_app_meta_data->>'contact'),lower(new.email));
 end if;
 return new;
end $$;
create trigger kw_portal_provision after insert or update of role,raw_app_meta_data on auth.users for each row execute function kw_private.portal_provision();
-- Refuse membership even if an operator later tries to add a client as a staff user.
create function kw_private.portal_membership_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from auth.users where id=new.user_id and role='kw_portal_client') then raise exception 'Portal identities cannot be Workspace members'; end if;
 return new;
end $$;
create trigger kw_portal_no_membership before insert or update of user_id on public.kw_workspace_members for each row execute function kw_private.portal_membership_guard();

create function public.kw_portal_authorize(p_user uuid,p_session uuid) returns setof public.kw_portal_access language sql stable security definer set search_path='' as $$
 select a.* from public.kw_portal_access a join auth.users u on u.id=a.user_id join auth.sessions s on s.user_id=u.id
 join public.kw_projects p on p.id=a.project_id and p.app_key='social'
 where a.active and u.role='kw_portal_client' and u.id=p_user and s.id=p_session and s.created_at>=a.valid_after;
$$;

create table public.kw_portal_reviews (
 content_id uuid primary key references public.kw_content_items on delete cascade,
 revision bigint not null default 0,
 status text not null default 'pending' check(status in ('pending','approved','changes'))
);
insert into public.kw_portal_reviews(content_id,status)
select id,'approved' from public.kw_content_items where client_approved;
create table public.kw_portal_history (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.kw_projects on delete cascade,
 content_id uuid not null references public.kw_content_items on delete cascade,
 actor uuid, event text not null check(event in ('approved','changes','pending','reply')),
 comment text not null default '', revision bigint not null, created_at timestamptz not null default clock_timestamp(),
 task_id uuid references public.kw_tasks on delete set null, parent_id uuid references public.kw_portal_history on delete cascade
);
create index kw_portal_history_project on public.kw_portal_history(project_id,created_at desc);
create table public.kw_portal_credentials(
 id uuid primary key default gen_random_uuid(),project_id uuid not null references public.kw_projects on delete cascade,
 service text not null, secret_id uuid not null unique, visible boolean not null default false
);
create index kw_portal_credentials_project on public.kw_portal_credentials(project_id);
create function public.kw_portal_credential(p_action text,p_project uuid,p_id uuid,p_service text default null,p_value jsonb default null,p_visible boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare entry public.kw_portal_credentials; sid uuid; result jsonb;
begin
 if p_action='create' then
  select vault.create_secret(p_value::text) into sid;
  insert into public.kw_portal_credentials(id,project_id,service,secret_id,visible) values(p_id,p_project,p_service,sid,p_visible);
  return '{}'::jsonb;
 end if;
 select * into strict entry from public.kw_portal_credentials where id=p_id and project_id=p_project for update;
 if p_action='reveal' or (p_action='client-reveal' and entry.visible) then select decrypted_secret::jsonb into strict result from vault.decrypted_secrets where id=entry.secret_id;return result;
 elsif p_action='update' then perform vault.update_secret(entry.secret_id,p_value::text);update public.kw_portal_credentials set service=p_service,visible=p_visible where id=p_id;
 elsif p_action='delete' then delete from public.kw_portal_credentials where id=p_id;
 else raise exception 'Invalid action'; end if;
 return '{}'::jsonb;
end $$;
create function kw_private.portal_credential_cleanup() returns trigger language plpgsql security definer set search_path='' as $$
begin delete from vault.secrets where id=old.secret_id;return old; end $$;
create trigger kw_portal_credential_cleanup after delete on public.kw_portal_credentials for each row execute function kw_private.portal_credential_cleanup();

create table public.kw_portal_mail (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.kw_portal_access on delete cascade,
 content_id uuid not null references public.kw_content_items on delete cascade, project_id uuid not null references public.kw_projects on delete cascade,
 kind text not null, event_key text not null, created_at timestamptz not null default now(), due_at timestamptz not null default now(),
 first_attempt_at timestamptz, state text not null default 'pending',tries integer not null default 0,ticket uuid not null default gen_random_uuid(),
 unique(user_id,content_id,kind,event_key)
);
create index kw_portal_mail_due on public.kw_portal_mail(due_at) where state in ('pending','sending');
create function kw_private.portal_enqueue(p_content uuid,p_kind text,p_key text) returns void language sql security definer set search_path='' as $$
 insert into public.kw_portal_mail(user_id,content_id,project_id,kind,event_key)
 select a.user_id,c.id,c.project_id,p_kind,p_key from public.kw_content_items c join public.kw_portal_access a on a.project_id=c.project_id and a.active
 where c.id=p_content and p_kind=any(a.preferences)
 and (p_kind<>'modified' or not exists(select 1 from public.kw_portal_mail m where m.user_id=a.user_id and m.content_id=c.id and m.kind='new' and m.event_key=p_key))
 on conflict do nothing;
$$;
create function kw_private.portal_content_event() returns trigger language plpgsql security definer set search_path='' as $$
declare cid uuid; pid uuid; before_status text; rev bigint;
begin
 if tg_table_name='kw_content_items' then
  if tg_op='INSERT' then perform kw_private.portal_enqueue(new.id,'new',txid_current()::text);return new;end if;
  if old.project_id is distinct from new.project_id then perform kw_private.portal_enqueue(new.id,'new',txid_current()::text);end if;
  if (old.description,old.file_urls,old.content_type,old.project_id) is not distinct from (new.description,new.file_urls,new.content_type,new.project_id) then return new;end if;
  cid:=new.id;
 elsif tg_table_name='kw_content_files' then
  if tg_op='UPDATE' and (old.content_id,old.sort_order,old.storage_path) is not distinct from (new.content_id,new.sort_order,new.storage_path) then return new;end if;
  if tg_op='DELETE' then cid:=old.content_id;else cid:=new.content_id;end if;
 end if;
 select project_id into pid from public.kw_content_items where id=cid;
 if pid is null then return null;end if;
 insert into public.kw_portal_reviews(content_id) values(cid) on conflict do nothing;
 select status into before_status from public.kw_portal_reviews where content_id=cid for update;
 update public.kw_portal_reviews set status='pending',revision=revision+1 where content_id=cid returning revision into rev;
 if before_status<>'pending' then insert into public.kw_portal_history(project_id,content_id,event,revision) values(pid,cid,'pending',rev);end if;
 perform kw_private.portal_enqueue(cid,'modified',txid_current()::text);return null;
end $$;
create trigger kw_portal_content_event after insert or update of description,file_urls,content_type,project_id on public.kw_content_items for each row execute function kw_private.portal_content_event();
create trigger kw_portal_file_event after insert or update or delete on public.kw_content_files for each row execute function kw_private.portal_content_event();
create function kw_private.portal_delivery_event() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.state in ('scheduled','published') and (tg_op='INSERT' or old.state is distinct from new.state or old.scheduled_for is distinct from new.scheduled_for) then
 perform kw_private.portal_enqueue(new.content_id,new.state,new.id::text||':'||coalesce(new.scheduled_for::text,''));end if;
 return new;
end $$;
create trigger kw_portal_delivery after insert or update on public.kw_instagram_publications for each row execute function kw_private.portal_delivery_event();

create function public.kw_portal_review(p_user uuid,p_session uuid,p_content uuid,p_revision bigint,p_event text,p_comment text,p_request uuid)
returns void language plpgsql security definer set search_path='' as $$
declare a public.kw_portal_access; c public.kw_content_items; r public.kw_portal_reviews; task uuid;
begin
 select * into strict a from public.kw_portal_authorize(p_user,p_session);
 select * into strict c from public.kw_content_items where id=p_content and project_id=a.project_id for share;
 if p_event not in ('approved','changes') or p_event is null or length(p_comment)>4000 or (p_event='changes' and coalesce(trim(p_comment),'')='') then raise exception 'Invalid review';end if;
 insert into public.kw_portal_reviews(content_id) values(c.id) on conflict do nothing;
 select * into strict r from public.kw_portal_reviews where content_id=c.id for update;
 if exists(select 1 from public.kw_portal_history where id=p_request and content_id=c.id and actor=p_user) then return;end if;
 if r.revision<>p_revision then raise exception 'El contenido ha cambiado. Actualiza la vista previa.';end if;
 if r.status='approved' and p_event='approved' then return;end if;
 if p_event='changes' then
 insert into public.kw_tasks(workspace_id,project_id,app_key,title,description,metadata)
 values(c.workspace_id,c.project_id,'social','Cambios: '||c.title,p_comment,jsonb_build_object('content_id',c.id,'portal_request',p_request)) returning id into task;
 end if;
 update public.kw_portal_reviews set revision=revision+1,status=p_event where content_id=c.id;
 insert into public.kw_portal_history(id,project_id,content_id,actor,event,comment,revision,task_id)
 values(p_request,c.project_id,c.id,p_user,p_event,coalesce(p_comment,''),r.revision+1,task);
end $$;
create function public.kw_portal_reply(p_project uuid,p_parent uuid,p_actor uuid,p_comment text,p_request uuid) returns void language plpgsql security definer set search_path='' as $$
declare h public.kw_portal_history;
begin
 select * into strict h from public.kw_portal_history where id=p_parent and project_id=p_project and event='changes';
 if coalesce(trim(p_comment),'')='' or length(p_comment)>4000 then raise exception 'Invalid reply';end if;
 insert into public.kw_portal_history(id,project_id,content_id,actor,event,revision,comment,parent_id) values(p_request,p_project,h.content_id,p_actor,'reply',h.revision,p_comment,h.id) on conflict(id) do nothing;
 perform kw_private.portal_enqueue(h.content_id,'reply',p_request::text);
end $$;

do $$ declare t text;begin
 foreach t in array array['kw_portal_access','kw_portal_reviews','kw_portal_history','kw_portal_credentials','kw_portal_mail'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select,insert,update,delete on public.%I to service_role',t);
 end loop;
end $$;
-- Staff may read review badges under existing Workspace membership. Client roles receive no table grant.
grant select on public.kw_portal_reviews to authenticated;
create policy kw_review_staff on public.kw_portal_reviews for select to authenticated using(exists(select 1 from public.kw_content_items c where c.id=content_id and public.kw_is_workspace_member(c.workspace_id)));
revoke all on function public.kw_portal_authorize(uuid,uuid),public.kw_portal_review(uuid,uuid,uuid,bigint,text,text,uuid),public.kw_portal_credential(text,uuid,uuid,text,jsonb,boolean),public.kw_portal_reply(uuid,uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.kw_portal_authorize(uuid,uuid),public.kw_portal_review(uuid,uuid,uuid,bigint,text,text,uuid),public.kw_portal_credential(text,uuid,uuid,text,jsonb,boolean),public.kw_portal_reply(uuid,uuid,uuid,text,uuid) to service_role;
revoke all on function kw_private.portal_enqueue(uuid,text,text),kw_private.portal_provision(),kw_private.portal_membership_guard(),kw_private.portal_credential_cleanup(),kw_private.portal_delivery_event(),kw_private.portal_content_event() from public,anon,authenticated;
select cron.schedule('kw-portal-notifications','*/5 * * * *',$job$
 select net.http_post(url:='https://wrkoskqfjuefgrwhymqu.supabase.co/functions/v1/social-client-portal',
 body:=jsonb_build_object('action','deliver','id',id,'ticket',ticket),timeout_milliseconds:=5000)
 from public.kw_portal_mail where state in ('pending','sending') and due_at<=now() order by due_at limit 25;
$job$);

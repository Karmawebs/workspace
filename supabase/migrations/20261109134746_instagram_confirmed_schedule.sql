-- Historical editorial dates and statuses are never execution instructions.
alter table public.kw_instagram_publications
  add column superseded boolean not null default false,
  add column scheduled_for timestamptz,
  add column started_at timestamptz,
  add column requested_by uuid,
  add column request_key uuid,
  add column transient_retries integer not null default 0,
  add column error_kind text,
  drop constraint kw_instagram_publications_state_check,
  add check(state in ('scheduled','cancelled','publishing','published','error')),
  add check(state not in ('scheduled','cancelled') or scheduled_for is not null);
grant select(superseded,scheduled_for,connection_id,revision) on public.kw_instagram_publications to authenticated;
drop index public.kw_instagram_content_once;
create unique index kw_instagram_content_once on public.kw_instagram_publications(content_id)
 where state in ('scheduled','publishing','published') or send_started;
create index kw_instagram_due on public.kw_instagram_publications(scheduled_for) where state='scheduled';
create unique index kw_instagram_request_key on public.kw_instagram_publications(request_key) where request_key is not null;

-- Persist the exact validated files and their order in the same transaction as the content.
create function public.kw_schedule_instagram(p_workspace uuid,p_project uuid,p_actor uuid,p_content uuid,
 p_version timestamptz,p_values jsonb,p_files uuid[],p_connection uuid,p_due timestamptz,
 p_request uuid,p_existing uuid,p_revision integer) returns public.kw_content_items
language plpgsql security definer set search_path='' as $$
declare acc public.kw_social_platform_connections; item public.kw_content_items;
 job public.kw_instagram_publications; attachments jsonb; payload jsonb;
begin
 if not exists(select 1 from public.kw_workspace_members where workspace_id=p_workspace and user_id=p_actor and role in ('owner','admin'))
 or not exists(select 1 from public.kw_projects where id=p_project and workspace_id=p_workspace and app_key='social')
 then raise exception 'Sin permiso para programar.'; end if;
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 select * into job from public.kw_instagram_publications where request_key=p_request and workspace_id=p_workspace and project_id=p_project and content_id=p_content;
 if found then select * into strict item from public.kw_content_items where id=p_content; return item; end if;
 if p_request is null or p_due is null or not isfinite(p_due) or p_due<=clock_timestamp() then raise exception 'Selecciona una fecha futura.'; end if;
 if (p_values->>'channel') is distinct from 'instagram' or (p_values->>'project_id')::uuid is distinct from p_project then raise exception 'Destino incompatible.'; end if;
 select * into acc from public.kw_social_platform_connections where id=p_connection and project_id=p_project and workspace_id=p_workspace and platform='instagram' and status='connected' and 'instagram_content_publish'=any(authorized_scopes) and (expires_at is null or expires_at>p_due) for share;
 if not found then raise exception 'La autorización no es válida para esa fecha.'; end if;
 if cardinality(p_files) not between 1 and 10 then raise exception 'Archivos inválidos.'; end if;
 perform 1 from public.kw_content_items where id=p_content and workspace_id=p_workspace for update;
 if exists(select 1 from public.kw_content_items where id=p_content and (workspace_id<>p_workspace or (project_id is not null and project_id<>p_project))) then raise exception 'El contenido pertenece a otro proyecto.'; end if;
 if p_existing is not null then
   -- The uncommitted transition lets the ordinary media save run. On any error
   -- PostgreSQL restores the previous schedule, files and content together.
   update public.kw_instagram_publications set state='cancelled' where id=p_existing and content_id=p_content and workspace_id=p_workspace and project_id=p_project and state='scheduled' and revision=p_revision returning * into job;
   if not found then raise exception 'La programación ha cambiado o ya se está publicando.'; end if;
 end if;
 select * into item from public.kw_save_social_content(p_workspace,p_content,p_version,
   p_values||jsonb_build_object('status','approved','scheduled_at',p_due),p_files);
 select jsonb_agg(jsonb_build_object('id',id,'storage_path',storage_path,'mime_type',mime_type,'size',size) order by sort_order,id)
 into attachments from public.kw_content_files where content_id=p_content and workspace_id=p_workspace;
 payload:=jsonb_build_object('version',item.updated_at,'files',attachments,'caption',coalesce(item.description,''));
 if p_existing is null then
   insert into public.kw_instagram_publications(id,workspace_id,project_id,content_id,connection_id,external_account_id,username,format,state,snapshot,scheduled_for,requested_by,request_key)
   values(p_request,p_workspace,p_project,p_content,acc.id,acc.external_account_id,acc.username,item.content_type,'scheduled',payload,p_due,p_actor,p_request);
 else
   update public.kw_instagram_publications set superseded=false,scheduled_for=p_due,snapshot=payload,state='scheduled',connection_id=acc.id,
    username=acc.username,external_account_id=acc.external_account_id,format=item.content_type,revision=revision+1,requested_by=p_actor,request_key=p_request where id=p_existing;
 end if;
 return item;
end $$;
revoke all on function public.kw_schedule_instagram(uuid,uuid,uuid,uuid,timestamptz,jsonb,uuid[],uuid,timestamptz,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.kw_schedule_instagram(uuid,uuid,uuid,uuid,timestamptz,jsonb,uuid[],uuid,timestamptz,uuid,uuid,integer) to service_role;

create function kw_private.protect_instagram_delivery() returns trigger language plpgsql security definer set search_path='' as $$
declare ids uuid[];
begin
 if tg_table_name='kw_content_items' then ids:=array[old.id];
 elsif tg_op='INSERT' then ids:=array[new.content_id];
 elsif tg_op='DELETE' then ids:=array[old.content_id];
 else ids:=array[old.content_id,new.content_id]; end if;
 if tg_table_name='kw_content_files' then
   perform 1 from public.kw_content_items where id=any(ids) order by id for update;
 end if;
 if exists(select 1 from public.kw_instagram_publications where content_id=any(ids) and state in ('scheduled','publishing') for share)
 then raise exception 'Ya existe una operación activa. Reprograma o cancela antes de editar.'; end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
revoke all on function kw_private.protect_instagram_delivery() from public,anon,authenticated;
create trigger protect_instagram_content before update or delete on public.kw_content_items for each row execute function kw_private.protect_instagram_delivery();
create trigger protect_instagram_files before insert or update or delete on public.kw_content_files for each row execute function kw_private.protect_instagram_delivery();

create function kw_private.start_due_instagram() returns void language sql security invoker set search_path='' as $$
 with due as (select id from public.kw_instagram_publications where state='scheduled' and scheduled_for<=now() order by scheduled_for for update skip locked limit 50)
 update public.kw_instagram_publications p set state='publishing',started_at=now(),revision=revision+1
 from due where p.id=due.id;
$$;
revoke all on function kw_private.start_due_instagram() from public,anon,authenticated;
select cron.schedule('kw-instagram-resume-confirmed','* * * * *',$job$
 select kw_private.start_due_instagram();
 select net.http_post(url:='https://wrkoskqfjuefgrwhymqu.supabase.co/functions/v1/social-instagram-publish',
 body:=jsonb_build_object('action','resume','attemptId',id,'ticket',worker_ticket),timeout_milliseconds:=5000)
 from public.kw_instagram_publications where state='publishing' and lease_until < now()
 order by lease_until,created_at limit 50;
$job$);

create or replace view public.kw_social_content_delivery with (security_invoker=true) as
select c.*,p.state as publication_state,p.published_at as instagram_published_at,p.permalink,p.error_message as publication_error,p.send_started,
 coalesce(p.published_at,p.scheduled_for,c.scheduled_at) as calendar_at,
 coalesce(p.state,case when c.status='approved' then 'ready' else 'draft' end) as main_state,
 p.id as attempt_id,p.revision as attempt_revision,p.connection_id as destination_id,p.scheduled_for as automatic_at,
 (select name from public.kw_projects where id=c.project_id and workspace_id=c.workspace_id) as social_project_name
from public.kw_content_items c left join lateral (
 select id,state,published_at,permalink,error_message,send_started,scheduled_for,revision,connection_id
 from public.kw_instagram_publications where not superseded and content_id=c.id and workspace_id=c.workspace_id and project_id=c.project_id
 order by created_at desc limit 1
) p on true;

create function kw_private.clear_previous_delivery() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.kw_instagram_publications set superseded=true where content_id=new.id and state in ('cancelled','error') and not send_started and not superseded;
 return new;
end $$;
revoke all on function kw_private.clear_previous_delivery() from public,anon,authenticated;
create trigger clear_previous_delivery after update on public.kw_content_items for each row execute function kw_private.clear_previous_delivery();

-- Keep the confirmed timeline even when the active row is rescheduled in place.
create table public.kw_instagram_schedule_events (
 id bigint generated always as identity primary key,
 attempt_id uuid not null references public.kw_instagram_publications(id) on delete cascade,
 occurred_at timestamptz not null default clock_timestamp(),
 event text not null check(event in ('scheduled','rescheduled','cancelled','publishing','published','error')),
 scheduled_for timestamptz not null
);
create index kw_instagram_schedule_history on public.kw_instagram_schedule_events(attempt_id,occurred_at);
alter table public.kw_instagram_schedule_events enable row level security;
revoke all on public.kw_instagram_schedule_events from public,anon,authenticated;
grant select on public.kw_instagram_schedule_events to authenticated,service_role;
create policy schedule_history_reader on public.kw_instagram_schedule_events for select to authenticated
using(exists(select 1 from public.kw_instagram_publications p where p.id=attempt_id));
create function kw_private.record_schedule_event() returns trigger language plpgsql security definer set search_path='' as $$
declare kind text;
begin
 if new.scheduled_for is null then return new; end if;
 if tg_op='INSERT' then kind:='scheduled';
 elsif new.state='scheduled' and old.request_key is distinct from new.request_key then kind:='rescheduled';
 elsif old.state is distinct from new.state then kind:=new.state;
 else return new; end if;
 -- Internal temporary cancellation inside the atomic edit is omitted. A real
 -- cancellation is recorded by the deferred trigger only if still cancelled.
 if kind='cancelled' and not exists(select 1 from public.kw_instagram_publications where id=new.id and state='cancelled') then return new; end if;
 insert into public.kw_instagram_schedule_events(attempt_id,event,scheduled_for) values(new.id,kind,new.scheduled_for);
 return new;
end $$;
revoke all on function kw_private.record_schedule_event() from public,anon,authenticated;
create constraint trigger record_schedule_event after insert or update on public.kw_instagram_publications
deferrable initially deferred for each row execute function kw_private.record_schedule_event();

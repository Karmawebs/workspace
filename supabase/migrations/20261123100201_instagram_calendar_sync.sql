-- One queue per official connection; tickets/cursors never reach the browser.
create table public.kw_instagram_sync (
 connection_id uuid primary key references public.kw_social_platform_connections(id) on delete cascade,
 ticket uuid not null default gen_random_uuid(),
 lease_until timestamptz not null default '-infinity',
 next_at timestamptz not null default now(),
 cursor text,
 last_success_at timestamptz,
 last_error text,
 failures integer not null default 0,
 imported_count integer not null default 0
);
alter table public.kw_instagram_sync enable row level security;
revoke all on public.kw_instagram_sync from public,anon,authenticated;
grant select(connection_id,last_success_at,last_error,imported_count) on public.kw_instagram_sync to authenticated;
grant all on public.kw_instagram_sync to service_role;
create policy instagram_sync_reader on public.kw_instagram_sync for select to authenticated using (
 exists(select 1 from public.kw_social_platform_connections c where c.id=connection_id)
);
create function kw_private.enqueue_instagram_sync() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.platform='instagram' and new.status='connected' then
 insert into public.kw_instagram_sync(connection_id) values(new.id)
 on conflict(connection_id) do update set next_at=now(),cursor=null,last_error=null;
 end if;
 return new;
end $$;
revoke all on function kw_private.enqueue_instagram_sync() from public,anon,authenticated;
create trigger enqueue_instagram_sync after insert or update of connected_at,status on public.kw_social_platform_connections
for each row execute function kw_private.enqueue_instagram_sync();
insert into public.kw_instagram_sync(connection_id) select id from public.kw_social_platform_connections where platform='instagram' and status='connected';

-- The official account + media ID is unique within the client, including local publications.
create unique index kw_instagram_import_identity on public.kw_content_items
 (workspace_id,project_id,(metadata->'instagram'->>'account_id'),(metadata->'instagram'->>'id'))
 where metadata->'instagram'->>'id' is not null;

create function public.kw_import_instagram_media(p_connection uuid,p_media jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare a public.kw_social_platform_connections; c public.kw_content_items; item_id uuid; stamp timestamptz; fmt text;
begin
 select * into strict a from public.kw_social_platform_connections where id=p_connection and platform='instagram' and status='connected' for share;
 if coalesce(p_media->>'id','') !~ '^[0-9]+$' then raise exception 'Invalid media'; end if;
 stamp:=(p_media->>'timestamp')::timestamptz;
 if stamp is null or not isfinite(stamp) then raise exception 'Invalid timestamp'; end if;
 perform pg_advisory_xact_lock(hashtextextended(a.project_id::text||a.external_account_id,0));
 select content_id into item_id from public.kw_instagram_publications
 where workspace_id=a.workspace_id and project_id=a.project_id and external_account_id=a.external_account_id and media_id=p_media->>'id' limit 1;
 if item_id is null then
 select id into item_id from public.kw_content_items where workspace_id=a.workspace_id and project_id=a.project_id
 and metadata->'instagram'->>'account_id'=a.external_account_id and metadata->'instagram'->>'id'=p_media->>'id';
 end if;
 fmt:=case when p_media->>'media_type'='CAROUSEL_ALBUM' then 'carousel' when p_media->>'media_product_type'='REELS' then 'reel' when p_media->>'media_product_type'='STORY' then 'story' else 'post' end;
 if item_id is null then
 insert into public.kw_content_items(workspace_id,project_id,title,description,content_type,channel,status,scheduled_at,published_at,metadata)
 values(a.workspace_id,a.project_id,coalesce(nullif(left(p_media->>'caption',90),''),'Publicación de @'||a.username),coalesce(p_media->>'caption',''),fmt,'instagram','published',stamp,stamp,
 jsonb_build_object('origin','instagram','instagram',p_media||jsonb_build_object('account_id',a.external_account_id))) returning id into item_id;
 else
 -- Service-only refresh, never delete history and never replace local originals.
 perform set_config('kw.instagram_sync','on',true);
 update public.kw_content_items set metadata=metadata||jsonb_build_object('instagram',coalesce(metadata->'instagram','{}')||p_media||jsonb_build_object('account_id',a.external_account_id)),
 published_at=stamp where id=item_id;
 perform set_config('kw.instagram_sync','off',true);
 end if;
 return item_id;
end $$;
revoke all on function public.kw_import_instagram_media(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.kw_import_instagram_media(uuid,jsonb) to service_role;

create or replace function kw_private.protect_instagram_delivery() returns trigger language plpgsql security definer set search_path='' as $$
declare ids uuid[];
begin
 if tg_table_name='kw_content_items' then ids:=array[old.id];
 elsif tg_op='INSERT' then ids:=array[new.content_id];
 elsif tg_op='DELETE' then ids:=array[old.content_id];
 else ids:=array[old.content_id,new.content_id]; end if;
 if tg_table_name='kw_content_files' then perform 1 from public.kw_content_items where id=any(ids) order by id for update; end if;
 if tg_table_name='kw_content_items' and tg_op='UPDATE' and current_setting('role',true)='service_role'
 and current_setting('kw.instagram_sync',true)='on' then return new; end if;
 if exists(select 1 from public.kw_instagram_publications where content_id=any(ids) and (state in ('scheduled','publishing','published') or send_started) for share)
 or exists(select 1 from public.kw_content_items where id=any(ids) and (published_at is not null or status='published'))
 then raise exception 'El contenido está publicado o tiene una operación activa.'; end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;

-- Atomic date-only move uses the same job row; worker claims contend on its lock.
create function public.kw_move_social_content(p_content uuid,p_version timestamptz,p_due timestamptz,p_attempt uuid default null,p_revision integer default null)
returns void language plpgsql security definer set search_path='' as $$
declare c public.kw_content_items; j public.kw_instagram_publications;
begin
 select * into strict c from public.kw_content_items where id=p_content for update;
 if auth.uid() is null or not public.kw_is_workspace_admin(c.workspace_id) then raise exception 'Sin permiso.'; end if;
 if c.updated_at is distinct from p_version then raise exception 'El contenido ha cambiado. Recarga el calendario.'; end if;
 if p_due is null or not isfinite(p_due) then raise exception 'Fecha inválida.'; end if;
 if c.published_at is not null or c.status='published' then raise exception 'La publicación es de consulta.'; end if;
 select * into j from public.kw_instagram_publications where content_id=c.id and not superseded order by created_at desc limit 1 for update;
 if found and (j.state in ('publishing','published') or j.send_started) then raise exception 'La publicación ya ha empezado.'; end if;
 if j.state='scheduled' then
 if j.id is distinct from p_attempt or j.revision is distinct from p_revision then raise exception 'La programación ha cambiado.'; end if;
 if p_due<=clock_timestamp() then raise exception 'Selecciona una fecha futura.'; end if;
 perform 1 from public.kw_social_platform_connections where id=j.connection_id and status='connected' and (expires_at is null or expires_at>p_due) for share;
 if not found then raise exception 'Reconecta Instagram antes de reprogramar.'; end if;
 update public.kw_instagram_publications set state='cancelled' where id=j.id;
 elsif p_attempt is not null and j.id is distinct from p_attempt then raise exception 'La programación ha cambiado.';
 end if;
 update public.kw_content_items set scheduled_at=p_due where id=c.id returning * into c;
 if j.state='scheduled' then
 update public.kw_instagram_publications set state='scheduled',superseded=false,scheduled_for=p_due,revision=revision+1,request_key=gen_random_uuid(),snapshot=jsonb_set(snapshot,'{version}',to_jsonb(c.updated_at)) where id=j.id;
 end if;
end $$;
revoke all on function public.kw_move_social_content(uuid,timestamptz,timestamptz,uuid,integer) from public,anon;
grant execute on function public.kw_move_social_content(uuid,timestamptz,timestamptz,uuid,integer) to authenticated;

create or replace view public.kw_social_content_delivery with (security_invoker=true) as
select c.*,coalesce(p.state,case when c.published_at is not null or c.status='published' then 'published' end) as publication_state,
 coalesce(c.published_at,p.published_at) as instagram_published_at,coalesce(c.metadata->'instagram'->>'permalink',p.permalink) as permalink,p.error_message as publication_error,p.send_started,
 coalesce(c.published_at,p.published_at,p.scheduled_for,c.scheduled_at) as calendar_at,
 coalesce(p.state,case when c.published_at is not null or c.status='published' then 'published' when c.status='approved' then 'ready' else 'draft' end) as main_state,
 p.id as attempt_id,p.revision as attempt_revision,p.connection_id as destination_id,p.scheduled_for as automatic_at,
 (select name from public.kw_projects where id=c.project_id and workspace_id=c.workspace_id) as social_project_name
from public.kw_content_items c left join lateral (
 select id,state,published_at,permalink,error_message,send_started,scheduled_for,revision,connection_id
 from public.kw_instagram_publications where not superseded and content_id=c.id and workspace_id=c.workspace_id and project_id=c.project_id
 order by created_at desc limit 1
) p on true;

select cron.schedule('kw-instagram-sync','* * * * *',$job$
 select net.http_post(url:='https://wrkoskqfjuefgrwhymqu.supabase.co/functions/v1/social-instagram-sync',
 body:=jsonb_build_object('connectionId',s.connection_id,'ticket',s.ticket),timeout_milliseconds:=5000)
 from public.kw_instagram_sync s join public.kw_social_platform_connections c on c.id=s.connection_id
 where c.status='connected' and s.next_at<=now() and s.lease_until<now() order by s.next_at limit 10;
$job$);

-- Private cache of owned media; deterministic object names avoid duplicate files.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('instagram-media','instagram-media',false,52428800,array['image/jpeg','image/png','image/webp','video/mp4']);
create policy instagram_media_read on storage.objects for select to authenticated using (
 bucket_id='instagram-media' and exists(select 1 from public.kw_social_platform_connections c where c.id::text=(storage.foldername(name))[1])
);
-- Historical imports must not send "new content" emails or reopen client approval.
drop trigger kw_portal_content_event on public.kw_content_items;
create trigger kw_portal_content_event after insert or update of description,file_urls,content_type,project_id on public.kw_content_items
for each row when (new.metadata->>'origin' is distinct from 'instagram') execute function kw_private.portal_content_event();

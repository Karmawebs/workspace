-- Social originals are private. Stable paths survive project moves and future archives.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('social-media','social-media',false,2147483648,array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime']);

create table public.kw_content_files (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.kw_workspaces(id) on delete cascade,
 content_id uuid references public.kw_content_items(id) on delete cascade,
 storage_path text not null unique,
 original_filename text not null check(length(original_filename) between 1 and 255),
 mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp','video/mp4','video/quicktime')),
 size bigint not null check(size > 0 and size <= 2147483648),
 sort_order integer not null default 0 check(sort_order >= 0),
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(),
 preview_storage_path text,
 drive_file_id text,
 drive_url text,
 archive_status text not null default 'local' check(archive_status in ('local','pending','verified','archived','error')),
 archived_at timestamptz,
 check(storage_path ~ ('^' || workspace_id::text || '/' || id::text || '/original\.(jpg|jpeg|png|webp|mp4|mov)$'))
);
create index kw_content_files_content_order on public.kw_content_files(content_id,sort_order,id);
create index kw_content_files_workspace on public.kw_content_files(workspace_id);
create index kw_content_files_creator on public.kw_content_files(created_by);
comment on column public.kw_content_files.content_id is 'NULL reserves an upload for its creator; attachment and content save commit together. Abandoned reservations expire after 24h.';

create table public.kw_social_storage_cleanup (
 storage_path text primary key,
 workspace_id uuid not null,
 created_at timestamptz not null default now()
);
create index kw_social_storage_cleanup_workspace on public.kw_social_storage_cleanup(workspace_id,created_at);
alter table public.kw_content_files enable row level security;
alter table public.kw_social_storage_cleanup enable row level security;
grant select,insert,delete on public.kw_content_files to authenticated;
grant update(content_id,sort_order) on public.kw_content_files to authenticated;
grant select,delete on public.kw_social_storage_cleanup to authenticated;
revoke all on public.kw_content_files,public.kw_social_storage_cleanup from anon;
create policy social_files_read on public.kw_content_files for select to authenticated
 using(public.kw_is_workspace_member(workspace_id) and (content_id is not null or created_by=(select auth.uid())));
create policy social_files_reserve on public.kw_content_files for insert to authenticated
 with check(public.kw_is_workspace_member(workspace_id) and created_by=(select auth.uid()) and content_id is null
 and preview_storage_path is null and drive_file_id is null and drive_url is null and archive_status='local' and archived_at is null);
create policy social_files_update on public.kw_content_files for update to authenticated
 using(public.kw_is_workspace_member(workspace_id) and (content_id is not null or created_by=(select auth.uid())))
 with check(public.kw_is_workspace_member(workspace_id) and (content_id is null or exists(select 1 from public.kw_content_items c where c.id=content_id and c.workspace_id=kw_content_files.workspace_id)));
create policy social_files_delete on public.kw_content_files for delete to authenticated
 using(public.kw_is_workspace_member(workspace_id) and (content_id is not null or created_by=(select auth.uid())));
create policy social_cleanup_read on public.kw_social_storage_cleanup for select to authenticated using(public.kw_is_workspace_member(workspace_id));
create policy social_cleanup_ack on public.kw_social_storage_cleanup for delete to authenticated
 using(public.kw_is_workspace_member(workspace_id) and not exists(select 1 from storage.objects o where o.bucket_id='social-media' and o.name=storage_path));

create policy social_original_read on storage.objects for select to authenticated using(
 bucket_id='social-media' and (exists(select 1 from public.kw_content_files f where f.storage_path=name)
 or exists(select 1 from public.kw_social_storage_cleanup q where q.storage_path=name)));
create policy social_original_upload on storage.objects for insert to authenticated with check(
 bucket_id='social-media' and exists(select 1 from public.kw_content_files f where f.storage_path=name and f.content_id is null and f.created_by=(select auth.uid()) and f.created_at > now()-interval '24 hours'));
-- Attached originals cannot be removed or overwritten. Only committed deletions enter this queue.
create policy social_original_delete on storage.objects for delete to authenticated using(
 bucket_id='social-media' and exists(select 1 from public.kw_social_storage_cleanup q where q.storage_path=name)
 and not exists(select 1 from public.kw_content_files f where f.storage_path=name));

create function kw_private.social_file_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.id<>old.id or new.workspace_id<>old.workspace_id or new.storage_path<>old.storage_path or
 (old.content_id is not null and new.content_id is distinct from old.content_id) then
 raise exception 'La identidad del archivo no se puede cambiar.'; end if;
 if new.content_id is not null then
 if not exists(select 1 from public.kw_content_items c where c.id=new.content_id and c.workspace_id=new.workspace_id) then
 raise exception 'Contenido de otro workspace.'; end if;
 if not exists(select 1 from storage.objects o where o.bucket_id='social-media' and o.name=new.storage_path
 and (o.metadata->>'size')::bigint=new.size and o.metadata->>'mimetype'=new.mime_type) then
 raise exception 'El archivo no ha terminado de subir o sus metadatos no coinciden.'; end if;
 end if;
 return new;
end $$;
create trigger social_file_guard before update on public.kw_content_files for each row execute function kw_private.social_file_guard();
-- Definer only for an internal cascade-safe outbox; never callable through the Data API.
create function kw_private.social_file_cleanup() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.kw_social_storage_cleanup(storage_path,workspace_id) values(old.storage_path,old.workspace_id) on conflict do nothing;
 if old.preview_storage_path is not null then
 insert into public.kw_social_storage_cleanup(storage_path,workspace_id) values(old.preview_storage_path,old.workspace_id) on conflict do nothing;
 end if;
 return old;
end $$;
revoke all on function kw_private.social_file_guard(),kw_private.social_file_cleanup() from public,anon,authenticated;
create trigger social_file_cleanup after delete on public.kw_content_files for each row execute function kw_private.social_file_cleanup();

create function public.kw_save_social_content(p_workspace_id uuid,p_content_id uuid,p_expected_updated_at timestamptz,p_values jsonb,p_file_ids uuid[])
returns public.kw_content_items language plpgsql security invoker set search_path='' as $$
declare result public.kw_content_items; file_id uuid; position integer:=0;
begin
 if not public.kw_is_workspace_member(p_workspace_id) then raise exception 'Sin acceso al workspace.'; end if;
 if cardinality(p_file_ids)>100 or cardinality(p_file_ids)<>(select count(distinct x) from unnest(p_file_ids) x) then raise exception 'Lista de archivos inválida.'; end if;
 if nullif(trim(p_values->>'title'),'') is null then raise exception 'El título es obligatorio.'; end if;
 if nullif(p_values->>'project_id','') is not null and not exists(select 1 from public.kw_projects where id=(p_values->>'project_id')::uuid and workspace_id=p_workspace_id and app_key='social') then raise exception 'Proyecto no válido.'; end if;
 if p_expected_updated_at is null then
 insert into public.kw_content_items(id,workspace_id,title) values(p_content_id,p_workspace_id,p_values->>'title');
 else
 select * into result from public.kw_content_items where id=p_content_id and workspace_id=p_workspace_id for update;
 if not found or result.updated_at<>p_expected_updated_at then raise exception 'El registro cambió o ya no tienes acceso. Recarga antes de guardar.'; end if;
 end if;
 -- Lock reservations before changing associations, preventing concurrent saves/expiration.
 perform 1 from public.kw_content_files where id=any(p_file_ids) order by id for update;
 foreach file_id in array p_file_ids loop
 update public.kw_content_files set content_id=p_content_id,sort_order=position
 where id=file_id and workspace_id=p_workspace_id and (content_id=p_content_id or (content_id is null and created_by=auth.uid() and created_at>now()-interval '24 hours'));
 if not found then raise exception 'Archivo no disponible; vuelve a seleccionarlo.'; end if;
 position:=position+1;
 end loop;
 delete from public.kw_content_files where content_id=p_content_id and workspace_id=p_workspace_id and not(id=any(p_file_ids));
 update public.kw_content_items set
 title=trim(p_values->>'title'),description=nullif(p_values->>'description',''),project_id=nullif(p_values->>'project_id','')::uuid,
 content_type=coalesce(p_values->>'content_type','post'),status=coalesce(p_values->>'status','draft'),
 scheduled_at=nullif(p_values->>'scheduled_at','')::timestamptz,
 published_at=case when p_values->>'status'='published' then coalesce(published_at,now()) else null end,
 updated_at=clock_timestamp()
 where id=p_content_id and workspace_id=p_workspace_id returning * into result;
 return result;
end $$;
revoke all on function public.kw_save_social_content(uuid,uuid,timestamptz,jsonb,uuid[]) from public,anon;
grant execute on function public.kw_save_social_content(uuid,uuid,timestamptz,jsonb,uuid[]) to authenticated;

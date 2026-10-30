-- Phase 2: internal editorial workflow only. No Storage/auth/cleanup changes.
alter table public.kw_content_items
  add column internal_notes text not null default '',
  add column client_approved boolean not null default false;
-- Keep draft as the stable internal key for Preparando. No media/data rewrite.
alter table public.kw_content_items alter column channel set default 'instagram';
-- Existing known states are retained. Unknown legacy states remain readable;
-- this constraint enforces the seven states for future writes.
alter table public.kw_content_items add constraint kw_content_items_social_status
  check (status in ('idea','draft','review','approved','scheduled','published','discarded')) not valid;
comment on column public.kw_content_items.status is 'Internal manual editorial state; scheduled/published do not invoke external publication.';
comment on column public.kw_content_items.client_approved is 'Independent client approval; never changes editorial state.';
comment on column public.kw_content_items.channel is 'Extensible channel key; instagram, facebook, instagram_facebook initially. Legacy values preserved.';

create or replace function public.kw_save_social_content(p_workspace_id uuid,p_content_id uuid,p_expected_updated_at timestamptz,p_values jsonb,p_file_ids uuid[])
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
 content_type=coalesce(p_values->>'content_type','post'),status=coalesce(p_values->>'status','idea'),
 channel=case when p_values ? 'channel' then nullif(p_values->>'channel','') else channel end,
 internal_notes=case when p_values ? 'internal_notes' then coalesce(p_values->>'internal_notes','') else internal_notes end,
 client_approved=case when p_values ? 'client_approved' then coalesce((p_values->>'client_approved')::boolean,false) else client_approved end,
 scheduled_at=nullif(p_values->>'scheduled_at','')::timestamptz,
 -- published_at is reserved for evidence of external publication; manual state does not write it.
 updated_at=clock_timestamp()
 where id=p_content_id and workspace_id=p_workspace_id returning * into result;
 return result;
end $$;
revoke all on function public.kw_save_social_content(uuid,uuid,timestamptz,jsonb,uuid[]) from public,anon;
grant execute on function public.kw_save_social_content(uuid,uuid,timestamptz,jsonb,uuid[]) to authenticated;

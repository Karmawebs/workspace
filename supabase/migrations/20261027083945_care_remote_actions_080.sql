-- Only wrkoskqfjuefgrwhymqu. No jobs are created by this migration.
-- Privileged lookup stays outside the exposed API schema.
create schema if not exists private;
create or replace function private.care_site_member(p_site_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null and exists (
  select 1 from public.kw_care_sites c
  join public.kw_projects p on p.id=c.project_id and p.workspace_id=c.workspace_id and p.app_key='care'
  join public.kw_workspace_members m on m.workspace_id=p.workspace_id and m.user_id=auth.uid()
  where c.legacy_site_id=p_site_id
 );
$$;
revoke all on function private.care_site_member(uuid) from public,anon;
grant usage on schema private to authenticated;
grant execute on function private.care_site_member(uuid) to authenticated;

-- A member must not claim another tenant's legacy site through the editable bridge.
create or replace function private.guard_care_site_binding()
returns trigger language plpgsql set search_path='' as $$
begin
 if current_user in ('authenticated','anon') then
  if TG_OP='INSERT' and new.legacy_site_id is not null then
   raise exception 'El vínculo técnico se crea mediante Conectar' using errcode='42501';
  end if;
  if TG_OP='UPDATE' and (new.legacy_site_id is distinct from old.legacy_site_id or new.workspace_id is distinct from old.workspace_id) then
   raise exception 'No se puede reasignar el vínculo técnico' using errcode='42501';
  end if;
 end if;
 if new.project_id is not null and not exists(select 1 from public.kw_projects p where p.id=new.project_id and p.workspace_id=new.workspace_id and p.app_key='care') then
  raise exception 'Proyecto Care y Workspace incompatibles' using errcode='42501';
 end if;
 return new;
end $$;
create trigger care_site_binding_guard before insert or update on public.kw_care_sites for each row execute function private.guard_care_site_binding();

revoke all on public.action_jobs,public.installations,public.sites from public,anon,authenticated;
grant select on public.action_jobs,public.sites to authenticated;
-- The agent credential is never delivered to the browser, including to members.
grant select(id,site_id,plugin_version,connected_at,last_seen_at,pairing_code,pairing_expires_at) on public.installations to authenticated;
alter table public.action_jobs enable row level security;
alter table public.installations enable row level security;
alter table public.sites enable row level security;
do $$ declare p record; begin
 for p in select tablename,policyname from pg_policies where schemaname='public' and tablename in ('action_jobs','installations','sites') loop
  execute format('drop policy %I on public.%I',p.policyname,p.tablename);
 end loop;
end $$;
create policy workspace_read_actions on public.action_jobs for select to authenticated using (private.care_site_member(site_id));
create policy workspace_read_installations on public.installations for select to authenticated using (private.care_site_member(site_id));
create policy workspace_read_sites on public.sites for select to authenticated using (private.care_site_member(id));
alter view public.site_overview set (security_invoker=true);

revoke execute on function public.enqueue_care_action(uuid,text,jsonb) from public,anon,authenticated;
-- Plugin transport continues through care-agent's service role.
revoke execute on function public.pair_installation(text,uuid,text,text) from public,anon,authenticated;
revoke execute on function public.ingest_diagnostic(text,jsonb) from public,anon,authenticated;
revoke execute on function public.create_site_with_pairing(text,text,public.care_plan_type,text,numeric) from public,anon,authenticated;
revoke execute on function public.prepare_care_project_pairing(uuid) from public,anon;
grant execute on function public.prepare_care_project_pairing(uuid) to authenticated;

-- Also serializes requests racing through different sessions / tabs.
create unique index action_jobs_one_active_per_site on public.action_jobs(site_id) where status in ('pending','running');
create or replace function public.enqueue_workspace_care_action(p_care_site_id uuid,p_action_type text,p_target text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_site uuid; v_job uuid; v_diagnostic uuid; v_name text; v_payload jsonb;
begin
 if auth.uid() is null then raise exception 'Autenticación requerida' using errcode='42501'; end if;
 select c.legacy_site_id into v_site from public.kw_care_sites c where c.id=p_care_site_id;
 if v_site is null or not private.care_site_member(v_site) then raise exception 'Sitio no autorizado' using errcode='42501'; end if;
 perform 1 from public.sites where id=v_site and active and status::text<>'inactive' for update;
 if not found then raise exception 'Web no disponible'; end if;
 if not exists(select 1 from public.installations where site_id=v_site and api_token is not null and connected_at is not null and plugin_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$' and string_to_array(plugin_version,'.')::int[] >= array[0,8,0]) then
  raise exception 'Conecta Karma Care 0.8.0 o superior y sincroniza el diagnóstico';
 end if;
 if p_action_type is null or p_action_type not in ('update_plugins','update_themes','update_wordpress') then raise exception 'Acción no permitida'; end if;
 if exists(select 1 from public.action_jobs where site_id=v_site and status in ('pending','running')) then raise exception 'Ya existe una acción pendiente o en ejecución'; end if;
 select id into v_diagnostic from public.diagnostics where site_id=v_site order by captured_at desc limit 1;
 if p_action_type='update_wordpress' then
  if p_target is not null then raise exception 'WordPress no admite targets'; end if;
  if not exists(select 1 from public.diagnostics where id=v_diagnostic and wp_update_available) then raise exception 'No hay actualización de WordPress'; end if;
  v_name := 'WordPress';
 elsif p_action_type='update_plugins' then
  select name into v_name from public.plugin_snapshots where diagnostic_id=v_diagnostic and slug=p_target and update_available;
 else
  select name into v_name from public.theme_snapshots where diagnostic_id=v_diagnostic and slug=p_target and update_available;
 end if;
 if v_name is null then raise exception 'El elemento no tiene una actualización disponible'; end if;
 if p_target is not null and (p_target='' or p_target like '%..%' or p_target like '/%' or position(chr(92) in p_target)>0) then raise exception 'Identificador no válido'; end if;
 v_payload := jsonb_build_object('targets',case when p_target is null then '[]'::jsonb else jsonb_build_array(p_target) end,'target_name',v_name,'requested_by',auth.uid());
 insert into public.action_jobs(site_id,action_type,target_type,target_slug,requested_payload)
 values(v_site,p_action_type,case p_action_type when 'update_plugins' then 'plugin' when 'update_themes' then 'theme' else 'core' end,p_target,v_payload) returning id into v_job;
 return v_job;
end $$;
revoke all on function public.enqueue_workspace_care_action(uuid,text,text) from public,anon;
grant execute on function public.enqueue_workspace_care_action(uuid,text,text) to authenticated;

create or replace function public.cancel_workspace_care_action(p_action_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.action_jobs j where j.id=p_action_id and private.care_site_member(j.site_id)) then
  raise exception 'Acción no autorizada' using errcode='42501';
 end if;
 update public.action_jobs set status='cancelled',finished_at=now() where id=p_action_id and status='pending';
 return found;
end $$;
revoke all on function public.cancel_workspace_care_action(uuid) from public,anon;
grant execute on function public.cancel_workspace_care_action(uuid) to authenticated;
CREATE OR REPLACE FUNCTION public.agent_finish_action(p_api_token text, p_action_id uuid, p_ok boolean, p_result jsonb DEFAULT '{}'::jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_site uuid; v_job action_jobs%rowtype; v_title text; v_detail text; v_rollback boolean;
begin
 select i.site_id into v_site from installations i where i.api_token=p_api_token limit 1;
 if v_site is null then raise exception 'Credencial no válida'; end if;
 if exists(select 1 from action_jobs where id=p_action_id and site_id=v_site and status in ('succeeded','failed')) then return true; end if;
 update action_jobs set status=case when p_ok then 'succeeded' else 'failed' end,finished_at=now(),result=coalesce(p_result,'{}'::jsonb)
 where id=p_action_id and site_id=v_site and (status='running' or (status='pending' and not p_ok)) returning * into v_job;
 if v_job.id is null then return false; end if;
 v_rollback=exists(select 1 from jsonb_array_elements(coalesce(p_result->'rolled_back','[]'::jsonb)) r where r->>'restored'='true');
 v_title=case
  when v_rollback then 'Actualización revertida automáticamente'
  when v_job.action_type='update_wordpress' then case when p_ok then 'WordPress actualizado' else 'Error actualizando WordPress' end
  when v_job.action_type='update_plugins' then case when p_ok then 'Plugins actualizados con Safe Update' else 'Error actualizando plugins' end
  when v_job.action_type='update_themes' then case when p_ok then 'Temas actualizados con Safe Update' else 'Error actualizando temas' end
  else 'Acción de mantenimiento' end;
 v_detail=coalesce(p_result->>'summary',case when p_ok then 'Acción completada correctamente.' else 'La acción no pudo completarse.' end);
 insert into site_activity(site_id,action_type,title,detail,status) values(v_site,v_job.action_type,v_title,v_detail,case when p_ok then 'success' when v_rollback then 'warning' else 'error' end);
 return true;
end $function$;
CREATE OR REPLACE FUNCTION public.prepare_care_project_pairing(p_project_id uuid)
 RETURNS TABLE(site_id uuid, pairing_code text, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
declare
  v_project public.kw_projects%rowtype;
  v_client_name text;
  v_site uuid;
  v_code text;
  v_expires timestamptz;
begin
  select p.* into v_project
  from public.kw_projects p
  where p.id = p_project_id and p.app_key = 'care';

  if not found then raise exception 'Proyecto Care no encontrado'; end if;

  if not exists (
    select 1 from public.kw_workspace_members m
    where m.workspace_id = v_project.workspace_id and m.user_id = auth.uid()
  ) then raise exception 'No autorizado'; end if;

  select coalesce(nullif(c.name,''), nullif(c.company,''), v_project.name)
  into v_client_name
  from public.kw_clients c
  where c.id = v_project.client_id;

  v_client_name := coalesce(v_client_name, v_project.name, 'Cliente Care');

  select cs.legacy_site_id
  into v_site
  from public.kw_care_sites cs
  where cs.project_id = p_project_id and cs.workspace_id = v_project.workspace_id
  limit 1;

  if v_site is null then
    insert into public.sites(client_name,domain,plan_type,custom_plan_name,monthly_price,status)
    values(
      v_client_name,
      'pendiente-' || replace(p_project_id::text,'-','') || '.care.local',
      'care',
      nullif(v_project.metadata->>'care_plan_name',''),
      coalesce(nullif(v_project.metadata->>'care_plan_price','')::numeric,59),
      'pending'
    ) returning public.sites.id into v_site;

    insert into public.kw_care_sites(workspace_id,project_id,legacy_site_id,domain,status,metadata)
    values(v_project.workspace_id,p_project_id,v_site,'Pendiente de conexión','pending',jsonb_build_object('pairing_created_at',now()));
  end if;

  v_code := 'KC-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,4)) || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,4));
  v_expires := now() + interval '24 hours';

  insert into public.installations(site_id,pairing_code,pairing_expires_at)
  values(v_site,v_code,v_expires)
  on conflict (site_id) do update
    set pairing_code = excluded.pairing_code,
        pairing_expires_at = excluded.pairing_expires_at,
        paired_at = null;

  return query select v_site, v_code, v_expires;
end
$function$;

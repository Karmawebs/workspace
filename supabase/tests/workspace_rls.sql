-- Run only in wrkoskqfjuefgrwhymqu as an administrative SQL test.
-- Requires an existing owner. All fixture changes are rolled back.
begin;
select set_config('request.jwt.claim.sub', (select user_id::text from public.kw_workspace_members where role='owner' limit 1),true);
set local role authenticated;
do $$ declare ws uuid; p uuid; t uuid; s uuid; app text; begin
 select id into strict ws from public.kw_workspaces where slug='karma-workspace';
 foreach app in array array['work','social','care'] loop
  insert into public.kw_projects(workspace_id,app_key,name) values(ws,app,'V1 rollback verification') returning id into p;
  insert into public.kw_tasks(workspace_id,project_id,app_key,title) values(ws,p,app,'Task') returning id into t;
  update public.kw_tasks set status='done' where id=t;
  if not exists(select 1 from public.kw_tasks where id=t and status='done') then raise exception 'Task update failed'; end if;
  insert into public.kw_events(workspace_id,project_id,app_key,title,starts_at) values(ws,p,app,'Event A',now()),(ws,p,app,'Event B',now());
  if (select count(*) from public.kw_events where project_id=p)<>2 then raise exception 'Multiple events failed'; end if;
  insert into public.kw_journal_entries(workspace_id,project_id,app_key,title,body) values(ws,p,app,'Journal','Body');
  insert into public.kw_project_resources(workspace_id,project_id,app_key,type,label,url) values(ws,p,app,'link','Reference','https://example.com');
  insert into public.kw_alerts(workspace_id,project_id,app_key,title) values(ws,p,app,'Alert');
  insert into public.kw_project_panels(project_id,app_key,panel_key,title) values(p,app,'information','Information');
  if app='work' then insert into public.kw_project_milestones(workspace_id,project_id,title) values(ws,p,'Milestone'); end if;
  if app='social' then insert into public.kw_content_items(workspace_id,project_id,title) values(ws,p,'Content'); end if;
  if app='care' then
   insert into public.kw_care_sites(workspace_id,project_id,domain) values(ws,p,'v1-test.invalid') returning id into s;
   insert into public.kw_connections(workspace_id,project_id,care_site_id,connection_type,name) values(ws,p,s,'wordpress','Connection');
  end if;
  update public.kw_projects set archived=true where id=p;
  if not exists(select 1 from public.kw_projects where id=p and archived) then raise exception 'Archive failed'; end if;
 end loop;
end $$;
select set_config('request.jwt.claim.sub','f5ca0000-0000-4000-8000-000000000001',true);
do $$ begin
 if exists(select 1 from public.kw_projects) then raise exception 'Nonmember read failed'; end if;
 begin
  insert into public.kw_projects(workspace_id,app_key,name) values('a2f2782b-0d3a-4d3e-8e5b-faadd94b756f','work','Unauthorized test');
  raise exception 'Nonmember write incorrectly permitted';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.kw_workspace_members(workspace_id,user_id,role) values('a2f2782b-0d3a-4d3e-8e5b-faadd94b756f','f5ca0000-0000-4000-8000-000000000001','owner');
  raise exception 'Self-enrollment incorrectly permitted';
 exception when insufficient_privilege then null; end;
end $$;
rollback;
select 'PASS: shared Core and specialized writes, updates, archive, multiple events, nonmember denial and no self-enrollment. All test writes rolled back.' as verification;

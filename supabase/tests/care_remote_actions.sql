-- Administrative test, only wrkoskqfjuefgrwhymqu. All fixtures/jobs roll back.
-- No HTTP calls and no committed pending jobs: production agents cannot see these jobs.
begin;
do $$ declare ws uuid; owner_id uuid; project uuid; sid uuid; cid uuid; other uuid; code text; tok text; begin
 select workspace_id,user_id into strict ws,owner_id from public.kw_workspace_members where role='owner' limit 1;
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 insert into public.kw_projects(workspace_id,app_key,name) values(ws,'care','Care 0.8 transactional verification') returning id into project;
 select site_id,pairing_code into sid,code from public.prepare_care_project_pairing(project);
 select api_token into tok from public.pair_installation(code,gen_random_uuid(),'0.8.0','https://care-test.invalid');
 if tok is null then raise exception 'Pairing failed'; end if;
 -- Token is used only inside the transaction, never returned.
 perform public.ingest_diagnostic(tok,jsonb_build_object('plugin_version','0.8.0','wp_version','6.4','wp_update_available',true,'health',jsonb_build_array(jsonb_build_object('status','warning','label','Test','detail','Test alert')),'plugins',jsonb_build_array(jsonb_build_object('file','test/test.php','name','Test plugin','version','1','update',true,'new_version','2')),'themes',jsonb_build_array(jsonb_build_object('slug','test-theme','name','Test theme','version','1','update',true,'new_version','2')),'site_kit_status','active','site_kit',jsonb_build_object('services',jsonb_build_array('analytics'))));
 select id into cid from public.kw_care_sites where project_id=project;
 perform set_config('care.test.site',sid::text,true);perform set_config('care.test.bridge',cid::text,true);perform set_config('care.test.project',project::text,true);
 if not exists(select 1 from public.alerts where site_id=sid) then raise exception 'Alerts regression'; end if;
 if not exists(select 1 from public.diagnostics where site_id=sid and raw->'site_kit'->'services' ? 'analytics') then raise exception 'Site Kit regression'; end if;
 insert into public.sites(client_name,domain) values('Foreign fixture','foreign-test.invalid') returning id into other;
 insert into public.action_jobs(site_id,action_type,status) values(other,'update_plugins','failed');
 perform set_config('care.test.foreign',other::text,true);
end $$;
set local role authenticated;
do $$ declare job uuid; bridge uuid:=current_setting('care.test.bridge')::uuid; begin
 job:=public.enqueue_workspace_care_action(bridge,'update_plugins','test/test.php');
 if not exists(select 1 from public.action_jobs where id=job and requested_payload->'targets'='["test/test.php"]'::jsonb and target_slug='test/test.php') then raise exception 'Wrong target'; end if;
 begin perform public.enqueue_workspace_care_action(bridge,'update_themes','test-theme');raise exception 'TEST: duplicate allowed';exception when raise_exception then if sqlerrm='TEST: duplicate allowed' then raise;end if;end;
 if not public.cancel_workspace_care_action(job) then raise exception 'Cancel failed';end if;
 job:=public.enqueue_workspace_care_action(bridge,'update_themes','test-theme');perform public.cancel_workspace_care_action(job);
 job:=public.enqueue_workspace_care_action(bridge,'update_wordpress',null);perform public.cancel_workspace_care_action(job);
 begin perform public.enqueue_workspace_care_action(bridge,'delete_plugin','test/test.php');raise exception 'TEST: invalid action allowed';exception when raise_exception then if sqlerrm='TEST: invalid action allowed' then raise;end if;end;
 begin perform public.enqueue_workspace_care_action(bridge,'update_plugins','Test plugin');raise exception 'TEST: display name allowed';exception when raise_exception then if sqlerrm='TEST: display name allowed' then raise;end if;end;
 if exists(select 1 from public.action_jobs where site_id=current_setting('care.test.foreign')::uuid) then raise exception 'Cross site read';end if;
 begin perform api_token from public.installations;raise exception 'TEST: token exposed';exception when insufficient_privilege then null;end;
 begin insert into public.action_jobs(site_id,action_type) values(current_setting('care.test.site')::uuid,'update_plugins');raise exception 'TEST: direct insert allowed';exception when insufficient_privilege then null;end;
 begin update public.kw_care_sites set legacy_site_id=current_setting('care.test.foreign')::uuid where id=bridge;raise exception 'TEST: bridge hijack allowed';exception when insufficient_privilege then null;end;
 perform set_config('care.test.job',job::text,true);
end $$;
select set_config('request.jwt.claim.sub','f5ca0000-0000-4000-8000-000000000008',true);
do $$ begin
 if exists(select 1 from public.action_jobs) then raise exception 'Nonmember read';end if;
 if exists(select id from public.installations) then raise exception 'Nonmember installation read';end if;
 begin perform public.enqueue_workspace_care_action(current_setting('care.test.bridge')::uuid,'update_wordpress',null);raise exception 'TEST: nonmember enqueue allowed';exception when insufficient_privilege then null;end;
 begin perform public.cancel_workspace_care_action(current_setting('care.test.job')::uuid);raise exception 'TEST: nonmember cancel allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role anon;
do $$ begin
 begin perform public.enqueue_care_action(current_setting('care.test.site')::uuid,'update_wordpress','[]');raise exception 'TEST: legacy anon allowed';exception when insufficient_privilege then null;end;
 begin perform public.enqueue_workspace_care_action(current_setting('care.test.bridge')::uuid,'update_wordpress',null);raise exception 'TEST: anon allowed';exception when insufficient_privilege then null;end;
 begin perform id from public.action_jobs;raise exception 'TEST: anon read';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
select 'PASS: pairing, diagnostic, alerts, Site Kit, single targets, duplicate rejection, cancellation, RLS, token privacy, bridge hijack denial, outsider and anon denial. All writes rolled back.' as verification;

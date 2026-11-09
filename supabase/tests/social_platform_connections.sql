-- Run in a disposable local Workspace schema. All fixtures roll back.
begin;
insert into auth.users(id,email) values ('10000000-0000-4000-8000-000000000001','social21@example.test');
insert into kw_workspaces(id,name,slug) values
('20000000-0000-4000-8000-000000000001','A','social21-a'),('20000000-0000-4000-8000-000000000002','B','social21-b');
insert into kw_workspace_members(workspace_id,user_id,role) values
('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','admin');
insert into kw_projects(id,workspace_id,app_key,name) values
('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','social','A'),
('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','social','B'),
('30000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001','work','Work');
insert into kw_social_platform_connections(id,workspace_id,project_id,platform,external_account_id,username,status,connected_at)
select id,workspace_id,id,'instagram','fixture','fixture','connected',now() from kw_projects where name in ('A','B') and id::text like '30000000-%';
do $$ begin
  begin
    insert into kw_social_platform_connections(workspace_id,project_id,platform,external_account_id,username,status,connected_at)
    values('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','facebook','id','fixture','connected',now());
    raise exception 'accepted workspace mismatch';
  exception when raise_exception then if sqlerrm!='Invalid Social project' then raise; end if; end;
  begin
    insert into kw_social_platform_connections(workspace_id,project_id,platform,external_account_id,username,status,connected_at)
    values('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000003','facebook','id','fixture','connected',now());
    raise exception 'accepted Work project';
  exception when raise_exception then if sqlerrm!='Invalid Social project' then raise; end if; end;
  assert not has_table_privilege('authenticated','kw_social_platform_credentials','select');
  assert not has_table_privilege('anon','kw_social_platform_connections','select');
  assert not has_table_privilege('authenticated','kw_social_platform_connections','insert');
  assert not has_function_privilege('authenticated','kw_rotate_social_platform_credential(uuid,bigint,integer,text)','execute');
end $$;
set local role service_role;
insert into kw_social_platform_credentials(connection_id,key_version,ciphertext) values
('30000000-0000-4000-8000-000000000001',1,repeat('a',24)||'.'||repeat('b',40));
do $$ begin
 assert kw_rotate_social_platform_credential('30000000-0000-4000-8000-000000000001',1,2,repeat('c',24)||'.'||repeat('d',40));
 assert not kw_rotate_social_platform_credential('30000000-0000-4000-8000-000000000001',1,2,repeat('c',24)||'.'||repeat('d',40));
end $$;
reset role;
set local role authenticated;
set local request.jwt.claim.sub='10000000-0000-4000-8000-000000000001';
do $$ begin
 assert (select count(*)=1 from kw_social_platform_connections);
 assert (select project_id='30000000-0000-4000-8000-000000000001' from kw_social_platform_connections);
end $$;
reset role;
update kw_workspace_members set role='member' where user_id='10000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ begin assert (select count(*)=0 from kw_social_platform_connections); end $$;
rollback;

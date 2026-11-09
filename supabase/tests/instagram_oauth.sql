-- Disposable local schema only. The existing platform test supplies the fixture pattern.
begin;
insert into auth.users(id,email) values('10000000-0000-4000-8000-000000000001','ig42@example.test');
insert into kw_workspaces(id,name,slug) values('20000000-0000-4000-8000-000000000001','Local IG','ig42-local');
insert into kw_workspace_members(workspace_id,user_id,role) values ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','owner');
insert into kw_projects(id,workspace_id,app_key,name) values ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','social','A'),('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','social','B');
set local role service_role;
do $$ declare
 p uuid:='30000000-0000-4000-8000-000000000001'; other uuid:='30000000-0000-4000-8000-000000000002';
 w uuid:='20000000-0000-4000-8000-000000000001'; u uuid:='10000000-0000-4000-8000-000000000001';
 sess uuid:=gen_random_uuid(); nonce uuid:=gen_random_uuid(); id uuid:=gen_random_uuid(); cipher text:=repeat('a',24)||'.'||repeat('b',40);
begin
 insert into kw_instagram_authorizations values(p,nonce,u,sess,now()+interval '10 minutes',true);
 begin perform kw_finish_instagram(other,w,u,sess,nonce,id,'123','fixture','{}',null,'biz','cfg',cipher);raise exception 'accepted wrong project';exception when raise_exception then if sqlerrm!='Invalid authorization' then raise;end if;end;
 begin perform kw_finish_instagram(p,w,u,gen_random_uuid(),nonce,id,'123','fixture','{}',null,'biz','cfg',cipher);raise exception 'accepted wrong session';exception when raise_exception then if sqlerrm!='Invalid authorization' then raise;end if;end;
 perform kw_finish_instagram(p,w,u,sess,nonce,id,'123','fixture','{}',null,'biz','cfg',cipher);
 begin perform kw_finish_instagram(p,w,u,sess,nonce,id,'123','fixture','{}',null,'biz','cfg',cipher);raise exception 'replay accepted';exception when raise_exception then if sqlerrm!='Invalid authorization' then raise;end if;end;
 assert exists(select from kw_social_platform_credentials where connection_id=id);
 begin perform kw_disconnect_instagram(other,w,u,id);raise exception 'cross-project disconnect';exception when raise_exception then if sqlerrm!='Unknown connection' then raise;end if;end;
 perform kw_disconnect_instagram(p,w,u,id);
 assert not exists(select from kw_social_platform_credentials where connection_id=id);
 assert not has_table_privilege('authenticated','kw_instagram_authorizations','select');
end $$;
rollback;

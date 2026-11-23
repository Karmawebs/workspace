begin;
select set_config('request.jwt.claim.sub',(select user_id::text from kw_workspace_members where role='owner' limit 1),true);
create temporary table calendar_fixture(ids uuid[]);
grant all on calendar_fixture to authenticated,service_role;
set local role service_role;
do $$
declare a public.kw_social_platform_connections; b public.kw_social_platform_connections; c public.kw_content_items; id1 uuid; id2 uuid; other_id uuid; new_connection uuid:=gen_random_uuid(); job uuid:=gen_random_uuid(); payload jsonb;
begin
 select * into strict a from public.kw_social_platform_connections where username='ribsfunde' and status='connected';
 payload:='{"id":"9999999999999990001","timestamp":"2026-11-01T18:00:00Z","caption":"Transactional fixture","media_type":"IMAGE"}';
 id1:=public.kw_import_instagram_media(a.id,payload);
 id2:=public.kw_import_instagram_media(a.id,payload||'{"caption":"Updated fixture"}');
 if id1<>id2 then raise exception 'Duplicate import'; end if;
 select * into strict b from public.kw_social_platform_connections where username='lasidreriahoznayo' and status='connected';
 other_id:=public.kw_import_instagram_media(b.id,payload);
 if other_id=id1 or (select project_id from public.kw_content_items where id=other_id)<>b.project_id then raise exception 'Cross-client import';end if;
 insert into public.kw_social_platform_connections(id,workspace_id,project_id,platform,external_account_id,username,status,connected_at)
 values(new_connection,a.workspace_id,a.project_id,'instagram','9999999999999980001','rollback-fixture','connected',now());
 if not exists(select 1 from public.kw_instagram_sync where connection_id=new_connection and last_success_at is null) then raise exception 'New connection not queued';end if;
 if (select metadata->'instagram'->>'caption' from public.kw_content_items where id=id1)<>'Updated fixture' then raise exception 'Refresh failed';end if;
 insert into public.kw_content_items(workspace_id,project_id,title,description,status,scheduled_at,content_type,channel)
 values(a.workspace_id,a.project_id,'Rollback only','Keep this copy','approved',now()+interval '3 days','post','instagram') returning * into c;
 insert into public.kw_instagram_publications(id,workspace_id,project_id,content_id,connection_id,external_account_id,username,format,state,scheduled_for,snapshot)
 values(job,a.workspace_id,a.project_id,c.id,a.id,a.external_account_id,a.username,'post','scheduled',c.scheduled_at,jsonb_build_object('version',c.updated_at,'caption',c.description,'files','[]'::jsonb));
 insert into calendar_fixture values(array[id1,c.id,job,a.id]);
end $$;
set local role authenticated;
do $$
declare ids uuid[]; c public.kw_content_items; j record; stamp timestamptz; denied boolean;
begin
 select f.ids into ids from calendar_fixture f;
 begin update public.kw_content_items set title='Forbidden' where id=ids[1]; raise exception 'Published write accepted';
 exception when raise_exception then if sqlerrm='Published write accepted' then raise;end if;end;
 select * into c from public.kw_content_items where id=ids[2];
 perform public.kw_move_social_content(c.id,c.updated_at,c.scheduled_at+interval '2 days',ids[3],0);
 select state,revision,scheduled_for into j from public.kw_instagram_publications where id=ids[3];
 if j.state<>'scheduled' or j.revision<>1 or j.scheduled_for<>c.scheduled_at+interval '2 days' then raise exception 'Job not rescheduled';end if;
 if (select description from public.kw_content_items where id=c.id)<>c.description then raise exception 'Copy changed';end if;
 denied:=false;
 begin perform public.kw_move_social_content(c.id,c.updated_at,now()+interval '6 days',ids[3],0); exception when raise_exception then denied:=true;end;
 if not denied then raise exception 'Stale revision accepted';end if;
 select updated_at into stamp from public.kw_content_items where id=c.id;
 denied:=false;
 begin perform public.kw_move_social_content(c.id,stamp,now()-interval '1 day',ids[3],1);exception when raise_exception then denied:=true;end;
 if not denied then raise exception 'Past schedule accepted';end if;
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 denied:=false;
 begin perform public.kw_move_social_content(c.id,stamp,now()+interval '6 days',ids[3],1);exception when raise_exception then denied:=true;end;
 if not denied then raise exception 'Nonmember accepted';end if;
 if exists(select 1 from public.kw_social_content_delivery where id=ids[1]) then raise exception 'Nonmember can read';end if;
end $$;
set local role service_role;
do $$
declare ids uuid[]; c public.kw_content_items; a public.kw_social_platform_connections; linked uuid;
begin
 select f.ids into ids from calendar_fixture f;
 update public.kw_instagram_publications set state='published',media_id='9999999999999990002',published_at=now() where id=ids[3];
 linked:=public.kw_import_instagram_media(ids[4],'{"id":"9999999999999990002","timestamp":"2026-11-01T18:00:00Z","caption":"Published locally","media_type":"IMAGE"}');
 if linked<>ids[2] then raise exception 'Local publication duplicated';end if;
end $$;
rollback;
select 'PASS import/update/dedup/local reconciliation, read-only, atomic reschedule, stale revision, past date, nonmember isolation; rolled back all fixtures' as result;

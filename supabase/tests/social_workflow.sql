-- Workspace only; every write is rolled back. No external requests.
begin;
select set_config('request.jwt.claim.sub',(select user_id::text from public.kw_workspace_members where role='owner' limit 1),true);
set local role authenticated;
do $$
declare ws uuid; cid uuid:=gen_random_uuid(); item public.kw_content_items; phase text; stamp timestamptz;
begin
 select workspace_id into ws from public.kw_workspace_members where user_id=auth.uid() limit 1;
 select * into item from public.kw_save_social_content(ws,cid,null,
 '{"title":"Phase 2 rollback","content_type":"carousel","status":"review","channel":"instagram_facebook","description":"Copy","internal_notes":"Private notes","client_approved":true,"scheduled_at":"2026-11-02T19:00:00Z"}',array[]::uuid[]);
 if item.channel<>'instagram_facebook' or item.internal_notes<>'Private notes' or not item.client_approved or item.status<>'review' or item.scheduled_at<>'2026-11-02T19:00:00Z'::timestamptz then raise exception 'New fields not saved'; end if;
 -- Old Phase 1 payloads must not wipe Phase 2 fields or legacy URLs.
 update public.kw_content_items set file_urls='["https://example.invalid/legacy.jpg"]' where id=cid;
 select * into item from public.kw_content_items where id=cid;
 select * into item from public.kw_save_social_content(ws,cid,item.updated_at,'{"title":"Legacy client","status":"draft"}',array[]::uuid[]);
 if item.internal_notes<>'Private notes' or not item.client_approved or item.channel<>'instagram_facebook' or item.file_urls<>'["https://example.invalid/legacy.jpg"]'::jsonb then raise exception 'Legacy payload erased fields'; end if;
 foreach phase in array array['idea','draft','review','approved','scheduled','published','discarded'] loop
 stamp:=item.updated_at;
 select * into item from public.kw_save_social_content(ws,cid,stamp,jsonb_build_object('title','Workflow','status',phase,'client_approved',false),array[]::uuid[]);
 if item.status<>phase or item.client_approved or item.published_at is not null then raise exception 'Manual workflow altered approval or external publication timestamp'; end if;
 end loop;
 begin
 perform public.kw_save_social_content(ws,cid,item.updated_at,'{"title":"Invalid","status":"invalid"}',array[]::uuid[]);
 raise exception 'Invalid state accepted';
 exception when check_violation then null; end;
 perform set_config('request.jwt.claim.sub','f5ca0000-0000-4000-8000-000000000009',true);
 if exists(select 1 from public.kw_content_items where id=cid) then raise exception 'Nonmember read'; end if;
 begin
 perform public.kw_save_social_content(ws,cid,item.updated_at,'{"title":"Forbidden","internal_notes":"Changed"}',array[]::uuid[]);
 raise exception 'Nonmember write';
 exception when raise_exception then if sqlerrm<>'Sin acceso al workspace.' then raise; end if; end;
end $$;
rollback;
select 'PASS Phase 2 fields, legacy payload, seven manual states, independent approval, no external publication, status validation and workspace isolation' as result;

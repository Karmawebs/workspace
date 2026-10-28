-- Run on Workspace only. Real binary/TUS and cross-workspace tests are in scripts/verify-social-media.mjs.
-- This transaction rolls back all fixture writes.
begin;
select set_config('request.jwt.claim.sub',(select user_id::text from public.kw_workspace_members where role='owner' limit 1),true);
set local role authenticated;
do $$
declare ws uuid; fid uuid:=gen_random_uuid(); cid uuid:=gen_random_uuid(); item public.kw_content_items;
begin
 select workspace_id into ws from public.kw_workspace_members where user_id=auth.uid() limit 1;
 insert into public.kw_content_files(id,workspace_id,storage_path,original_filename,mime_type,size)
 values(fid,ws,ws||'/'||fid||'/original.jpg','Phase 1 rollback test.jpg','image/jpeg',100);
 begin
 perform public.kw_save_social_content(ws,cid,null,'{"title":"Incomplete"}',array[fid]);
 raise exception 'Incomplete upload accepted';
 exception when raise_exception then if sqlerrm not like 'El archivo no ha terminado%' then raise; end if; end;
 if exists(select 1 from public.kw_content_items where id=cid) then raise exception 'Partial save persisted'; end if;
 select * into item from public.kw_save_social_content(ws,cid,null,'{"title":"No files"}',array[]::uuid[]);
 update public.kw_content_items set file_urls='["https://example.invalid/legacy.jpg"]' where id=cid;
 select * into item from public.kw_save_social_content(ws,cid,item.updated_at,'{"title":"Edited"}',array[]::uuid[]);
 if item.file_urls<>'["https://example.invalid/legacy.jpg"]'::jsonb then raise exception 'Legacy URLs lost'; end if;
 begin
 perform public.kw_save_social_content(ws,cid,'2000-01-01','{"title":"Stale"}',array[]::uuid[]);
 raise exception 'Stale save accepted';
 exception when raise_exception then if sqlerrm not like 'El registro cambió%' then raise; end if; end;
 begin
 update public.kw_content_files set storage_path='invalid' where id=fid;
 raise exception 'Identity rewrite accepted';
 exception when insufficient_privilege then null; end;
 delete from public.kw_content_files where id=fid;
 if not exists(select 1 from public.kw_social_storage_cleanup where storage_path=ws||'/'||fid||'/original.jpg') then raise exception 'Cleanup intent missing'; end if;
 perform set_config('request.jwt.claim.sub','f5ca0000-0000-4000-8000-000000000009',true);
 if exists(select 1 from public.kw_content_files) or exists(select 1 from public.kw_social_storage_cleanup) or exists(select 1 from storage.objects where bucket_id='social-media') then raise exception 'Nonmember can read'; end if;
 begin
 perform public.kw_save_social_content(ws,gen_random_uuid(),null,'{"title":"Forbidden"}',array[]::uuid[]);
 raise exception 'Nonmember can write';
 exception when raise_exception then if sqlerrm<>'Sin acceso al workspace.' then raise; end if; end;
end $$;
rollback;
select 'PASS atomic save, incomplete-upload rollback, legacy URLs, concurrency, immutable paths, cleanup outbox and nonmember denial' as result;

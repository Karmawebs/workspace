create or replace function public.kw_import_instagram_media(p_connection uuid,p_media jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare a public.kw_social_platform_connections; c public.kw_content_items; item_id uuid; stamp timestamptz; fmt text;
begin
 select * into strict a from public.kw_social_platform_connections where id=p_connection and platform='instagram' and status='connected' for share;
 if coalesce(p_media->>'id','') !~ '^[0-9]+$' then raise exception 'Invalid media'; end if;
 stamp:=(p_media->>'timestamp')::timestamptz;
 if stamp is null or not isfinite(stamp) then raise exception 'Invalid timestamp'; end if;
 perform pg_advisory_xact_lock(hashtextextended(a.project_id::text||a.external_account_id,0));
 select content_id into item_id from public.kw_instagram_publications
 where workspace_id=a.workspace_id and project_id=a.project_id and external_account_id=a.external_account_id and media_id=p_media->>'id' limit 1;
 if item_id is null then
 select id into item_id from public.kw_content_items where workspace_id=a.workspace_id and project_id=a.project_id
 and metadata->'instagram'->>'account_id'=a.external_account_id and metadata->'instagram'->>'id'=p_media->>'id';
 end if;
 -- A dispatched request with a lost response has no official ID to reconcile.
 -- Defer these new media rather than guessing from captions and creating duplicates.
 if item_id is null and exists(select 1 from public.kw_instagram_publications
 where workspace_id=a.workspace_id and project_id=a.project_id and external_account_id=a.external_account_id
 and send_started and media_id is null and stamp>=coalesce(started_at,created_at)-interval '5 minutes' for share)
 then raise exception 'PUBLICATION_UNCONFIRMED'; end if;
 fmt:=case when p_media->>'media_type'='CAROUSEL_ALBUM' then 'carousel' when p_media->>'media_product_type'='REELS' then 'reel' when p_media->>'media_product_type'='STORY' then 'story' else 'post' end;
 if item_id is null then
 insert into public.kw_content_items(workspace_id,project_id,title,description,content_type,channel,status,scheduled_at,published_at,metadata)
 values(a.workspace_id,a.project_id,coalesce(nullif(left(p_media->>'caption',90),''),'Publicación de @'||a.username),coalesce(p_media->>'caption',''),fmt,'instagram','published',stamp,stamp,
 jsonb_build_object('origin','instagram','instagram',p_media||jsonb_build_object('account_id',a.external_account_id))) returning id into item_id;
 else
 -- Service-only refresh, never delete history and never replace local originals.
 perform set_config('kw.instagram_sync','on',true);
 update public.kw_content_items set metadata=metadata||jsonb_build_object('instagram',coalesce(metadata->'instagram','{}')||p_media||jsonb_build_object('account_id',a.external_account_id)),
 published_at=stamp where id=item_id;
 perform set_config('kw.instagram_sync','off',true);
 end if;
 return item_id;
end $$;

-- Workspace is currently on Free: global Storage cap is fixed at 50 MiB.
-- Keep the bucket honest. After upgrading the plan, raise this one bucket setting (up to 2 GiB).
update storage.buckets set file_size_limit=52428800 where id='social-media';
create function kw_private.social_upload_limit() returns bigint
language sql stable security definer set search_path='' as $$
 select case when auth.uid() is not null then least(file_size_limit,2147483648::bigint) else null end
 from storage.buckets where id='social-media' and public=false;
$$;
revoke all on function kw_private.social_upload_limit() from public,anon;
grant execute on function kw_private.social_upload_limit() to authenticated;
create function public.kw_social_upload_limit() returns bigint
language sql stable security invoker set search_path='' as $$
 select kw_private.social_upload_limit();
$$;
revoke all on function public.kw_social_upload_limit() from public,anon;
grant execute on function public.kw_social_upload_limit() to authenticated;

-- Run only after rolling back the frontend. Preserve any accounts linked in later stages.
begin;
lock table public.kw_social_platform_connections in access exclusive mode;
do $$ begin
  if exists(select from public.kw_social_platform_connections) then
    raise exception 'Rollback requires an empty connection registry';
  end if;
end $$;
drop function public.kw_rotate_social_platform_credential(uuid,bigint,integer,text);
drop table public.kw_social_platform_credentials;
drop table public.kw_social_platform_connections;
drop function kw_private.guard_social_platform_connection();
commit;

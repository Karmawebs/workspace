-- Remove inherited default grants; clients can only attach/reorder, not rewrite identity or future archive fields.
revoke all on public.kw_content_files,public.kw_social_storage_cleanup from authenticated;
grant select,insert,delete on public.kw_content_files to authenticated;
grant update(content_id,sort_order) on public.kw_content_files to authenticated;
grant select,delete on public.kw_social_storage_cleanup to authenticated;
grant all on public.kw_content_files,public.kw_social_storage_cleanup to service_role;

create function kw_private.social_content_workspace_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.workspace_id is distinct from old.workspace_id and exists(select 1 from public.kw_content_files where content_id=old.id) then
 raise exception 'No se puede trasladar un contenido con archivos a otro workspace.';
 end if;
 return new;
end $$;
revoke all on function kw_private.social_content_workspace_guard() from public,anon,authenticated;
create trigger social_content_workspace_guard before update of workspace_id on public.kw_content_items for each row execute function kw_private.social_content_workspace_guard();

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
-- Generated only inside the database. Never exported to frontend, migrations, logs, or tool output.
do $$ begin
 if not exists(select 1 from vault.secrets where name='kw_social_cleanup_token') then
 perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'kw_social_cleanup_token','Private Social cleanup scheduler authentication');
 end if;
end $$;
create function public.kw_social_cleanup_authorized(p_token text) returns boolean
language sql stable security definer set search_path='' as $$
 select p_token is not null and length(p_token)=64 and exists(
 select 1 from vault.decrypted_secrets where name='kw_social_cleanup_token' and decrypted_secret=p_token);
$$;
revoke all on function public.kw_social_cleanup_authorized(text) from public,anon,authenticated;
grant execute on function public.kw_social_cleanup_authorized(text) to service_role;
select cron.schedule('kw-social-storage-cleanup','*/15 * * * *', $job$
 select net.http_post(
 url:='https://wrkoskqfjuefgrwhymqu.supabase.co/functions/v1/social-media-cleanup',
 headers:=jsonb_build_object('Content-Type','application/json','x-social-cleanup-token',
 (select decrypted_secret from vault.decrypted_secrets where name='kw_social_cleanup_token')),
 body:='{}'::jsonb, timeout_milliseconds:=10000);
$job$);

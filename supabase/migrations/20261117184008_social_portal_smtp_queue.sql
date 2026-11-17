-- Reuse the private outbox; no changes to identities, invitations or RLS.
alter table public.kw_portal_mail
 add column sent_at timestamptz,
 add column smtp_message_id text,
 add column last_error_code text;

-- Only additional fields actually exposed in the portal produce modifications.
-- Notes, assignments, approval bookkeeping and internal states do not send mail.
create function kw_private.portal_visible_content_event() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if (old.title,old.scheduled_at) is distinct from (new.title,new.scheduled_at) then
  perform kw_private.portal_enqueue(new.id,'modified',txid_current()::text);
 end if;
 return new;
end $$;
revoke all on function kw_private.portal_visible_content_event() from public,anon,authenticated;
create trigger kw_portal_visible_content_event after update of title,scheduled_at on public.kw_content_items
 for each row execute function kw_private.portal_visible_content_event();

-- Schedule/publish messages describe real confirmed delivery events, not the
-- editor's internal status or processing/retry transitions.
create or replace function kw_private.portal_delivery_event() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if not new.superseded and new.state in ('scheduled','published') and
 (tg_op='INSERT' or old.state is distinct from new.state or old.scheduled_for is distinct from new.scheduled_for) then
  perform kw_private.portal_enqueue(new.content_id,new.state,new.id::text||':'||coalesce(new.scheduled_for::text,''));
 end if;
 return new;
end $$;

-- SMTP has no provider idempotency API. An uncertain post-DATA delivery is held
-- for manual investigation, never automatically resent. A stale pre-SMTP claim
-- remains recoverable. Existing sent/skipped/failed messages are not replayed.
select cron.schedule('kw-portal-notifications','*/5 * * * *',$job$
 update public.kw_portal_mail set state='unknown',last_error_code='dispatch_interrupted'
 where state='dispatching' and due_at<=now();
 select net.http_post(url:='https://wrkoskqfjuefgrwhymqu.supabase.co/functions/v1/social-client-portal',
 body:=jsonb_build_object('action','deliver','id',id,'ticket',ticket),timeout_milliseconds:=60000)
 from public.kw_portal_mail where state in ('pending','sending') and due_at<=now() order by due_at limit 25;
$job$);

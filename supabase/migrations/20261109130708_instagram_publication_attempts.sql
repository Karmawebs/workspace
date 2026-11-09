create table public.kw_instagram_publications (
  id uuid primary key,
  workspace_id uuid not null references public.kw_workspaces on delete cascade,
  project_id uuid not null references public.kw_projects on delete cascade,
  content_id uuid not null references public.kw_content_items on delete cascade,
  connection_id uuid not null,
  external_account_id text not null,
  username text not null,
  format text not null check (format in ('post','carousel','story','reel')),
  state text not null default 'publishing' check (state in ('publishing','published','error')),
  snapshot jsonb not null,
  containers jsonb not null default '[]',
  root_id text,
  send_started boolean not null default false,
  lease_until timestamptz not null default '-infinity',
  revision integer not null default 0,
  error_message text,
  published_at timestamptz,
  media_id text,
  permalink text,
  created_at timestamptz not null default now(),
  check (state <> 'published' or published_at is not null)
);
-- A failed pre-publication attempt is retryable. An ambiguous send stays locked.
create unique index kw_instagram_content_once on public.kw_instagram_publications(content_id)
where state <> 'error' or send_started;
create index kw_instagram_publication_history on public.kw_instagram_publications(content_id,created_at desc);
alter table public.kw_instagram_publications enable row level security;
revoke all on public.kw_instagram_publications from public,anon,authenticated;
grant select(id,workspace_id,project_id,content_id,username,format,state,error_message,published_at,media_id,permalink,created_at,send_started) on public.kw_instagram_publications to authenticated;
grant select,insert,update on public.kw_instagram_publications to service_role;
create policy publication_reader on public.kw_instagram_publications for select to authenticated using (
 public.kw_is_workspace_member(workspace_id) and exists (select 1 from public.kw_content_items c where c.id=content_id and c.workspace_id=kw_instagram_publications.workspace_id and c.project_id=kw_instagram_publications.project_id)
);

create view public.kw_social_content_delivery with (security_invoker=true) as
select c.*,p.state as publication_state,p.published_at as instagram_published_at,
 p.permalink,p.error_message as publication_error,p.send_started,coalesce(p.published_at,c.scheduled_at) as calendar_at
from public.kw_content_items c left join lateral (
 select state,published_at,permalink,error_message,send_started from public.kw_instagram_publications
 where content_id=c.id and workspace_id=c.workspace_id and project_id=c.project_id order by created_at desc limit 1
) p on true;
revoke all on public.kw_social_content_delivery from public,anon,authenticated;
grant select on public.kw_social_content_delivery to authenticated;

-- Resume only attempts previously confirmed in the editor, even after the tab closes.
alter table public.kw_instagram_publications add column worker_ticket uuid not null default gen_random_uuid();
select cron.schedule('kw-instagram-resume-confirmed','* * * * *',$job$
 select net.http_post(url:='https://wrkoskqfjuefgrwhymqu.supabase.co/functions/v1/social-instagram-publish',
 body:=jsonb_build_object('action','resume','attemptId',id,'ticket',worker_ticket),timeout_milliseconds:=5000)
 from public.kw_instagram_publications where state='publishing' and lease_until < now()
 order by lease_until limit 10;
$job$);

create function kw_private.guard_instagram_attempt() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 perform 1 from public.kw_content_items c where c.id=new.content_id and c.workspace_id=new.workspace_id
 and c.project_id=new.project_id and c.channel='instagram' and c.content_type=new.format
 and c.updated_at=(new.snapshot->>'version')::timestamptz for share;
 if not found then raise exception 'Stale content'; end if;
 perform 1 from public.kw_social_platform_connections a where a.id=new.connection_id
 and a.project_id=new.project_id and a.workspace_id=new.workspace_id and a.platform='instagram'
 and a.external_account_id=new.external_account_id and a.status='connected' for share;
 if not found then raise exception 'Invalid account scope'; end if;
 return new;
end $$;
create trigger guard_instagram_attempt before insert on public.kw_instagram_publications
for each row execute function kw_private.guard_instagram_attempt();

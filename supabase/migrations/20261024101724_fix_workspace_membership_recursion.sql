-- Break recursive membership RLS without changing who belongs to a workspace.
-- Private helpers only inspect the authenticated caller, never an arbitrary user.
create schema if not exists kw_private;
revoke all on schema kw_private from public, anon;
grant usage on schema kw_private to authenticated;

create or replace function kw_private.is_workspace_member(ws uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.kw_workspace_members m
    where m.workspace_id = ws and m.user_id = (select auth.uid())
  );
$$;
create or replace function kw_private.is_workspace_admin(ws uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.kw_workspace_members m
    where m.workspace_id = ws and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin')
  );
$$;
revoke all on function kw_private.is_workspace_member(uuid) from public, anon;
revoke all on function kw_private.is_workspace_admin(uuid) from public, anon;
grant execute on function kw_private.is_workspace_member(uuid) to authenticated;
grant execute on function kw_private.is_workspace_admin(uuid) to authenticated;

create or replace function public.kw_is_workspace_member(ws uuid)
returns boolean language sql stable security invoker set search_path = ''
as $$
  select case when (select auth.uid()) is null then false
    else kw_private.is_workspace_member(ws) end;
$$;
create or replace function public.kw_is_workspace_admin(ws uuid)
returns boolean language sql stable security invoker set search_path = ''
as $$
  select case when (select auth.uid()) is null then false
    else kw_private.is_workspace_admin(ws) end;
$$;

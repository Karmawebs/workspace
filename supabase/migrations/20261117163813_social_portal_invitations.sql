-- Additive: existing identities, passwords, sessions and editorial data stay valid.
alter table public.kw_portal_access
 add column creation_request uuid unique,
 add column invitation_request uuid,
 add column invitation_state text not null default 'none' check (invitation_state in ('none','sending','sent','failed','unconfigured','unknown')),
 add column invitation_at timestamptz,
 add column invitation_sent_at timestamptz;

create or replace function kw_private.portal_provision() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.role='kw_portal_client' and new.raw_app_meta_data->>'portal'='social' and not exists(select from public.kw_portal_access where user_id=new.id) then
  if not exists(select 1 from public.kw_projects where id=(new.raw_app_meta_data->>'project')::uuid and app_key='social') then raise exception 'Invalid portal assignment';end if;
  insert into public.kw_portal_access(user_id,project_id,name,contact_email,login_email,creation_request)
  values(new.id,(new.raw_app_meta_data->>'project')::uuid,new.raw_app_meta_data->>'name',lower(trim(new.raw_app_meta_data->>'contact')),lower(new.email),(new.raw_app_meta_data->>'creation_request')::uuid);
 end if;
 return new;
end $$;
-- Project binding is immutable; clients cannot become staff by adding membership.
create function kw_private.portal_binding_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if (new.user_id,new.project_id,new.login_email,new.creation_request) is distinct from (old.user_id,old.project_id,old.login_email,old.creation_request) then raise exception 'Portal identity binding is immutable';end if;
 return new;
end $$;
create trigger kw_portal_binding_guard before update on public.kw_portal_access for each row execute function kw_private.portal_binding_guard();
revoke all on function kw_private.portal_binding_guard() from public,anon,authenticated;

-- A row lock serializes invitation requests; identical retries never send twice.
-- An ambiguous SMTP delivery is never retried automatically. An operator can
-- explicitly resend with a NEW request after the five-minute claim window.
create function public.kw_portal_claim_invitation(p_user uuid,p_project uuid,p_request uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare a public.kw_portal_access;
begin
 if p_request is null then raise exception 'Request required';end if;
 select * into strict a from public.kw_portal_access where user_id=p_user and project_id=p_project for update;
 if not a.active or a.invitation_request=p_request or a.invitation_at>clock_timestamp()-interval '5 minutes' then return false;end if;
 update public.kw_portal_access set invitation_request=p_request,invitation_state='sending',invitation_at=clock_timestamp() where user_id=p_user;
 return true;
end $$;
revoke all on function public.kw_portal_claim_invitation(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.kw_portal_claim_invitation(uuid,uuid,uuid) to service_role;

-- getUser verifies the JWT; additionally reject revoked administrative sessions.
create function public.kw_portal_admin_session(p_user uuid,p_session uuid,p_project uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.sessions s join auth.users u on u.id=s.user_id
 join public.kw_workspace_members m on m.user_id=u.id
 join public.kw_projects p on p.workspace_id=m.workspace_id
 where s.id=p_session and s.user_id=p_user and u.role='authenticated'
 and m.role in ('owner','admin') and p.id=p_project and p.app_key='social');
$$;
revoke all on function public.kw_portal_admin_session(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.kw_portal_admin_session(uuid,uuid,uuid) to service_role;

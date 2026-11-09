-- Run inside a rolled-back transaction after installing the portal migration.
do $$
declare p uuid;other uuid;entry uuid:=gen_random_uuid(); v text:=gen_random_uuid()::text;sid uuid;
begin
select id into strict p from kw_projects where app_key='social' order by id limit 1;
select id into strict other from kw_projects where app_key='social' and id<>p limit 1;
perform kw_portal_credential('create',p,entry,'QA',jsonb_build_object('password',v),false);
select secret_id into strict sid from kw_portal_credentials where id=entry;
if (select secret from vault.secrets where id=sid) like '%'||v||'%' then raise exception 'Plaintext in Vault';end if;
begin perform kw_portal_credential('client-reveal',p,entry);raise exception 'Hidden credential exposed' using errcode='XX001';exception when raise_exception then null;end;
begin perform kw_portal_credential('reveal',other,entry);raise exception 'Cross project reveal';exception when no_data_found then null;end;
perform kw_portal_credential('update',p,entry,'QA',jsonb_build_object('password',v||'2'),true);
if kw_portal_credential('client-reveal',p,entry)->>'password' is distinct from v||'2' then raise exception 'Roundtrip failed';end if;
perform kw_portal_credential('delete',p,entry);
if exists(select from vault.secrets where id=sid) then raise exception 'Orphan secret';end if;
if has_function_privilege('authenticated','kw_portal_credential(text,uuid,uuid,text,jsonb,boolean)','execute') then raise exception 'RPC exposed';end if;
end $$;

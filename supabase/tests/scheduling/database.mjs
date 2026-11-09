// Standalone isolated PostgreSQL test. PGLITE_MODULE optionally points to a local installation.
import { readFileSync, readdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
const { PGlite } = await import(
  process.env.PGLITE_MODULE || "@electric-sql/pglite"
);
const dir = mkdtempSync(join(tmpdir(), "kw-scheduling-"));
let pg = new PGlite(dir);
const sql = (name) =>
  readFileSync(
    "supabase/migrations/" +
      readdirSync("supabase/migrations").find((f) => f.endsWith(name)),
    "utf8",
  );
const query = (s, args = []) => pg.query(s, args);
const one = async (s, args) => (await query(s, args)).rows[0];
try {
  await pg.exec(`create role anon;create role authenticated;create role service_role bypassrls;
create schema kw_private;create schema auth;create schema cron;create function cron.schedule(text,text,text) returns int language sql as 'select 1';
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table kw_workspaces(id uuid primary key);
create table kw_projects(id uuid primary key,workspace_id uuid,app_key text,name text);
create table kw_workspace_members(workspace_id uuid,user_id uuid,role text);
create function kw_is_workspace_member(uuid) returns boolean language sql security definer as $$select exists(select 1 from public.kw_workspace_members where workspace_id=$1 and user_id=auth.uid())$$;
create table kw_content_items(id uuid primary key,workspace_id uuid,title text,project_id uuid,status text default 'idea',updated_at timestamptz default now(),description text,content_type text,channel text,scheduled_at timestamptz);
create table kw_content_files(id uuid primary key,workspace_id uuid,content_id uuid,sort_order int,storage_path text,mime_type text,size bigint,created_at timestamptz default now(),created_by uuid);
create table kw_social_platform_connections(id uuid,workspace_id uuid,project_id uuid,external_account_id text,username text,status text,platform text,authorized_scopes text[],expires_at timestamptz);
grant select on kw_content_items,kw_projects to authenticated;
alter table kw_content_items enable row level security;
create policy member_read on kw_content_items for select to authenticated using (kw_is_workspace_member(workspace_id));`);
  await pg.exec(sql("social_workflow_phase2.sql"));
  await pg.exec(sql("instagram_publication_attempts.sql"));
  const [w, p, actor, c, f, a, other, legacy] = Array.from({ length: 8 }, () =>
    crypto.randomUUID(),
  );
  await query("insert into kw_workspaces values ($1)", [w]);
  await query("insert into kw_projects values($1,$2,'social','Proyecto')", [
    p,
    w,
  ]);
  await query("insert into kw_workspace_members values($1,$2,'admin')", [
    w,
    actor,
  ]);
  await query(
    "insert into kw_social_platform_connections values($1,$2,$3,'123','fixture','connected','instagram',array['instagram_content_publish'],null)",
    [a, w, p],
  );
  await query(
    "insert into kw_content_items(id,project_id,workspace_id,status,scheduled_at,title) values($1,$2,$3,'scheduled',now()-interval '1 day','Legacy')",
    [legacy, p, w],
  );
  await pg.exec(sql("instagram_confirmed_schedule.sql"));
  const read = () =>
    one("select * from kw_social_content_delivery where id=$1", [c]);
  assert.equal(
    (
      await one(
        "select main_state from kw_social_content_delivery where id=$1",
        [legacy],
      )
    ).main_state,
    "draft",
  );
  const values = {
    title: "Borrador",
    description: "Copy",
    content_type: "post",
    channel: "instagram",
    project_id: p,
  };
  await query("select set_config('request.jwt.claim.sub',$1,false)", [actor]);
  await query(
    "select * from kw_save_social_content($1,$2,null,$3,array[]::uuid[])",
    [w, c, { ...values, status: "draft" }],
  );
  assert.equal((await read()).main_state, "draft");
  await query(
    "insert into kw_content_files(id,workspace_id,created_by,mime_type,size,storage_path) values($1,$2,$3,'image/jpeg',1024,'fixture')",
    [f, w, actor],
  );
  const version = async () =>
    (
      await one(
        "select updated_at::text as v from kw_content_items where id=$1",
        [c],
      )
    ).v;
  await query("select * from kw_save_social_content($1,$2,$3,$4,$5)", [
    w,
    c,
    await version(),
    { ...values, status: "approved" },
    [f],
  ]);
  assert.equal((await read()).main_state, "ready");
  const scheduleSQL =
    "select * from kw_schedule_instagram($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)";
  const job = crypto.randomUUID();
  const params = async (due, request, existing, rev) => [
    w,
    p,
    actor,
    c,
    await version(),
    values,
    [f],
    a,
    due,
    request,
    existing,
    rev,
  ];
  const time = (n) => new Date(Date.now() + n * 60000).toISOString();
  const initial = await params(time(30), job, null, null);
  await assert.rejects(
    query(
      scheduleSQL,
      initial.map((v, i) => (i === 2 ? other : v)),
    ),
  );
  await assert.rejects(
    query(
      scheduleSQL,
      initial.map((v, i) => (i === 8 ? time(-1) : v)),
    ),
  );
  await query(scheduleSQL, initial);
  await query(scheduleSQL, initial);
  assert.equal((await read()).main_state, "scheduled");
  assert.equal(
    (await one("select count(*)::int n from kw_instagram_publications")).n,
    1,
  );
  await assert.rejects(
    query("update kw_content_items set title='conflict' where id=$1", [c]),
  );
  await assert.rejects(query("delete from kw_content_files where id=$1", [f]));
  const updated = await params(time(100), crypto.randomUUID(), job, 0);
  updated[5] = { ...values, description: "Copy editado" };
  await query(scheduleSQL, updated);
  assert.equal((await read()).description, "Copy editado");
  assert.equal(new Date((await read()).calendar_at).toISOString(), updated[8]);
  await assert.rejects(
    query(scheduleSQL, await params(time(60), crypto.randomUUID(), job, 0)),
  );
  await query(
    "update kw_instagram_publications set state='cancelled' where id=$1 and state='scheduled' and revision=1",
    [job],
  );
  assert.equal((await read()).main_state, "cancelled");
  assert.equal(
    (await one("select count(*)::int n from kw_content_files")).n,
    1,
  );
  await query("select kw_private.start_due_instagram()");
  assert.equal((await read()).main_state, "cancelled");
  const next = crypto.randomUUID();
  await query(scheduleSQL, await params(time(1), next, null, null));
  assert.deepEqual((await query("select event from kw_instagram_schedule_events where attempt_id=$1 order by id",[job])).rows.map(r=>r.event),["scheduled","rescheduled","cancelled"]);
  await pg.close();
  pg = new PGlite(dir);
  assert.equal((await read()).main_state, "scheduled");
  await query("select kw_private.start_due_instagram()");
  assert.equal((await read()).main_state, "scheduled");
  await query(
    "update kw_instagram_publications set scheduled_for=now()-interval '1 minute' where id=$1",
    [next],
  );
  await query("select kw_private.start_due_instagram()");
  await query("select kw_private.start_due_instagram()");
  assert.equal((await read()).main_state, "publishing");
  assert.equal(
    (
      await query(
        "update kw_instagram_publications set state='cancelled' where id=$1 and state='scheduled' returning id",
        [next],
      )
    ).rows.length,
    0,
  );
  await query(
    "update kw_instagram_publications set state='error',error_message='formato' where id=$1",
    [next],
  );
  assert.equal((await read()).main_state, "error");
  const retry = crypto.randomUUID();
  await query(scheduleSQL, await params(time(5), retry, null, null));
  await query(
    "update kw_instagram_publications set state='published',send_started=true,media_id='123',published_at=now() where id=$1",
    [retry],
  );
  assert.equal((await read()).main_state, "published");
  await assert.rejects(
    query(scheduleSQL, await params(time(10), crypto.randomUUID(), null, null)),
  );
  await pg.exec("set role authenticated");
  await query("select set_config('request.jwt.claim.sub',$1,false)", [other]);
  assert.equal(
    (await query("select * from kw_social_content_delivery")).rows.length,
    0,
  );
  await assert.rejects(query(scheduleSQL, initial));
  await assert.rejects(
    query("select worker_ticket from kw_instagram_publications"),
  );
  console.log(
    "PASS legacy preservation, draft, ready, schedule, replay, edit, reschedule, stale revision, cancellation, media retention, restart, due claim, delivery error, retry, confirmed publication, duplicate prevention, RLS",
  );
} finally {
  await pg.close();
  rmSync(dir, { recursive: true, force: true });
}

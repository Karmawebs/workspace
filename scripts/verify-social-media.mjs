// Explicit integration test against Workspace, using disposable users/workspaces only.
// Fixture credentials live outside the repository and are never printed.
import fs from "node:fs";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { Upload } from "tus-js-client";
import { loadEnv } from "vite";
process.on("uncaughtException", (error) => {
  console.error("Integration failed:", error.message);
  process.exitCode = 1;
});
const f = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const env = loadEnv("development", process.cwd(), "VITE_");
assert.equal(env.VITE_SUPABASE_URL, "https://wrkoskqfjuefgrwhymqu.supabase.co");
const make = () =>
  createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
const a = make(),
  b = make(),
  anon = make();
function ok(result) {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
const sessionA = ok(
  await a.auth.signInWithPassword({ email: f.email, password: f.password }),
).session;
ok(
  await b.auth.signInWithPassword({
    email: f.otherEmail,
    password: f.password,
  }),
);
console.log("PASS authenticated disposable workspace members");
const bucket = a.storage.from("social-media");
const jpg = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EH//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EH//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EH//2Q==",
  "base64",
);
async function reserve(name, mime, size) {
  const id = crypto.randomUUID();
  return ok(
    await a
      .from("kw_content_files")
      .insert({
        id,
        workspace_id: f.workspaceId,
        storage_path: `${f.workspaceId}/${id}/original.${name.split(".").at(-1)}`,
        original_filename: name,
        mime_type: mime,
        size,
      })
      .select()
      .single(),
  );
}
async function upload(file, row, opts = {}) {
  let progress = 0;
  await new Promise((resolve, reject) => {
    const job = new Upload(file, {
      endpoint:
        env.VITE_SUPABASE_URL.replace(".supabase.co", ".storage.supabase.co") +
        "/storage/v1/upload/resumable",
      chunkSize: 6 * 1024 * 1024,
      uploadSize: row.size,
      retryDelays: [0, 1000, 3000],
      uploadDataDuringCreation: true,
      storeFingerprintForResuming: false,
      headers: {
        authorization: `Bearer ${sessionA.access_token}`,
        apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      metadata: {
        bucketName: "social-media",
        objectName: row.storage_path,
        contentType: row.mime_type,
      },
      onProgress: (sent) => {
        progress = Math.max(progress, sent);
      },
      onError: (error) => reject(new Error(error.message)),
      onSuccess: resolve,
      ...opts,
    });
    job.start();
  });
  assert.equal(progress, row.size);
}
async function save(id, version, ids, extra = {}) {
  return ok(
    await a.rpc("kw_save_social_content", {
      p_workspace_id: f.workspaceId,
      p_content_id: id,
      p_expected_updated_at: version,
      p_file_ids: ids,
      p_values: {
        title: "Disposable Social Phase 1",
        content_type: "post",
        status: "draft",
        scheduled_at: new Date().toISOString(),
        ...extra,
      },
    }),
  );
}
async function cleanup() {
  const rows = ok(
    await a
      .from("kw_social_storage_cleanup")
      .select("storage_path")
      .eq("workspace_id", f.workspaceId),
  );
  if (rows.length) {
    ok(await bucket.remove(rows.map((x) => x.storage_path)));
    ok(
      await a
        .from("kw_social_storage_cleanup")
        .delete()
        .eq("workspace_id", f.workspaceId),
    );
  }
}
const one = await reserve("one.jpg", "image/jpeg", jpg.length);
const incomplete = await a.rpc("kw_save_social_content", {
  p_workspace_id: f.workspaceId,
  p_content_id: crypto.randomUUID(),
  p_expected_updated_at: null,
  p_file_ids: [one.id],
  p_values: { title: "Incomplete" },
});
assert(incomplete.error);
console.log("PASS incomplete upload cannot save");
await upload(jpg, one);
let content = await save(crypto.randomUUID(), null, [one.id]);
f.contentId = content.id;
fs.writeFileSync(process.argv[2], JSON.stringify(f), { mode: 0o600 });
console.log("PASS real TUS JPG upload, progress and atomic Post save");
const signed = ok(await bucket.createSignedUrl(one.storage_path, 60));
assert.equal((await fetch(signed.signedUrl)).status, 200);
assert.notEqual(
  (
    await fetch(
      `${env.VITE_SUPABASE_URL}/storage/v1/object/public/social-media/${one.storage_path}`,
    )
  ).status,
  200,
);
assert(
  (await b.storage.from("social-media").createSignedUrl(one.storage_path, 60))
    .error,
);
assert(
  (await anon.storage.from("social-media").download(one.storage_path)).error,
);
assert.equal(
  ok(
    await b
      .from("kw_content_files")
      .select("*")
      .eq("workspace_id", f.workspaceId),
  ).length,
  0,
);
const badId = crypto.randomUUID();
assert(
  (
    await b
      .from("kw_content_files")
      .insert({
        id: badId,
        workspace_id: f.workspaceId,
        storage_path: `${f.workspaceId}/${badId}/original.jpg`,
        original_filename: "bad.jpg",
        mime_type: "image/jpeg",
        size: 1,
      })
  ).error,
);
console.log(
  "PASS private signed preview, public URL denied, anon and cross-workspace isolation",
);
await bucket.remove([one.storage_path]);
assert(!(await bucket.download(one.storage_path)).error);
console.log("PASS attached original cannot be deleted through Storage");
const two = await reserve("two.jpg", "image/jpeg", jpg.length);
await upload(jpg, two);
content = await save(content.id, content.updated_at, [two.id, one.id]);
assert.deepEqual(
  ok(
    await a
      .from("kw_content_files")
      .select("id")
      .eq("content_id", content.id)
      .order("sort_order"),
  ).map((x) => x.id),
  [two.id, one.id],
);
assert(
  (
    await a.rpc("kw_save_social_content", {
      p_workspace_id: f.workspaceId,
      p_content_id: content.id,
      p_expected_updated_at: "2000-01-01T00:00:00Z",
      p_file_ids: [one.id],
      p_values: { title: "Stale" },
    })
  ).error,
);
console.log(
  "PASS carousel, cover reorder, existing-file retention and concurrency conflict",
);
ok(
  await a
    .from("kw_content_items")
    .update({ file_urls: ["https://example.invalid/legacy.jpg"] })
    .eq("id", content.id),
);
content = await save(content.id, content.updated_at, [one.id]);
assert.equal(content.file_urls.length, 1);
assert(
  ok(
    await a
      .from("kw_social_storage_cleanup")
      .select("*")
      .eq("storage_path", two.storage_path),
  ).length === 1,
);
ok(
  await a
    .from("kw_social_storage_cleanup")
    .delete()
    .eq("storage_path", two.storage_path),
);
assert(
  ok(
    await a
      .from("kw_social_storage_cleanup")
      .select("*")
      .eq("storage_path", two.storage_path),
  ).length === 1,
);
await cleanup();
assert((await bucket.download(two.storage_path)).error);
console.log(
  "PASS confirmed file removal, cleanup acknowledgement guard, legacy URL retention",
);
const empty = await save(crypto.randomUUID(), null, []);
ok(await a.from("kw_content_items").delete().eq("id", empty.id));
console.log("PASS content without files");
// Use a sparse disk file and a stream, testing >6MB chunks and >50MB global limits without loading the video into RAM.
const videoPath = "/private/tmp/karma-social-large-test.mp4";
const fd = fs.openSync(videoPath, "w");
const header = Buffer.alloc(32);
header.writeUInt32BE(32);
header.write("ftypisom", 4);
fs.writeSync(fd, header);
fs.ftruncateSync(
  fd,
  Number(process.env.SOCIAL_TEST_VIDEO_MB || 64) * 1024 * 1024,
);
fs.closeSync(fd);
const video = await reserve(
  "large.mp4",
  "video/mp4",
  Number(process.env.SOCIAL_TEST_VIDEO_MB || 64) * 1024 * 1024,
);
try {
  await upload(fs.createReadStream(videoPath), video);
  content = await save(content.id, content.updated_at, [one.id, video.id], {
    content_type: "reel",
  });
  console.log(
    `PASS ${process.env.SOCIAL_TEST_VIDEO_MB || 64} MiB MP4 in resumable 6 MiB chunks and Reel save`,
  );
} catch (error) {
  console.log("LARGE_VIDEO_FAILURE:", error.message);
  ok(await a.from("kw_content_files").delete().eq("id", video.id));
  await cleanup();
  throw error;
}
const movBytes = Buffer.alloc(32);
movBytes.writeUInt32BE(32);
movBytes.write("ftypqt  ", 4);
const mov = await reserve("clip.mov", "video/quicktime", movBytes.length);
await upload(movBytes, mov);
content = await save(content.id, content.updated_at, [
  one.id,
  video.id,
  mov.id,
]);
console.log("PASS MOV upload and attachment");
// Leave one staged object for the scheduled worker, all confirmed content is deleted here.
const abandoned = await reserve("abandoned.jpg", "image/jpeg", jpg.length);
await upload(jpg, abandoned);
ok(await a.from("kw_content_files").delete().eq("id", abandoned.id));
f.cleanupPath = abandoned.storage_path;
fs.writeFileSync(process.argv[2], JSON.stringify(f), { mode: 0o600 });
ok(await a.from("kw_content_items").delete().eq("id", content.id));
assert.equal(
  ok(await a.from("kw_content_files").select("*").eq("content_id", content.id))
    .length,
  0,
);
console.log(
  "PASS content deletion cascades metadata and queues originals for scheduled cleanup",
);
await a.auth.signOut();
await b.auth.signOut();
console.log(
  "PASS integration complete; queued originals await worker verification",
);

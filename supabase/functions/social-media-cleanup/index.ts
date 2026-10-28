import { createClient } from "npm:@supabase/supabase-js@2.118.0";

// Own authentication is mandatory: only the Vault-backed scheduler token is accepted.
// service_role stays in the Edge environment and is never returned to the client.
Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const token = request.headers.get("x-social-cleanup-token");
  if (!token || token.length !== 64) return new Response("Unauthorized", { status: 401 });
  const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
  const authorized = await client.rpc("kw_social_cleanup_authorized", { p_token: token });
  if (authorized.error || authorized.data !== true) return new Response("Unauthorized", { status: 401 });
  try {
    // Only reservations older than 24h are expired; attached originals never enter this path.
    const expired = await client.from("kw_content_files").delete().is("content_id", null)
      .lt("created_at", new Date(Date.now() - 86400000).toISOString());
    if (expired.error) throw expired.error;
    const queued = await client.from("kw_social_storage_cleanup").select("storage_path").order("created_at").limit(100);
    if (queued.error) throw queued.error;
    let removed = 0;
    for (const row of queued.data || []) {
      // Defence in depth: never delete an attached or reserved original.
      const linked = await client.from("kw_content_files").select("id").eq("storage_path", row.storage_path).limit(1);
      if (linked.error || linked.data?.length) continue;
      const result = await client.storage.from("social-media").remove([row.storage_path]);
      if (result.error) continue; // Keep outbox entry for the next run.
      const ack = await client.from("kw_social_storage_cleanup").delete().eq("storage_path", row.storage_path);
      if (!ack.error) removed++;
    }
    return Response.json({ queued: queued.data?.length || 0, removed });
  } catch {
    // Never log credentials, signed URLs or user filenames.
    return Response.json({ error: "Social cleanup failed; queued paths retained for retry." }, { status: 500 });
  }
});

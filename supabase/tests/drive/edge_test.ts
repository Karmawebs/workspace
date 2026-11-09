import assert from "node:assert/strict";
import { Buffer } from "node:buffer";

Deno.test("OAuth, folder boundaries, refresh and video download", async () => {
  const projectId = crypto.randomUUID(),
    workspace = crypto.randomUUID(),
    user = crypto.randomUUID();
  const root = "client_folder_01",
    clip = "video_file_01";
  const session = crypto.randomUUID();
  const jwt =
    "eyJhbGciOiJIUzI1NiJ9." +
    btoa(JSON.stringify({ session_id: session })) +
    ".sig";
  for (const [k, v] of Object.entries({
    SUPABASE_URL: "http://localhost:54321",
    SUPABASE_SERVICE_ROLE_KEY: "test-only",
    GOOGLE_OAUTH_CLIENT_ID: "client",
    GOOGLE_OAUTH_CLIENT_SECRET: "secret",
    SOCIAL_DRIVE_ENCRYPTION_KEY: btoa("0".repeat(32)),
    WORKSPACE_ORIGIN: "http://localhost:5173",
  }))
    Deno.env.set(k, v);
  type Handler = (req: Request) => Promise<Response>;
  const handlers: Handler[] = [];
  const descriptor = Object.getOwnPropertyDescriptor(Deno, "serve")!;
  Object.defineProperty(Deno, "serve", {
    configurable: true,
    value: (handler: Handler) => handlers.push(handler),
  });
  const originalFetch = globalThis.fetch;
  let pending: Record<string, string> | undefined,
    encrypted = "",
    role = "owner",
    revoked = false,
    parent = root;
  const scope = "https://www.googleapis.com/auth/drive.readonly";
  globalThis.fetch = async (input, init) => {
    const req = new Request(input, init),
      url = new URL(req.url);
    const row = (data: unknown) => Response.json(data);
    const rows = (data: unknown) =>
      row(req.headers.get("accept")?.includes("object") ? data : [data]);
    if (url.pathname === "/auth/v1/user") return row({ id: user });
    if (url.hostname === "oauth2.googleapis.com") {
      const params = new URLSearchParams(await req.text());
      if (params.get("grant_type") === "authorization_code") {
        assert.equal(params.get("code_verifier")?.length, 43);
        return row({ scope, refresh_token: "private-refresh" });
      }
      assert.equal(params.get("refresh_token"), "private-refresh");
      return revoked
        ? Response.json({ error: "invalid_grant" }, { status: 400 })
        : row({ access_token: "google-access" });
    }
    if (url.hostname === "www.googleapis.com") {
      assert.equal(req.headers.get("authorization"), "Bearer google-access");
      if (url.searchParams.has("alt"))
        return new Response("test", { headers: { "Content-Length": "4" } });
      if (url.pathname.endsWith("/files"))
        return row({
          files: [{ id: clip, name: "clip.mp4", mimeType: "video/mp4" }],
        });
      return row({
        id: clip,
        name: "clip.mp4",
        mimeType: "video/mp4",
        size: "4",
        parents: [parent],
      });
    }
    switch (url.pathname.split("/").pop()) {
      case "kw_projects":
        return rows({ workspace_id: workspace });
      case "kw_workspace_members":
        return rows({ role });
      case "kw_social_drive_oauth":
        if (req.method === "POST") {
          pending = await req.json();
          return row(null);
        }
        if (!pending || url.searchParams.get("state") !== "eq." + pending.state)
          return row([]);
        {
          const v = pending.verifier;
          return rows({ verifier: v });
        }
      case "kw_social_drive_replace":
        pending = undefined;
        encrypted = (await req.json()).p_token;
        return row(null);
      case "kw_social_drive_folders":
        return rows({ drive_folder_id: root, connection_id: "conn" });
      case "kw_social_drive_credentials":
        return rows({ owner_id: user, sealed_token: encrypted });
      default:
        throw Error("Unexpected test endpoint");
    }
  };
  try {
    await import("../../functions/social-drive-oauth/index.ts");
    await import("../../functions/social-drive-list/index.ts");
    await import("../../functions/social-drive-download/index.ts");
    const call = (index: number, body: object, auth = true) =>
      handlers[index](
        new Request("http://local", {
          method: "POST",
          headers: auth ? { Authorization: "Bearer " + jwt } : {},
          body: JSON.stringify({ projectId, ...body }),
        }),
      );
    assert.equal((await call(0, { action: "start" }, false)).status, 401);
    role = "member";
    assert.equal((await call(1, {})).status, 403);
    role = "owner";
    const start = await (await call(0, { action: "start" })).json();
    const url = new URL(start.url);
    assert.equal(url.searchParams.get("scope"), scope);
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(pending!.verifier),
    );
    assert.equal(
      url.searchParams.get("code_challenge"),
      Buffer.from(digest).toString("base64url"),
    );
    assert.equal(
      (
        await call(0, {
          action: "finish",
          state: crypto.randomUUID(),
          code: "code",
        })
      ).status,
      400,
    );
    const finish = { action: "finish", state: start.state, code: "code" };
    assert.equal((await call(0, finish)).status, 200);
    assert.ok(encrypted && !encrypted.includes("private-refresh"));
    assert.equal((await call(0, finish)).status, 400);
    assert.equal((await (await call(1, {})).json()).files[0].id, clip);
    assert.equal(await (await call(2, { fileId: clip })).text(), "test");
    parent = "other_root_01";
    assert.equal((await call(2, { fileId: clip })).status, 403);
    revoked = true;
    assert.equal(
      (await (await call(1, {})).json()).error,
      "GOOGLE_REAUTH_REQUIRED",
    );
  } finally {
    globalThis.fetch = originalFetch;
    Object.defineProperty(Deno, "serve", descriptor);
  }
});

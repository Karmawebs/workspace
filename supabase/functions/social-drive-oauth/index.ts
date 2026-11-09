import {
  access,
  b64,
  connection,
  cors,
  env,
  exchange,
  failure,
  Failure,
  json,
  scope,
  seal,
} from "../_shared/social-drive.ts";

const folderMime = "application/vnd.google-apps.folder";
const driveScope = "https://www.googleapis.com/auth/drive.readonly";
const redirect = () => env("WORKSPACE_ORIGIN") + "/social/drive/callback";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    const body = await req.json();
    const s = await scope(req, body.projectId);
    if (body.action === "start") {
      const verifier = b64(crypto.getRandomValues(new Uint8Array(32)));
      const challenge = b64(
        new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(verifier),
          ),
        ),
      );
      const state = crypto.randomUUID();
      const { error } = await s.db.from("kw_social_drive_oauth").upsert({
        project_id: s.projectId,
        user_id: s.user,
        session_id: s.session,
        state,
        verifier,
        expires_at: new Date(Date.now() + 600000).toISOString(),
      });
      if (error) throw error;
      const params = new URLSearchParams({
        client_id: env("GOOGLE_OAUTH_CLIENT_ID"),
        redirect_uri: redirect(),
        response_type: "code",
        access_type: "offline",
        prompt: "consent",
        scope: driveScope,
        state,
        code_challenge: challenge,
        code_challenge_method: "S256",
      });
      return json({
        url: "https://accounts.google.com/o/oauth2/v2/auth?" + params,
        state,
      });
    }
    if (body.action === "finish") {
      const { data } = await s.db
        .from("kw_social_drive_oauth")
        .select("verifier")
        .eq("project_id", s.projectId)
        .eq("state", body.state)
        .eq("session_id", s.session)
        .eq("user_id", s.user)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();
      if (!data || !body.code) throw new Failure("INVALID_CALLBACK", 400);
      const token = await exchange({
        grant_type: "authorization_code",
        code: body.code,
        code_verifier: data.verifier,
        redirect_uri: redirect(),
      });
      if (!token.refresh_token || !token.scope?.split(" ").includes(driveScope))
        throw new Failure("GOOGLE_CONSENT_REQUIRED", 409);
      const { error } = await s.db.rpc("kw_social_drive_replace", {
        p_project: s.projectId,
        p_workspace: s.workspace,
        p_user: s.user,
        p_state: body.state,
        p_session: s.session,
        p_token: await seal(token.refresh_token, s.projectId),
      });
      if (error) throw error;
      return json({ connected: true });
    }
    if (body.action === "disconnect") {
      const { error } = await s.db.rpc("kw_social_drive_disconnect", {
        p_project: s.projectId,
        p_workspace: s.workspace,
      });
      if (error) throw error;
      return json({ connected: false });
    }
    const id = await connection(s);
    const token = await access(s, id, true);
    const headers = { Authorization: "Bearer " + token };
    if (body.action === "folders") {
      const parent = body.folderId ?? "root";
      if (!/^[\w-]{1,255}$/.test(parent))
        throw new Failure("INVALID_FOLDER", 400);
      const params = new URLSearchParams({
        q: `'${parent}' in parents and trashed=false and mimeType='${folderMime}'`,
        fields: "nextPageToken,files(id,name)",
        orderBy: "name",
        pageSize: "100",
        supportsAllDrives: "true",
        includeItemsFromAllDrives: "true",
      });
      if (body.pageToken) params.set("pageToken", body.pageToken);
      const response = await fetch(
        "https://www.googleapis.com/drive/v3/files?" + params,
        { headers },
      );
      if (!response.ok) throw new Failure("GOOGLE_FOLDER_UNAVAILABLE", 502);
      return json(await response.json());
    }
    if (body.action === "bind" && /^[\w-]{10,255}$/.test(body.folderId)) {
      const response = await fetch(
        "https://www.googleapis.com/drive/v3/files/" +
          encodeURIComponent(body.folderId) +
          "?fields=id,name,mimeType,trashed&supportsAllDrives=true",
        { headers },
      );
      if (!response.ok) throw new Failure("INVALID_FOLDER", 400);
      const folder = await response.json();
      if (folder.trashed || folder.mimeType !== folderMime)
        throw new Failure("INVALID_FOLDER", 400);
      const { error } = await s.db.from("kw_social_drive_folders").upsert({
        project_id: s.projectId,
        workspace_id: s.workspace,
        connection_id: id,
        drive_folder_id: folder.id,
        folder_name: folder.name,
      });
      if (error) throw error;
      return json({ linked: true });
    }
    throw new Failure("INVALID_ACTION", 400);
  } catch (error) {
    return failure(error);
  }
});

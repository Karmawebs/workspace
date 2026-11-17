import { Failure, type Scope } from "../_shared/social-drive.ts";
import {
  notification,
  PORTAL_URL,
  sendNotification,
  smtpConfigured,
} from "../_shared/portal-notifications.ts";
export function requestId(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new Failure("Solicitud no válida.", 400);
  return value;
}
export function generatedPassword() {
  return (
    Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) =>
      n.toString(16).padStart(2, "0"),
    ).join("") + "aA1!"
  );
}
export async function invite(
  db: Scope["db"],
  projectId: string,
  userId: string,
  request: string,
) {
  const { data: claimed, error } = await db.rpc("kw_portal_claim_invitation", {
    p_user: userId,
    p_project: projectId,
    p_request: request,
  });
  if (error) throw Error("CLAIM_FAILED");
  const { data: a, error: read } = await db
    .from("kw_portal_access")
    .select(
      "name,contact_email,login_email,active,invitation_state,invitation_at",
    )
    .eq("user_id", userId)
    .eq("project_id", projectId)
    .single();
  if (read || !a) throw Error("ACCESS_FAILED");
  if (!claimed) return { delivery: a.invitation_state, retryAfter: 300 };
  const finish = async (state: string) => {
    const { error } = await db
      .from("kw_portal_access")
      .update({
        invitation_state: state,
        ...(state === "sent"
          ? { invitation_sent_at: new Date().toISOString() }
          : {}),
      })
      .eq("user_id", userId)
      .eq("project_id", projectId)
      .eq("invitation_request", request);
    if (error) throw Error("STATUS_FAILED");
    return { delivery: state };
  };
  if (!smtpConfigured()) return finish("unconfigured");
  const { data: p, error: pe } = await db
    .from("kw_projects")
    .select("name")
    .eq("id", projectId)
    .single();
  if (pe || !p) return finish("failed");
  // Supabase owns the token, single-use verification, expiry and password hashing.
  const { data: link, error: le } = await db.auth.admin.generateLink({
    type: "recovery",
    email: a.login_email,
  });
  if (le || !link.properties?.hashed_token) return finish("failed");
  const url =
    PORTAL_URL + "#invite=" + encodeURIComponent(link.properties.hashed_token);
  try {
    await sendNotification(
      a.contact_email,
      notification("welcome", a.name, p.name, url, a.login_email),
      request,
    );
  } catch {
    return finish("unknown");
  } // SMTP timeout can mean accepted: no automatic retry.
  return finish("sent");
}

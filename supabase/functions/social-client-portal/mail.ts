import { admin, json } from "../_shared/social-drive.ts";
import {
  notification,
  sendNotification,
  smtpConfigured,
  type NotificationKind,
} from "../_shared/portal-notifications.ts";
const kinds = new Set(["new", "modified", "scheduled", "published", "reply"]);
// Never log SMTP errors: their text can contain addresses or provider details.
export function smtpFailure(error: unknown): "retry" | "failed" | "unknown" {
  const e = error as { responseCode?: number; command?: string; code?: string };
  if (e?.responseCode && e.responseCode >= 400 && e.responseCode < 500)
    return "retry";
  if (e?.responseCode && e.responseCode >= 500) return "failed";
  if (["EDNS", "ECONNREFUSED"].includes(e?.code || "")) return "retry";
  if (
    [
      "CONN",
      "EHLO",
      "HELO",
      "AUTH",
      "AUTH PLAIN",
      "AUTH LOGIN",
      "MAIL FROM",
      "RCPT TO",
    ].includes(e?.command || "")
  )
    return e?.code === "EAUTH" ? "failed" : "retry";
  // In particular, losing the connection during/after DATA can mean accepted.
  return "unknown";
}
export async function deliver(b: { id: string; ticket: string }) {
  const db = admin(),
    now = Date.now();
  const { data: j, error: read } = await db
    .from("kw_portal_mail")
    .select("*")
    .eq("id", b.id)
    .eq("ticket", b.ticket)
    .in("state", ["pending", "sending"])
    .lte("due_at", new Date(now).toISOString())
    .maybeSingle();
  if (read) return json({ ok: false }, 503);
  if (!j) return json({ ok: false }, 403);
  const ticket = crypto.randomUUID();
  const { data: claim, error: ce } = await db
    .from("kw_portal_mail")
    .update({
      ticket,
      state: "sending",
      due_at: new Date(now + 300000).toISOString(),
    })
    .eq("id", j.id)
    .eq("ticket", b.ticket)
    .in("state", ["pending", "sending"])
    .select("id")
    .maybeSingle();
  if (ce) return json({ ok: false }, 503);
  if (!claim) return json({ ok: true });
  const finish = async (state: string, extra: Record<string, unknown> = {}) => {
    const { error } = await db
      .from("kw_portal_mail")
      .update({ state, ...extra })
      .eq("id", j.id)
      .eq("ticket", ticket);
    return json({ ok: !error, state }, error ? 503 : 200);
  };
  if (now - Date.parse(j.created_at) > 24 * 3600000)
    return finish("skipped", { last_error_code: "expired" });
  if (j.tries >= 5) return finish("failed", { last_error_code: "retry_limit" });
  if (!kinds.has(j.kind))
    return finish("skipped", { last_error_code: "unsupported_kind" });
  if (!smtpConfigured())
    return finish("pending", { last_error_code: "smtp_disabled" });
  const { data: a, error: ae } = await db
    .from("kw_portal_access")
    .select("active,preferences,contact_email,name")
    .eq("user_id", j.user_id)
    .eq("project_id", j.project_id)
    .maybeSingle();
  const { data: c, error: contentError } = await db
    .from("kw_content_items")
    .select("id,title")
    .eq("id", j.content_id)
    .eq("project_id", j.project_id)
    .maybeSingle();
  const { data: p, error: pe } = await db
    .from("kw_projects")
    .select("name")
    .eq("id", j.project_id)
    .eq("app_key", "social")
    .maybeSingle();
  if (ae || contentError || pe)
    return finish("pending", { last_error_code: "lookup_failed" });
  if (!a?.active || !a.preferences.includes(j.kind) || !c || !p)
    return finish("skipped", {
      last_error_code: "recipient_or_content_unavailable",
    });
  // Durable fence BEFORE SMTP. A crash after this point must not resend the job.
  const { data: fenced, error: fe } = await db
    .from("kw_portal_mail")
    .update({
      state: "dispatching",
      tries: j.tries + 1,
      first_attempt_at: j.first_attempt_at || new Date(now).toISOString(),
      last_error_code: null,
    })
    .eq("id", j.id)
    .eq("ticket", ticket)
    .eq("state", "sending")
    .select("id")
    .maybeSingle();
  if (fe || !fenced) return json({ ok: false }, 503);
  try {
    await sendNotification(
      a.contact_email,
      notification(
        j.kind as NotificationKind,
        a.name,
        p.name,
        undefined,
        undefined,
        c.title,
      ),
      j.id,
    );
  } catch (e) {
    const failure = smtpFailure(e);
    if (failure === "retry" && j.tries + 1 < 5)
      return finish("pending", {
        last_error_code: "smtp_transient",
        due_at: new Date(
          now + Math.min(3600000, 300000 * 2 ** j.tries),
        ).toISOString(),
      });
    return finish(failure === "retry" ? "failed" : failure, {
      last_error_code:
        failure === "unknown" ? "smtp_ambiguous" : "smtp_rejected",
    });
  }
  return finish("sent", {
    sent_at: new Date().toISOString(),
    smtp_message_id: `<${j.id}@karmawebs.com>`,
    last_error_code: null,
  });
}

import nodemailer from "npm:nodemailer@7.0.11";
export const PORTAL_URL = "https://workspace.karmawebs.com/portal";
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export type NotificationKind = "welcome" | "approval" | "changes" | "reminder";
const subjects: Record<NotificationKind, string> = {
  welcome: "Bienvenido a tu espacio",
  approval: "Diseño pendiente de aprobación",
  changes: "Cambios en tu contenido",
  reminder: "Recordatorio de aprobación",
};
export function notification(
  kind: NotificationKind,
  name: string,
  project: string,
  url = PORTAL_URL,
  login?: string,
) {
  const target = new URL(url);
  if (
    target.origin !== new URL(PORTAL_URL).origin ||
    target.pathname !== "/portal"
  )
    throw Error("Invalid portal URL");
  const title = subjects[kind];
  const detail =
    kind === "welcome"
      ? "Establece tu contraseña con el botón. El enlace es personal, de un solo uso y caduca en una hora. Si caduca, pide al equipo una nueva invitación."
      : "Entra en tu espacio para revisar el contenido del proyecto.";
  const access = login
    ? `Tu identificador de acceso: ${login}. Es distinto de tu correo de contacto; guárdalo para volver a entrar.`
    : "";
  return {
    subject: `${title} · Karma Social`,
    text: `Hola ${name}. ${title} a ${project}. ${detail} ${access}\n${url}`,
    html: `<!doctype html><html lang="es"><body style="margin:0;background:#f4f4f4;font-family:Arial,sans-serif;color:#111"><div style="max-width:560px;margin:32px auto;background:#fff;padding:40px"><div style="font-size:28px;font-weight:bold;letter-spacing:4px">KARMA</div><p style="color:#777">SOCIAL / ${escape(project)}</p><h1 style="font-size:26px">${title}</h1><p>Hola ${escape(name)},</p><p>${detail}</p>${login ? `<p>${escape(access)}</p>` : ""}<p style="padding:24px 0"><a href="${escape(url)}" style="background:#111;color:#fff;padding:16px 24px;text-decoration:none;display:inline-block">Acceder a mi espacio</a></p><p style="color:#777;font-size:13px">¿Necesitas ayuda? Responde a este correo.</p></div></body></html>`,
  };
}
export function smtpConfigured() {
  return (
    !!Deno.env.get("PORTAL_SMTP_PASSWORD") &&
    Deno.env.get("PORTAL_SMTP_ENABLED") === "true"
  );
}
export async function sendNotification(
  to: string,
  content: ReturnType<typeof notification>,
  request: string,
) {
  if (!smtpConfigured()) throw Error("SMTP_NOT_CONFIGURED");
  const transport = nodemailer.createTransport({
    host: "mail.karmawebs.com",
    port: 465,
    secure: true,
    auth: {
      user: "notificaciones@karmawebs.com",
      pass: Deno.env.get("PORTAL_SMTP_PASSWORD"),
    },
    tls: { rejectUnauthorized: true },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
  try {
    const result = await transport.sendMail({
      from: "Karma Social <notificaciones@karmawebs.com>",
      replyTo: "info@karmawebs.com",
      to,
      messageId: `<${request}@karmawebs.com>`,
      ...content,
    });
    if (!result.accepted?.length) throw Error("SMTP_NOT_ACCEPTED");
  } finally {
    transport.close();
  }
}

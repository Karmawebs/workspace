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
  ) throw Error("Invalid portal URL");

  const title = subjects[kind];
  const welcome = kind === "welcome";
  const heading = welcome ? "Tu espacio ya está listo." : title;
  const intro = welcome
    ? "Ya puedes entrar en tu espacio de Karma Social para revisar contenidos, solicitar cambios y aprobar publicaciones."
    : "Tienes novedades en tu espacio de Karma Social. Entra para revisar el contenido de tu proyecto.";
  const steps = welcome
    ? "1. Pulsa «Activar mi cuenta».\n2. Crea tu contraseña personal desde el enlace seguro.\n3. Guarda tu identificador de acceso y entra cuando lo necesites."
    : "Pulsa «Acceder a mi espacio» para consultar las novedades.";
  const expiry = welcome
    ? "El enlace es personal, de un solo uso y caduca en una hora. Si caduca, solicita una nueva invitación a Karma."
    : "";
  const button = welcome ? "Activar mi cuenta" : "Acceder a mi espacio";
  const access = login
    ? "Identificador de acceso: " + login + ". Es distinto de tu email de contacto; consérvalo para iniciar sesión."
    : "";
  const safe = {
    title: escape(heading),
    name: escape(name),
    project: escape(project),
    intro: escape(intro),
    url: escape(url),
    button: escape(button),
    login: login ? escape(login) : "",
    expiry: escape(expiry),
  };
  // Inline styles and tables maximize compatibility with email clients.
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Caveat:wght@600&family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet"><style>@import url('https://fonts.googleapis.com/css2?family=Caveat:wght@600&family=Manrope:wght@400;500;600;700;800&display=swap');</style><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"></head><body style="margin:0;padding:0;background-color:#000000;color:#ffffff;font-family:Manrope,Arial,Helvetica,sans-serif"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#000000"><tr><td align="center" style="padding:40px 20px 48px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;background-color:#000000"><tr><td style="padding:12px 0 38px"><img src="https://workspace.karmawebs.com/assets/karma-compact.png" alt="Karma" width="76" style="display:block;width:76px;height:auto;border:0;color:#ffffff"><p style="margin:16px 0 0;font-size:11px;letter-spacing:2px;color:#bfbfbf">KARMA SOCIAL</p></td></tr><tr><td><p style="margin:0 0 12px;font-size:12px;letter-spacing:1px;color:#c4c4c4">${safe.project}</p><h1 style="margin:0 0 24px;color:#ffffff;font-size:32px;font-weight:700;line-height:1.14">${safe.title}</h1><p style="margin:0 0 16px;color:#ffffff;font-size:16px;line-height:1.65">Hola, ${safe.name}.</p><p style="margin:0 0 30px;color:#ffffff;font-size:15px;line-height:1.75">${safe.intro}</p>${welcome ? `<h2 style="margin:0 0 15px;color:#ffffff;font-size:16px">Cómo empezar</h2><ol style="color:#ffffff;padding-left:20px;margin:0 0 27px;font-size:15px;line-height:1.9"><li>Pulsa <strong>«Activar mi cuenta»</strong>.</li><li>Establece tu contraseña desde el enlace seguro.</li><li>Guarda tu identificador para tus próximos accesos.</li></ol>` : ""}<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#ffffff" style="background:#ffffff;border-radius:4px"><a href="${safe.url}" style="display:inline-block;padding:18px 28px;background:#ffffff;color:#000000;text-decoration:none;font-size:15px;font-weight:700;border-radius:4px">${safe.button}</a></td></tr></table>${welcome ? `<p style="color:#d1d1d1;font-size:12px;line-height:1.7;margin:20px 0 0">${safe.expiry}</p>` : ""}<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:40px;margin-bottom:10px"><tr><td><span style="display:inline-block;font-family:Caveat,'Segoe Script','Brush Script MT',cursive;font-size:58px;line-height:1.2;font-weight:600;letter-spacing:-2px;color:#ffffff;font-style:italic">Karma</span></td></tr></table>${login ? `<div style="border:1px solid #4a4a4a;padding:18px;margin-top:32px"><p style="margin:0 0 9px;color:#bfbfbf;font-size:11px;letter-spacing:1px">TU IDENTIFICADOR DE ACCESO</p><p style="margin:0;color:#ffffff;font-size:13px;overflow-wrap:anywhere;word-break:break-all">${safe.login}</p><p style="margin:10px 0 0;color:#bbbbbb;font-size:12px;line-height:1.5">Es distinto de tu correo de contacto. Guárdalo para iniciar sesión.</p></div>` : ""}</td></tr></table></td></tr></table></body></html>`;
  return {
    subject: `${title} · Karma Social`,
    text: `Hola, ${name}.\n\n${heading}\n${intro}\n\n${steps}\n\n${button}: ${url}\n\n${expiry}\n${access}\n\nKarma`,
    html,
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

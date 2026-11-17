# Social — usuarios e invitaciones

## Implementación y seguridad

La tarjeta Usuarios conserva posición, icono y estilo de Información. El modal reutiliza PortalAdmin, fija el proyecto y permite alta, edición de contacto, activación/desactivación y reenvío. La actividad editorial continúa en su sección existente.

Cada nueva identidad usa un alias aleatorio `cliente-<uuid>@portal.invalid` en Supabase Auth. El email del destinatario se almacena aparte; puede repetirse en proyectos distintos. No se cambian los logins existentes. Una contraseña criptográfica de 256 bits se genera en backend y nunca se muestra ni envía. El cliente elige la suya mediante recuperación de Supabase, sin implementar hashing ni contraseñas propias.

La URL sigue siendo https://workspace.karmawebs.com/portal. El token de recuperación va en el fragmento (no en logs HTTP); se elimina de la barra y solo se verifica al enviar el formulario, evitando que una visita de un escáner de correo lo consuma. Supabase controla caducidad (3600 s en la configuración vigente) y uso único. No se registran tokens ni errores SMTP sensibles.

Se conserva el rol `kw_portal_client`, sin permisos Data API/Storage ni membresía de Workspace. Las tablas del portal tienen RLS y ninguna concesión pública; el servidor autoriza la sesión activa y deriva el proyecto exclusivamente del vínculo existente. Las funciones administrativas validan JWT, sesión no revocada y rol owner/admin del workspace del proyecto. No se añaden automatizaciones de avisos ni se habilita el transporte anterior de Resend.

Migración aplicada: `20261117163813_social_portal_invitations.sql`. Columnas de seguimiento en `kw_portal_access`, vínculo inmutable, claim con bloqueo de fila y RPC de sesión administrativa; RPC exclusivamente service_role. Las dos identidades existentes conservan datos, sesiones y estado. El registro público ya estaba desactivado en producción y se ha verificado.

La creación Auth y el vínculo se realizan en una misma transacción mediante el trigger existente. Un UUID de creación permite repetir la solicitud tras un error de red sin duplicar cuentas. Restricción única por proyecto/email de contacto. Un claim impide envíos concurrentes y reintentos del mismo UUID. Reenvío explícito con nuevo UUID tras cinco minutos. Ante error SMTP ambiguo se indica entrega no confirmada: no se reintenta automáticamente. Un proceso interrumpido deja `sending`; el operador puede reenviar tras cinco minutos. El botón de reenvío genera un token nuevo.

## SMTP pendiente

- Host `mail.karmawebs.com`, puerto 465, TLS con validación de certificado.
- Usuario/remitente `notificaciones@karmawebs.com`; Reply-To `info@karmawebs.com`.
- Configurar `PORTAL_SMTP_PASSWORD` en **Edge Functions → Secrets** del proyecto `wrkoskqfjuefgrwhymqu` (nunca en frontend, Git ni comandos con el valor literal).
- Revisar DNS y envío de prueba; después configurar `PORTAL_SMTP_ENABLED=true`. Sin ambos secretos, el usuario se crea y se informa «correo pendiente de configurar SMTP». Reenviar desde Usuarios cuando esté listo.
- DNS consultado el 17/11/2026: SPF publicado (`include:_spf.gestiondeservidor.net`), clave DKIM en `default._domainkey.karmawebs.com`, **sin TXT DMARC** en `_dmarc.karmawebs.com`. No se cambió DNS. Confirmar con Sered el selector usado y agregar una política DMARC adecuada; comprobar cabeceras reales SPF/DKIM/DMARC y alineación tras proporcionar el secreto. Publicar una clave no demuestra que el servidor firme correctamente.
- SMTP real y recepción en bandeja NO probados: falta el secreto. El transporte se ha probado con simulación, no con un envío real.

`_shared/portal-notifications.ts` prepara HTML/texto para bienvenida, aprobación, cambios y recordatorios. Solo se invoca bienvenida; no hay envíos masivos ni nuevas tareas automáticas.

## Verificación

- TypeScript y build producción correctos; 102 tests frontend.
- SQL desechable PGlite: migraciones, múltiples usuarios, mismo contacto en dos proyectos, duplicados, vínculo inmutable, claims/reintentos, restricciones de roles, aprobaciones, tareas idempotentes y desactivación.
- Cinco pruebas Deno: autorización/listados, transporte anterior conservado, HTML escapado, generación aleatoria, configuración SMTP ausente, claim repetido y contrato TLS/remitente/Reply-To con transporte simulado.
- Auth + Edge locales reales: altas administrativas, reintento idempotente, duplicados, dos usuarios/proyecto, mismo contacto/dos identidades, enlace de un uso y expiración, contraseña, login/logout, denegación de Data API/contenido ajeno/administración y desactivación. Usuarios temporales eliminados.
- Navegador con datos sintéticos: portal, calendario, directorio, previews y herramientas a 1440/768/375/320 px. No son pruebas de envío real.
- Advisors: sin nuevas concesiones peligrosas del portal; permanecen avisos existentes de funciones Care y protección de contraseñas filtradas. RLS sin políticas del portal es intencionado: acceso directo denegado.

## Ejecutar pruebas adicionales

`npm test` y `npm run build`.

`PGLITE_MODULE=<ruta al paquete pglite> node supabase/tests/portal/database.mjs`

`deno test --node-modules-dir=none --allow-env --allow-read supabase/tests/portal/{admin-list,mail,invitations}_test.ts`

`invitations-local.py` requiere el entorno local `karma-drive-local` existente con las migraciones aplicadas y DENO_BIN; no usar contra producción. `browser.mjs` y `users-browser.mjs` requieren preview en 4275, PLAYWRIGHT_MODULE y CHROME_BIN; interceptan toda petición al backend con fixtures.

Modal Usuarios verificado también a 1440/375/320 px: proyecto fijo, alta, ausencia de campo de contraseña, aviso SMTP y listado sin paneles ajenos. Corregido desbordamiento previo del botón Añadir a 320 px mediante wrap de la cabecera Social.

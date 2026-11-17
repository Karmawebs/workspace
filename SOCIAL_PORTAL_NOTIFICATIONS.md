# Portal Social — SMTP y responsive

## Alcance

Trabajo en main. Solo portal Social, plantilla/transportes de correo y outbox existente. Accesos, bienvenida, invitaciones, reuniones, RLS, Drive y aprobación mantienen sus contratos. No se publican contenidos ni se ejecutan automatizaciones de Instagram durante las pruebas.

## Correo

Los cinco avisos (`new`, `modified`, `scheduled`, `published`, `reply`) usan `sendNotification` y la plantilla corporativa ya existente: negro, Manrope con fallback, logotipo y firma original. Sered TLS 465, remitente notificaciones@karmawebs.com, Reply-To info@karmawebs.com y secretos PORTAL_SMTP_PASSWORD / PORTAL_SMTP_ENABLED. Se elimina Resend del worker; no se leen ni imprimen secretos SMTP.

Se conserva kw_portal_mail y el cron cada cinco minutos. Migración `20261117184008_social_portal_smtp_queue`: fecha de aceptación, Message-ID y código de resultado seguro; vigilancia de entregas interrumpidas; timeout HTTP de 60 segundos. No se reactivan correos históricos descartados. El Message-ID es estable por trabajo.

Antes de enviar se vuelven a comprobar proyecto, contenido, usuario activo y preferencias. Claim atómico por ticket y estado. Reintentos con espera exponencial únicamente tras errores de conexión previos a DATA o rechazo SMTP temporal explícito, máximo cinco intentos y caducidad de 24 horas. Configuración deshabilitada aplaza el envío sin gastar intentos.

SMTP no ofrece idempotencia garantizada por proveedor. Para evitar duplicados tras una caída, se persiste `dispatching` ANTES de contactar con SMTP. Si no se conoce la aceptación, el trabajo queda `unknown`, sin reenvío automático. El cron convierte los dispatching abandonados en unknown. Un operador debe revisar la entrega antes de decidir cualquier reenvío. Los códigos no contienen texto del proveedor, direcciones ni secretos.

Los triggers existentes siguen notificando nuevos contenidos, cambios visibles de copy/archivos y respuestas. Se incluyen cambios de título y fecha visible; no notas privadas, responsables, estados internos o guardados sin cambios. Programación/publicación se refieren a eventos confirmados de entrega, no al estado editorial; los intentos superseded no notifican.

## Portal

Preferencias con botones completos aria-pressed, guardado bloqueado mientras está en curso, error recuperable y selección conservada. Cabecera móvil centrada, saludo y selector ampliados, descripción oculta. Calendario continúa como vista inicial y conserva su implementación.

Directorio: mismo calendar_at del calendario, selector mensual, orden created_at descendente (servidor devuelve ese campo manteniendo el filtro por proyecto), sección Sin fecha y bloques de 12 resultados. En móvil, tipo/fecha/ojo/check en la primera fila y título en la segunda; controles de 44 px y aprobación visible. En escritorio se conserva el estilo de filas y botones de texto.

## Verificación

- Build/TypeScript y 106 tests frontend correctos.
- Seis tests Deno: los cinco tipos, doble entrega concurrente, preferencias, proyecto incorrecto, usuario desactivado, caducidad, límite/backoff, SMTP ambiguo y regresión de invitaciones/listados.
- PostgreSQL desechable: migración, triggers visibles frente a notas internas/no-op, preferencias, publicación idempotente, superseded, aislamiento y permisos.
- Navegador con fixtures: Chrome escritorio 1440 y móvil 390/320; WebKit 390/320 con emulación iPhone. Cabecera, orden/filtros/paginación, sin fecha, preview/solicitudes de cambios, preferencias y reuniones comprobados. WebKit es el motor de Safari; no sustituye una prueba en iPhone físico.

## Prueba real, 17/11/2026

Secretos existentes reutilizados sin leer su valor. Proyecto e identidad temporales exclusivamente de prueba y destinatario único en el buzón interno conectado. Se verificó con una sesión real del portal el cambio de preferencias y su lectura posterior; el opt-out impidió encolar nuevo contenido y también descartó un trabajo ya encolado. Una nota interna no generó correo; un cambio visible sí.

Cinco avisos aceptados por Sered y recibidos en INBOX, uno por tipo. Nuevo/modificado/programado/publicado entre 18:45:55–18:45:58 UTC; respuesta enviada por el cron habitual a las 18:50:05 UTC. Todos con tries=1; solicitudes simultáneas y repeticiones después de enviado no produjeron duplicados. Programado/publicado se probaron con trabajos de correo sintéticos: no se programó ni publicó nada en Instagram. La recepción se comprobó por Gmail, no solo por el estado del servidor.

Proyecto, usuario, contenido y trabajos temporales eliminados. Los mensajes históricos skipped permanecen descartados. No se enviaron pruebas a clientes. Sin pendientes de configuración SMTP; queda la comprobación visual en iPhone físico.

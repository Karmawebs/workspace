# Instagram: sincronización y calendario

Implementado y desplegado el 23 de noviembre de 2026 en `workspace.karmawebs.com`
y Supabase Workspace `wrkoskqfjuefgrwhymqu`. No se modificó el backend antiguo.

## Funcionamiento

- Se reutilizan Unified Login, las conexiones y las credenciales cifradas existentes.
- `social-instagram-sync` consulta exclusivamente la API oficial Graph v27.0 desde
  servidor. La sincronización manual exige sesión de owner/admin y proyecto Social.
- `kw_instagram_sync` mantiene lease, cursor, backoff y última sincronización correcta
  independientes por conexión. Los tickets y cursores no son legibles por el navegador.
- Un trigger incorpora cuentas nuevas/reautorizadas a la cola. Cron revisa la cola
  cada minuto; consulta reciente cada 30 minutos y recorrido completo diario.
  El histórico inicial avanza por páginas de 25, sin truncar por tamaño de respuesta.
- Se reutiliza `kw_content_items`, con metadatos oficiales, fecha original y relación
  por cuenta/ID de Meta. Una restricción única evita duplicados por cliente.
  Las publicaciones locales se reconocen por `kw_instagram_publications.media_id`.
- Los archivos descargables se conservan en el bucket privado `instagram-media`,
  con nombres deterministas. Los fallos de sincronización no borran datos ni archivos.
  No se envían correos de contenido nuevo al importar el histórico.
- Ficha de solo consulta para publicaciones realizadas, incluidos estados heredados;
  bloqueo de escrituras/borrados y cambios de archivos también en PostgreSQL.
- El arrastre llama a `kw_move_social_content`: modifica solo la fecha y actualiza
  atómicamente el mismo trabajo confirmado. Conserva hora local, texto, archivos,
  snapshot y aprobación; solo renueva su versión. Bloquea ejecución en curso,
  revisiones obsoletas, fechas no válidas y fechas pasadas para trabajos programados.
- No se mueve visualmente la tarjeta antes de confirmar el guardado; un fallo
  conserva su posición y muestra el error. En móvil se usa el selector del editor.

## Validación real

RIBSFUNDE: **6/6** publicaciones oficiales distintas. Tres del 6 de noviembre y
otras tres del 21 de noviembre (hora original convertida a Europe/Madrid).
Las tres primeras tienen el mismo copy, pero IDs/permalinks distintos: son tres
publicaciones reales, no duplicados de la importación. Cinco posts y un carrusel
con cuatro elementos. Diez objetos privados conservados (portadas y carrusel).
Segunda ejecución del servidor y otra manual desde la UI mantienen seis registros.

Sesión real: abiertas las seis fichas, con copy completo, fecha, imágenes y enlace.
Todas las miniaturas cargan. Creado un borrador de prueba el 26/11 a las 19:00;
arrastrado al 28/11; persistencia comprobada tras recargar y por SQL (18:00 UTC).
Texto y estado conservados. Selector de ficha probado a 390 px, cambio al 29/11
manteniendo las 19:00. Borrador retirado después de la prueba. Ningún envío nuevo
ni trabajo de publicación real creado.

Cuentas adicionales: La Sidrería de Hoznayo, 12 publicaciones; Karmawebs, 10 medios
recuperados y contenidos locales conservados. Garden Nails: 175 recuperadas en el
último corte, sin errores; el histórico inicial sigue paginado por la cola.
No se afirma completado ese histórico mientras Meta siga devolviendo cursor.

## Pruebas

- 127 tests frontend pasan, incluidos arrastre, error de guardado, bloqueo de
  publicados, conservación de hora y cambio de horario de verano de Madrid.
- Build TypeScript/Vite correcta y Cloudflare Workers Builds completado con éxito
  para `34f9c04`. Comprobación real de la versión publicada en el navegador.
- `supabase/tests/instagram_calendar_sync.sql` pasa en la base real dentro de una
  transacción revertida: importación idempotente, actualización, separación de
  clientes, cola de nueva cuenta, reconciliación local, bloqueo, reprogramación
  atómica, conflictos, fecha pasada y denegación a no miembros.
- Endpoint público sin sesión: HTTP 401. Credenciales privadas y tickets sin grants
  de lectura a authenticated. Advisor: la RPC de movimiento es intencionadamente
  SECURITY DEFINER para actualizar el trabajo; valida auth.uid y rol administrativo.
- Deno check de la función nueva pasa. Test existente de Unified Login pasa en
  ejecución con `--no-check`; su typecheck tiene un conflicto preexistente de
  sobrecargas RequestInit en el mock de fetch, no en la función nueva.

## Límites y operación

Meta solo devuelve el histórico accesible y los campos permitidos. No se simulan
publicaciones programadas desde herramientas externas ni su edición. Contenido
multimedia omitido por Meta (por ejemplo por derechos) no se puede reconstruir.
La caché tiene el límite vigente de 50 MiB por archivo; archivos no descargables
mantienen URL remota y se reintentan en el siguiente refresco. Las URL remotas
pueden caducar; la caché privada conserva los archivos recuperados.

Una publicación local cuyo envío resulte ambiguo y carezca de ID oficial bloquea
la importación de nuevos medios de ese intervalo (`PUBLICATION_UNCONFIRMED`).
Se evita deducir identidad por copy/fecha y generar duplicados; requiere reconciliar
el resultado oficial. Los medios anteriores y el histórico conservado no se borran.

Fuente de campos/limitaciones multimedia:
https://developers.facebook.com/docs/instagram-platform/reference/instagram-media/v21.0/

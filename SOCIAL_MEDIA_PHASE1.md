# Social Media Manager — Fase 1

Entrega: 2026-10-28. Único destino: `Karmawebs/workspace/main`, Supabase `wrkoskqfjuefgrwhymqu`.

## Flujo y límites

Archivo local → reserva privada → subida TUS → guardado atómico del contenido y sus archivos → calendario.

- Drag & drop/Finder, varios archivos, reordenación con controles accesibles, eliminación y sustitución mediante quitar/añadir. Primer archivo = portada.
- JPG/JPEG/PNG/WEBP/MP4/MOV. Extensión, MIME, tamaño y firma inicial de 32 bytes se validan en cliente. Storage vuelve a aplicar MIME/tamaño y el guardado comprueba metadatos/tamaño del objeto terminado. Esto no es un antivirus ni transcodificador.
- **Límite operativo aceptado por el usuario: 50 MiB por archivo (52.428.800 bytes; UI: 50 MB)**. Supabase Free tiene este tope global fijo; la prueba de 64 MiB devolvió HTTP 413. El bucket y la UI reflejan ahora 50 MiB. No se contrató Pro.
- Modelo preparado hasta 2 GiB. Tras ampliar el plan y su límite global, basta elevar `storage.buckets.file_size_limit` del bucket mediante una migración. La UI consulta `kw_social_upload_limit`; no requiere rehacer el uploader.
- TUS: endpoint directo de Storage, bloques de 6 MiB, progreso por archivo, reintentos con espera y recuperación en la misma sesión del editor. Token actualizado antes de cada petición; no hay service role en frontend.
- Se puede detener la subida. El contenido no se confirma si algún archivo falla. Se conservan los éxitos para el siguiente Guardar y se reintentan los fallidos. Un cierre/recarga del navegador no conserva automáticamente el formulario ni la selección del disco.
- Originales de vídeo sin transcodificar; placeholder de vídeo. No se genera thumbnail de vídeo en esta fase. Las imágenes usan object URLs locales antes del guardado y signed URLs después.

## Datos y seguridad

Bucket **social-media**, privado, MIME restringidos y límite efectivo 50 MiB. Ruta estable `{workspace_id}/{file_id}/original.{extension}`: el nombre de usuario nunca forma parte de la ruta; el nombre original se conserva como metadato. El recurso no cambia de ruta al cambiar su proyecto. El proyecto se resuelve por `content_id → kw_content_items.project_id`.

`kw_content_files`: id, workspace_id, content_id, storage_path, original_filename, mime_type, size, sort_order, created_by, created_at; preparados preview_storage_path, drive_file_id, drive_url, archive_status y archived_at. `content_id` es NULL solo durante la reserva; después es FK al contenido. Rutas/identidad inmutables, original no sobrescribible.

RLS sigue `kw_is_workspace_member`. Archivos asociados accesibles solo a miembros del workspace; reservas solo a su creador. Se verifica coincidencia de workspace del contenido, la existencia del original y sus metadatos antes de asociarlo. Guardado RPC `SECURITY INVOKER` con control de concurrencia por updated_at; actualiza campos, orden y relaciones en una sola transacción. No modifica canal, responsable ni file_urls antiguos. Los grants limitan UPDATE a asociación/orden.

Storage SELECT verifica registros accesibles; INSERT requiere reserva del usuario; DELETE requiere una entrada de limpieza confirmada y ausencia de referencia activa. No hay policy de UPDATE/upsert de originales. URLs firmadas de 5 minutos, renovadas en previews abiertas cada 4 minutos, nunca persistidas en tablas. Como cualquier signed URL, quien tenga el enlace puede usarlo hasta su expiración.

El calendario conserva círculos/colores, varios contenidos por día, filtro y editor. Consulta archivos nuevos ordenados; si no hay ninguno, recurre a file_urls. Error de imagen o vídeo sin thumbnail: placeholder. Los enlaces antiguos se muestran en un desplegable del editor; no se migran ni se convierten en privados automáticamente.

## Borrado y limpieza

- Quitar un archivo del editor solo se confirma al guardar. Cancelar conserva los originales asociados.
- DELETE confirmado de archivo/contenido/proyecto: el trigger transaccional registra la ruta en `kw_social_storage_cleanup`. Archivar un proyecto no borra sus originales.
- Limpieza inmediata desde Social usando permisos del usuario; si falla, la cola permanece.
- Edge Function **social-media-cleanup**, cron **kw-social-storage-cleanup** cada 15 minutos. Expira reservas sin asociar tras 24 h, procesa hasta 100 rutas por ejecución y confirma la cola solo tras borrar mediante Storage API. No se borra metadata de Storage directamente por SQL.
- El worker usa service role únicamente en servidor. Autenticación propia obligatoria con token aleatorio generado y guardado en Vault; `verify_jwt=false` se limita a este endpoint porque cron usa ese token, validado por una RPC ejecutable solo por service_role. No hay acceso anónimo funcional al worker. Ningún secreto está versionado.
- No hay borrado post-publicación ni integración Instagram/Drive.

## Migraciones aplicadas y versionadas

1. `20261027221638_social_private_media.sql`: bucket, archivos, RLS, outbox y guardado atómico.
2. `20261028081818_social_media_cleanup_worker.sql`: grants explícitos, protección de workspace, cron y autenticación de limpieza.
3. `20261028094130_social_upload_limit.sql`: cap operativo 50 MiB y consulta tipada del límite.

Los nombres locales coinciden con las versiones registradas por el conector remoto. Los tipos se regeneraron desde Supabase; se conserva la nulabilidad de los argumentos RPC que el generador no expresa (`p_target` de Care existente y `p_expected_updated_at` de Social). Sin `any`/`never` nuevos. Las adiciones ajenas a Social en database.types.ts reflejan el esquema actual; no son modificaciones de sus tablas.

## Validación

- Tests de componentes/lógica Social: 25 pasan. Cubren imagen, carrusel, MP4/MOV, sin archivos, orden, eliminación, edición, prioridad de preview privada, fallback antiguo, 1.001 contenidos con varios por día, filtro, fallo parcial/reintento, tamaños/firmas y retención de cola ante error.
- SQL real con rollback: guardado atómico, subida incompleta, concurrencia, URLs antiguas, identidad de rutas, cola y denegación de no miembros.
- API real con dos cuentas/workspaces temporales: TUS JPG, carrusel/reordenación, conservación de originales, signed URL válida, URL pública/anon/otro workspace denegados, borrado activo bloqueado, borrado confirmado/acuse de cola, MP4 de 12 MiB en varios bloques y MOV.
- Prueba 64 MiB rechazada por el plan Free; no se declara soporte real por encima de 50 MiB. No se hizo una subida de 2 GiB.
- Cron real: HTTP 200 con cuatro objetos pendientes eliminados y cola vacía después. Advisor de seguridad sin hallazgos nuevos de Social; persisten advertencias existentes fuera de esta fase.
- Navegador con sesión real: selección múltiple de PNG, orden antes de guardar, creación en calendario, reapertura y dos thumbnails cargados con signed URLs. Captura de evidencia incluida en el informe al usuario.
- Suite global: cuatro fallos previos de `flows.test.tsx` ya documentados en CURRENT_STATE (selector Nuevo proyecto, nombre accesible editar/archivar, título de tarea e intervalo de evento). No se amplió el alcance para corregirlos.

Archivos principales: `SocialContentEditor.tsx`, `SocialMediaPicker.tsx`, `socialMedia.ts`, `social-media.css`, `SocialContentDot.tsx`, `Calendar.tsx`, hook de limpieza de `core/data.ts`, tipos, dependencia `tus-js-client` 4.3.1/lockfile, migraciones, worker y pruebas. Work/Care/CRM/autenticación/navegación no se refactorizaron.

# Social · Fase 2 — flujo editorial interno

## Funcionalidad

Editor existente ampliado con siete estados (Idea, Preparando, Revisión, Aprobado, Programado, Publicado, Descartado), canal, Carrusel, fecha/hora separadas, notas internas y aprobación de cliente independiente. Se conserva `draft` como clave interna de Preparando. Nuevos contenidos empiezan como Idea. Los canales iniciales son Instagram, Facebook e Instagram + Facebook; la columna text permite futuras opciones y el editor conserva valores heredados.

Calendario compacto con círculo por tipo, hora, tipo, proyecto, título y pill de estado. Filtros de estado combinables con proyecto; Todos incluye Descartado. El intervalo local y la paginación de 1.000 siguen intactos. Contenido sin fecha continúa accesible desde Gestor de contenido. En móvil, solo la cuadrícula tiene scroll horizontal; el formulario se adapta a 390 px.

Programado y Publicado son estados manuales: no publican, no programan trabajos externos y no escriben `published_at`. Cualquier valor histórico de esa columna se conserva; no se presenta como prueba de una publicación en redes. No se añadieron conexiones, credenciales, Meta ni Drive.

## Backend

Migración aplicada al proyecto `wrkoskqfjuefgrwhymqu`: `20261030004429_social_workflow_phase2.sql`.

- Añade `internal_notes text NOT NULL DEFAULT ''` y `client_approved boolean NOT NULL DEFAULT false` a `kw_content_items`.
- Default de canal para inserciones nuevas: `instagram`. No reescribe canales antiguos; el editor propone Instagram si están vacíos.
- Check con siete estados para nuevas escrituras; `NOT VALID` conserva posibles valores antiguos desconocidos sin reescribirlos. El editor normaliza estados desconocidos a Idea al guardar.
- Amplía la RPC existente `kw_save_social_content` (misma firma, SECURITY INVOKER, search_path vacío, execute solo authenticated). Los clientes antiguos que omiten los campos nuevos los preservan.
- Conserva locking, concurrencia por updated_at, validación de pertenencia/proyecto, guardado atómico y archivos. RLS, bucket, rutas, worker y limpieza no se modificaron.
- Tipos de tabla y retorno RPC sincronizados desde los tipos generados del backend; se retiene el argumento nullable que permite crear contenido.

Fecha/hora se interpretan en la zona local del navegador y se guardan en el timestamptz existente. Ambas deben estar vacías o completas; se rechazan horas inexistentes por cambio de horario. No hay todavía una zona horaria editorial compartida configurable.

## Validación

- 37 pruebas Social pasan, incluidas creación/edición, siete estados, aprobación independiente, canales, tipo, fecha/hora, contenido antiguo, filtros combinados, varios contenidos el mismo día, imagen/carrusel/vídeo, guardado sin archivos, retries, orden y previews privadas.
- Suite global: 58 pasan / 4 fallan (62). Persisten exclusivamente los cuatro fallos previos de `flows.test.tsx`: selector ambiguo de Nuevo proyecto, botones de edición/archivo sin nombre accesible, selector antiguo del título de tarea e intervalo de evento sin validación. No se modificó ese archivo.
- `supabase/tests/social_workflow.sql`: PASS sobre backend real con rollback. Verifica campos, compatibilidad del payload anterior, siete estados, aprobación independiente, published_at intacto, rechazo de estados inválidos y denegación al no miembro.
- `supabase/tests/social_media.sql`: PASS después de la migración. Conserva atomicidad, rechazo de subida incompleta, file_urls, concurrencia, rutas inmutables, outbox y permisos.
- Advisors: sin hallazgos nuevos de Social; advertencias preexistentes de Care y protección de contraseñas fuera del alcance.
- Navegador real, sesión del propietario: creación de carrusel de dos PNG sintéticos, reordenación, subida TUS, reapertura con dos imágenes cargadas mediante URL firmada, edición y cambio de proyecto/estado; subida de fixture MP4 y placeholder, Programado → Publicado manual. Dos contenidos el mismo día, filtros de proyecto + estado y viewport 390×844 sin overflow horizontal de página.
- El fixture MP4 prueba carga/metadatos/placeholder; no es una prueba de reproducción o codificación de vídeo (fuera de esta fase).
- Build completo incluye TypeScript. Ver entrega para commit y deployment final.

## Alcance y límites

Multimedia continúa limitada a 50 MiB por archivo por el plan Free aceptado. Sin cambios en TUS, previews, Storage ni limpieza automática. Los commits concurrentes de main (Care/Work/configuración de deploy) se incorporaron intactos antes de la entrega; no forman parte del cambio Social.

Siguiente paso: revisión de producto. Cualquier integración real con Meta requiere una fase posterior solicitada explícitamente.

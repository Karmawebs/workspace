# KARMA WORKSPACE — CURRENT STATE

Actualizado: 2026-10-25

## Construido
Frontend V1 React + TypeScript + Vite sobre `wrkoskqfjuefgrwhymqu`. Un único Core (`src/core`) para proyectos, tareas, eventos, diario, CRM, alertas, recursos, miembros y paneles configurables; módulos (`src/modules`) para dashboard/hitos Work, calendario/contenido Social y sitios/conexiones/consulta técnica Care. Shell responsive con navegación preparada para ramas.

CRUD compartido, archivo/restauración de proyectos y clientes, tareas independientes, detalle con tarjetas rápidas y tareas/eventos en columnas. Calendario muestra múltiples eventos por día. Recursos guardan enlaces/referencias, no contraseñas ni archivos binarios.

Auth con registro/confirmación, login, recuperación y pertenencia obligatoria. `info@karmawebs.com` se registró, confirmó y recibió rol `owner` por indicación del usuario. RLS permanece activo. Se corrigió la recursión preexistente de los helpers de membresía: migración `20261024101724_fix_workspace_membership_recursion`, aplicada y versionada. No se recrearon tablas.

## Verificado
Instalación, build/TypeScript y 13 pruebas de componentes/lógica. API pública responde sin exponer filas. SQL como `authenticated`: propietario accede; no miembro no puede leer, escribir ni autoasignarse membresía. Prueba transaccional de escritura/actualización/archivo del Core y módulos, con rollback. Navegador: acceso real de propietaria, creación de proyecto y tarea de prueba, detalle operativo. Los tests de componentes usan backend simulado; no sustituyen una validación de todos los flujos en navegador.

Producción `vjsmsekbsjngdtuxfbmu` no fue accedida ni modificada; no hubo migración de datos. Care legacy, tablas, plugin, RPC y funciones existentes no se modificaron. Quedan un proyecto Work y una tarea de prueba identificados como V1.

## Entorno de prueba publicado
Disponible en https://workspace.karmawebs.com y https://workspace.infokarmawebs.workers.dev. Cloudflare despliega `main`, publica `dist` con fallback SPA y usa variables Vite de build. Se corrigieron la rama seleccionada y una publishable key rechazada por el backend. El build valida el proyecto autorizado y consulta Auth para evitar publicar una configuración inválida. Sin secretos hardcodeados.

Verificado: build local y Cloudflare, 13 pruebas, rechazo de clave inválida, HTTPS del dominio, bundle público con configuración correcta, login en ambos dominios y recarga de ruta hash en navegador; fallback HTTP 200. Sesión real del propietario confirmada en el dominio publicado: rol owner, proyecto y tarea de prueba cargados desde Supabase y acceso conservado al recargar directamente el detalle del proyecto. No se modificaron Supabase de producción, datos ni Care legacy.

## Límites reales / siguiente paso
- `Karmawebs/social` devolvió 404 tanto por conector como por CLI: UI basada en su patrón documentado; falta contrastarla con la referencia real.
- Care técnico está integrado en lectura. Emparejamiento y ejecución remota permanecen en Care actual: `enqueue_care_action` es SECURITY DEFINER, ejecutable por anon y sin comprobación de identidad en su cuerpo. Revisar esa autorización con el plugin antes de exponer acciones en Workspace. No se ejecutaron acciones remotas ni se modificaron sitios reales.
- Listados acotados a 1.000 registros; pendientes paginación a escala, validación de recuperación por correo en el dominio definitivo y revisión visual móvil en dispositivo.
- Validar recuperación por correo en el dominio publicado; después abordar los puntos anteriores. Migración de datos reales únicamente tras aprobación.

## Sidebar reconstruida
Una sola implementación en `src/components/Sidebar.tsx` y `Sidebar.css`; retiradas las reglas de sidebar de `styles.css` y `work-v2.css`. Basada en el rail de `Karmawebs/work` (76/228 px, overlay fijo, transición 220 ms) con su asset real `assets/karma-compact.png`. Columna de iconos fija; selector integrado sin cambiar de orientación; labels fuera de la geometría de iconos. Navegación con scroll independiente en pantallas bajas, cuenta anclada abajo, drawer móvil separado y soporte de foco/reduced-motion. Nuevo proyecto abre el Editor compartido y navega al detalle al guardar. Sin cambios de backend ni escrituras de datos durante la verificación visual.

Verificado en navegador: cerrado/hover, iconos y contenido con coordenadas idénticas antes/después, Work/Social/Care y sus secciones, formulario nuevo proyecto, avatar, móvil 390×844 y pantalla baja 1000×500; sin overflow horizontal de página. Build OK. Tests: 12/14 pasan, incluida navegación y nueva prueba de creación desde sidebar con backend simulado. Dos fallos preexistentes en main siguen fuera de este cambio: botones sin nombre accesible en edición/archivo y validación de intervalo de eventos. Se actualizó la expectativa obsoleta del título del dashboard en el test de navegación.

## Refinamiento visual global
Sistema visual compartido en `src/tokens.css`: superficies neutras claras, negro, acento morado discreto, bordes/radios, escala tipográfica, espaciados existentes, controles y sombras. Aplicado directamente en estilos globales, Work y sidebar; sin capas nuevas de overrides. Tarjetas sin sombra, estados suavizados, iconos Lucide de grosor uniforme, formularios y modales más ligeros. No se cambiaron JSX/React, textos, datos, navegación ni estructura. Comprobación de declaraciones CSS: distribución, tamaños, columnas, padding/márgenes y breakpoints conservados.

TypeScript y build limpios. Tests 12/14: persisten únicamente los dos fallos preexistentes documentados. Inspección visual de Work, detalle Social, Care, modal, sidebar 76/228 con contenido fijo y móvil 390×844 sin overflow horizontal. No hubo escrituras de datos ni cambios de backend.

## Urgencia de proyectos
Semáforo compartido al extremo derecho de las pestañas en Work, Social y Care: rojo alta, amarillo media y verde baja. Guarda mediante `saveRow` en la prioridad existente (`high`/`normal`/`low`); `urgent` existente se muestra como alta. Selección accesible, bloqueo durante guardado y errores sin perder el estado anterior. Sin migraciones ni cambios en Care legacy. TypeScript/build OK; cuatro pruebas nuevas pasan. Suite: 16/18, con los mismos dos fallos preexistentes de edición/archivo e intervalo de eventos.

El kanban de Work muestra una única bola de urgencia a la derecha de cada tarjeta, derivada de la misma prioridad y correspondencia de colores del semáforo del proyecto.

## Care — Punto 8 (0.8.0), 2026-10-27

Acciones remotas integradas en el diagnóstico existente: plugin por `plugin_snapshots.slug` (plugin_file), tema por stylesheet y WordPress; confirmación obligatoria, estados de `action_jobs`, polling, cancelación pendiente e historial separado. Botones bloqueados hasta recibir diagnóstico de agente >=0.8.0.

Aplicada `20261027083945_care_remote_actions_080`: RPC de enqueue/cancel con auth y membresía del Workspace/proyecto Care; índice único por sitio activo; RLS de jobs, sites e installations; tokens del agente no accesibles al navegador; vínculo legacy protegido contra apropiación entre workspaces. RPC legacy de enqueue retirada de anon/authenticated. Pair/diagnostic siguen por care-agent service_role. Corregido reset de paired_at al reconectar.

`care-agent` v6 conserva verify_jwt=false para el protocolo del plugin, pero wake valida JWT con getUser, membresía, proyecto Care y trabajo pendiente antes de obtener la credencial; HTTPS y sin redirects con token. Fuente versionada en supabase/functions/care-agent.

Validación: build/TypeScript OK; 7 nuevas pruebas UI y pruebas del manejador Edge OK; prueba SQL transaccional pasa pairing, diagnóstico, Site Kit, alertas, destinos, duplicados, cancelación, aislamiento, protección de credenciales y denegación anon/no miembro. Las acciones de prueba nunca se confirmaron. Suite total 21/25: los mismos cuatro fallos de flows.test.tsx reproducidos en una copia limpia de main 24104eb (navegación/nuevo proyecto, edición-archivo, tareas independientes, rango de evento). Lectura visual del proyecto real tras RLS conserva conexión, diagnóstico, alertas, Site Kit e historial.

Plugin 0.8.0 preparado en Karmawebs/karma-care-plugin con motor reutilizado/corregido y pruebas de WordPress real desechable. No instalado en karmawebs.com; no se ejecutó ninguna actualización real ni se dejó ningún job pending/running. Instalación y primera actualización quedan manualmente al usuario. Ver CARE_REMOTE_ACTIONS.md para límites y pasos.


## Social — contenido y planificador, 2026-10-27

`kw_content_items.file_urls` confirmado en Workspace como jsonb NOT NULL DEFAULT []; sincronizado en Row/Insert/Update con Json. Editor dedicado compartido por calendario, gestor y detalle de proyecto: URLs externas ordenadas, primera portada, formato pastel, sin responsable/canal; conserva campos antiguos y estados/formatos previos, fecha de publicación y control de concurrencia. Sin migraciones ni Storage.

Calendario de publicaciones con círculos Post/Reel/Story, filtro por proyecto, intervalo local visible y paginación de 1.000 en 1.000; refresco tras cambios. Preview en portal, limitado al viewport, primera URL únicamente, enlaces Drive habituales y resourcekey, placeholder ante errores, apertura por clic y acceso por teclado. Móvil sin overflow horizontal.

Validación: `npm run build` pasa (TypeScript + Vite 8.3.5). 13 pruebas nuevas Social pasan, incluyendo edición heredada, concurrencia, orden de URLs, portada/fallback y 1.001 publicaciones. Suite completa: 34/38; permanecen cuatro fallos previos en flows (selector ambiguo Nuevo proyecto, botones de editar/archivar sin nombre, selector obsoleto del título de tarea y falta de validación del intervalo de eventos). Actualizadas pruebas antiguas del calendario al planificador de publicaciones. Componentes reales verificados en navegador con datos sintéticos y viewport 390×844: popup del extremo dentro de pantalla, placeholder, edición, URLs adicionales y formato pastel; consola sin errores/warnings. No se escribieron datos de prueba en Supabase.

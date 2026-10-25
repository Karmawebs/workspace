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

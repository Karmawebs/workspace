# KARMA WORKSPACE — CURRENT STATE

Actualizado: 2026-10-24

## Construido
Frontend V1 React + TypeScript + Vite sobre `wrkoskqfjuefgrwhymqu`. Un único Core (`src/core`) para proyectos, tareas, eventos, diario, CRM, alertas, recursos, miembros y paneles configurables; módulos (`src/modules`) para dashboard/hitos Work, calendario/contenido Social y sitios/conexiones/consulta técnica Care. Shell responsive con navegación preparada para ramas.

CRUD compartido, archivo/restauración de proyectos y clientes, tareas independientes, detalle con tarjetas rápidas y tareas/eventos en columnas. Calendario muestra múltiples eventos por día. Recursos guardan enlaces/referencias, no contraseñas ni archivos binarios.

Auth con registro/confirmación, login, recuperación y pertenencia obligatoria. `info@karmawebs.com` se registró, confirmó y recibió rol `owner` por indicación del usuario. RLS permanece activo. Se corrigió la recursión preexistente de los helpers de membresía: migración `20261024101724_fix_workspace_membership_recursion`, aplicada y versionada. No se recrearon tablas.

## Verificado
Instalación, build/TypeScript y 13 pruebas de componentes/lógica. API pública responde sin exponer filas. SQL como `authenticated`: propietario accede; no miembro no puede leer, escribir ni autoasignarse membresía. Prueba transaccional de escritura/actualización/archivo del Core y módulos, con rollback. Navegador: acceso real de propietaria, creación de proyecto y tarea de prueba, detalle operativo. Los tests de componentes usan backend simulado; no sustituyen una validación de todos los flujos en navegador.

Producción `vjsmsekbsjngdtuxfbmu` no fue accedida ni modificada; no hubo migración de datos. Care legacy, tablas, plugin, RPC y funciones existentes no se modificaron. Quedan un proyecto Work y una tarea de prueba identificados como V1.

## Límites reales / siguiente paso
- `Karmawebs/social` devolvió 404 tanto por conector como por CLI: UI basada en su patrón documentado; falta contrastarla con la referencia real.
- Care técnico está integrado en lectura. Emparejamiento y ejecución remota permanecen en Care actual: `enqueue_care_action` es SECURITY DEFINER, ejecutable por anon y sin comprobación de identidad en su cuerpo. Revisar esa autorización con el plugin antes de exponer acciones en Workspace. No se ejecutaron acciones remotas ni se modificaron sitios reales.
- Listados acotados a 1.000 registros; pendientes paginación a escala, validación de recuperación por correo en el dominio definitivo y revisión visual móvil en dispositivo.
- Validar V1 con el propietario, habilitar hosting y ajustar redirects Auth; después abordar los puntos anteriores. Migración de datos reales únicamente tras aprobación.

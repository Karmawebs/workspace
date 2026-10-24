# Karma Workspace — Architecture

Karma Workspace unifica Work, Social y Care bajo un Core común.

## Principio

Una sola arquitectura de datos y componentes compartidos. Cada aplicación activa módulos específicos sobre ese Core.

## Core

- CRM: `kw_clients`
- Proyectos: `kw_projects`
- Miembros: `kw_project_members`
- Tareas: `kw_tasks`
- Eventos/reuniones: `kw_events`
- Diario: `kw_journal_entries`
- Alertas: `kw_alerts`
- Recursos/accesos: `kw_project_resources`
- Paneles rápidos: `kw_project_panels`
- Apps: `kw_apps`
- Módulos: `kw_app_modules`
- Usuarios: `kw_profiles`, `kw_workspace_members`

## Work

Core + dashboard de proyectos + tareas independientes + hitos.

Tabla específica: `kw_project_milestones`.

## Social

Core + calendario + gestor de contenido.

Tabla específica: `kw_content_items`.

## Care

Core + técnico + conexiones.

Tablas específicas nuevas: `kw_care_sites`, `kw_connections`.

La infraestructura Care previa (`sites`, `installations`, `diagnostics`, `plugin_snapshots`, `theme_snapshots`, `alerts`, `action_jobs`, `site_activity`, etc.) se mantiene durante la transición. No eliminarla ni sustituirla hasta validar la nueva aplicación.

## Migración

Karma Project es actualmente la fuente de los datos reales de Work/Social. No migrar esos datos durante la fase de construcción.

Orden final:
1. Construir Workspace.
2. Validar Work, Social y Care.
3. Preparar mapeo de datos.
4. Migrar desde Karma Project.
5. Validar migración.
6. Cambiar producción.

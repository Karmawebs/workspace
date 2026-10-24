# Astra Handoff — Karma Workspace

## Misión

Construir la nueva aplicación Karma Workspace en este repositorio usando el Supabase preparado como backend definitivo.

La aplicación agrupa tres contextos de trabajo: Work, Social y Care. No son tres aplicaciones independientes copiadas: comparten Core, datos, componentes y patrones, y cada una activa módulos específicos.

## Fuentes de referencia

Antes de implementar, inspeccionar los repositorios actuales de Karma:

- Work: referencia de funcionalidades de gestión de trabajo/proyectos.
- Social: PRINCIPAL referencia visual y UX para proyectos, tareas, reuniones/sesiones y calendario.
- Care: referencia para toda la capa técnica WordPress, conexiones, diagnósticos, plugins, temas, alertas y acciones remotas.

No modificar ni romper esos repositorios durante la reconstrucción.

## Backend destino

Supabase project ref:

`wrkoskqfjuefgrwhymqu`

Nombre actual del proyecto: `Karma Care`.

Este proyecto ya contiene el nuevo esquema `kw_*` de Karma Workspace y conserva las tablas técnicas legacy de Care.

### Core `kw_*`

- `kw_profiles`
- `kw_workspaces`
- `kw_workspace_members`
- `kw_apps`
- `kw_app_modules`
- `kw_clients`
- `kw_projects`
- `kw_project_members`
- `kw_tasks`
- `kw_events`
- `kw_journal_entries`
- `kw_alerts`
- `kw_project_resources`
- `kw_project_panels`

También existen tablas específicas preparadas para los módulos de Work, Social y Care. Inspeccionar el esquema real de Supabase antes de programar y usarlo como fuente de verdad.

### Care legacy

Se mantienen las tablas técnicas actuales, entre otras:

- `sites`
- `installations`
- `diagnostics`
- `plugin_snapshots`
- `theme_snapshots`
- `alerts`
- `audit_log`
- `plan_catalog`
- `site_notes`
- `action_jobs`
- `site_activity`

No eliminarlas ni sustituirlas sin comprobar primero las RPC y el plugin WordPress que dependen de ellas.

## Arquitectura funcional

### Core común

Debe existir UNA implementación compartida de:

- Proyectos
- Tareas
- Diario
- Reuniones/eventos
- CRM
- Alertas
- Recursos/accesos
- Usuarios/permisos
- Detalle de proyecto

### Work

Core +:

- Dashboard de proyectos
- Tareas independientes
- Hitos

Los estados/tipos actuales de Work deben tomarse como referencia funcional, no recrearse a ciegas.

### Social

Core +:

- Calendario
- Gestor de contenido

Social actual es la referencia principal de diseño. Mantener especialmente el patrón de detalle de proyecto: accesos rápidos superiores y contenido principal en bloques/columnas. El calendario debe representar correctamente múltiples eventos el mismo día.

### Care

Core +:

- Técnica
- Conexiones
- Diagnósticos WordPress
- Plugins/temas
- Acciones remotas
- Alertas técnicas

Care debe vincular la nueva entidad de proyecto con la infraestructura técnica existente, no duplicarla.

## Diseño

- Partir de la línea visual de Social actual.
- Sistema de diseño único.
- Componentes reutilizables.
- Navegación coherente entre Work/Social/Care.
- Los paneles rápidos del proyecto cambian por contexto.

Ejemplos:

Social: Accesos / Referencias visuales / Próximo evento / Información.

Care: Accesos / Hosting / Conexiones / Información.

Work: Accesos / Archivos / Próximo hito / Información.

## Restricciones críticas

1. NO migrar datos desde `Karmawebs's Project` todavía.
2. NO modificar el Supabase de producción de Work/Social.
3. NO borrar tablas legacy de Care.
4. NO crear un segundo backend alternativo.
5. NO duplicar el Core por aplicación.
6. Mantener RLS y autenticación de Supabase.
7. No almacenar contraseñas o secretos en texto plano; usar referencias/gestión segura.
8. Antes de cambiar RPC legacy de Care, comprobar cómo las consume el plugin WordPress.

## Estrategia de implementación

1. Auditar repos actuales Work, Social y Care.
2. Auditar esquema real del Supabase destino.
3. Montar shell/navegación común.
4. Implementar autenticación y bootstrap del workspace.
5. Implementar Core compartido.
6. Implementar módulos Work.
7. Implementar módulos Social.
8. Integrar Care técnico existente.
9. Probar CRUD, permisos y relaciones.
10. Dejar preparado un plan de migración, PERO NO ejecutarlo.

## Criterio de finalización

La fase de construcción termina cuando Work, Social y Care funcionan contra Karma Workspace con datos de prueba, sin depender del Supabase antiguo para sus nuevas entidades Core y sin haber migrado los datos reales de producción.

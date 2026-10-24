# Karma Workspace

Nueva base común para las aplicaciones internas de Karma Webs.

## Objetivo

Construir Work, Social y Care sobre un único Core compartido, manteniendo módulos específicos por aplicación.

## Estado

- Supabase destino: proyecto `Karma Care` (`wrkoskqfjuefgrwhymqu`), convertido en base de Karma Workspace.
- El Supabase `Karmawebs's Project` actual NO se modifica y continúa siendo producción para Work/Social.
- NO migrar datos reales todavía.
- Los repositorios actuales de Work, Social y Care son referencias funcionales/visuales para la reconstrucción.

## Core compartido

Todas las apps deben reutilizar el mismo sistema de:

- Proyectos
- Tareas
- Diario
- Reuniones / eventos
- CRM / clientes
- Alertas
- Usuarios y permisos
- Recursos / accesos
- Paneles rápidos de proyecto

## Especialidades

### Work
- Dashboard de proyectos
- Tareas independientes
- Hitos

### Social
- Calendario
- Gestor de contenido

### Care
- Parte técnica
- Conexiones
- Integración con la infraestructura WordPress/diagnósticos existente

## Reglas de construcción

1. No crear tres sistemas independientes.
2. No duplicar tablas Core por aplicación.
3. `app_key` determina el contexto `work`, `social` o `care`.
4. Mantener módulos específicos separados del Core.
5. No migrar datos desde Karma Project hasta que la nueva aplicación esté aprobada.
6. No eliminar ni romper las tablas/RPC técnicas antiguas de Care mientras se reconstruye la interfaz.
7. La UI debe compartir componentes, patrones y navegación.
8. El detalle de proyecto debe admitir paneles rápidos configurables según aplicación.

Ver `WORKSPACE_ARCHITECTURE.md` y `ASTRA_HANDOFF.md` antes de desarrollar.

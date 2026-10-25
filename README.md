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

## Ejecutar la V1

Requiere Node.js 22.12+ (verificado con Node 24).

```sh
npm ci
cp .env.example .env.local
# Completar VITE_SUPABASE_PUBLISHABLE_KEY con una clave sb_publishable_.
npm run dev
```

`npm run build` comprueba TypeScript y genera `dist/`; `npm test` ejecuta pruebas de componentes y lógica. El enrutado usa hash y funciona en hosting estático sin reglas de reescritura. Configurar las URLs autorizadas de Auth al desplegar (origen del sitio y recuperación de contraseña).

`src/core` contiene las entidades, acceso a datos, autenticación, formularios y pantallas comunes. `src/modules` contiene configuración de navegación, dashboard, calendario y consulta técnica de Care. `src/lib` contiene el cliente y tipos generados del esquema real.

La configuración rechaza cualquier backend distinto de `wrkoskqfjuefgrwhymqu` y cualquier clave que no sea pública. Registro, login y recuperación usan Supabase Auth. Crear una cuenta solo genera su perfil: la entrada exige `kw_workspace_members`. El primer propietario se concede de forma administrativa; a partir de ahí puede añadir cuentas confirmadas desde Equipo.

La migración `20261024101724_fix_workspace_membership_recursion.sql` ya está aplicada al destino. Corrige una recursión preexistente mediante funciones privadas que consultan exclusivamente la membresía del usuario autenticado, sin desactivar RLS. El repositorio no contiene el historial anterior completo: no usarlo para reconstruir o reiniciar el backend. `supabase/tests/workspace_rls.sql` verifica Core, módulos y denegación a no miembros en una transacción que revierte sus escrituras.

Care permite vincular `kw_care_sites.legacy_site_id` a un sitio existente y consultar diagnóstico, conexión, plugins, temas, alertas e historial de acciones. No modifica emparejamiento, instalaciones, RPC ni Edge Functions legacy. Las acciones remotas siguen en Care actual hasta revisar la autorización de `enqueue_care_action`.

## Cloudflare Workers

Producción de pruebas desde `main`: build `npm run build`, deploy `npx wrangler deploy`, raíz `/`. `wrangler.jsonc` publica `dist` con fallback SPA y conserva workers.dev y el Custom Domain `workspace.karmawebs.com`.

Configurar `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` en **Builds → Production → Variables and secrets**. Vite incorpora estos valores al JavaScript al compilar; las variables runtime del Worker no los sustituyen. La clave debe pertenecer al proyecto autorizado. El build valida tanto la configuración como su aceptación por Supabase Auth antes de generar assets; requiere conexión al backend. Nunca usar una clave privada/service-role.

# Social — Google Drive: plan de implementación (rama feature/social-google-drive)

## Estado
Preparación técnica. No hay OAuth ni conexión real todavía. No desplegar a main hasta validar permisos, pruebas y experiencia.

## Objetivo
Usar Drive como biblioteca principal de medios por proyecto Social, manteniendo el editor actual y el bucket privado social-media para compatibilidad y staging de publicación.

## Arquitectura
- UI: explorador Drive dentro de SocialMediaPicker; navegación por carpetas, búsqueda, selección múltiple, orden y portada. Mantener selector local existente.
- Backend: Edge Functions autenticadas para OAuth y consultas Drive; tokens y refresh token exclusivamente en servidor (Vault/almacenamiento cifrado, nunca en cliente ni kw_connections sin cifrar).
- OAuth: flujo Google OAuth 2.0 con state ligado a sesión, PKCE cuando corresponda, callback autorizado, scope mínimo necesario. Distinguir la conexión OAuth de ChatGPT de la conexión propia de Workspace.
- Datos: conexión Drive por workspace; carpeta raíz por proyecto; referencia por publicación a Drive file id, nombre, mime, versión (md5Checksum o revision/headRevisionId si disponible), tamaño, orden y portada. Reutilizar columnas drive_file_id y drive_url de kw_content_files solo después de revisar restricciones actuales que exigen storage_path y originales.
- Seguridad: acceso de empleados por membresía interna; nunca permitir que cliente externo herede kw_is_workspace_member. RLS específica por proyecto para el futuro portal, sin lectura de tokens ni acceso a carpetas arbitrarias.
- Previews: proxy autenticado o URLs de acceso corto desde backend. No almacenar enlaces de descarga públicos como fuente de verdad.
- Publicación: en el momento de preparar el job, comprobar que la versión seleccionada no cambió; copiar a staging privado con retención y limpieza programada. Los medios de Meta deben cumplir formato/tamaño de API. No depender de enlaces compartidos de Drive.
- Resiliencia: paginación de archivos, rate limits 429, refresh token revocado, carpeta movida, archivo eliminado, acceso denegado y caducidad de preview.

## Orden de implementación
1. Auditar SQL de kw_content_files, kw_content_items y RLS, y el selector actual.
2. Añadir esquema de conexiones/carpeta por proyecto con migración reversible, sin tocar datos existentes.
3. Implementar OAuth servidor y revocación; pruebas de state, aislamiento y secretos.
4. Explorador Drive en Social, selector de archivos y previsualización.
5. Persistencia atómica de selección, versión y orden en el editor.
6. Pruebas UI, SQL con rollback, permisos entre workspaces y regresión Work/Care.
7. Conectar staging y Meta en su fase específica.

## Bloqueos previos a conexión real
- Crear/configurar proyecto Google Cloud OAuth para la aplicación Karma Workspace; consent screen, redirect URI real y scopes aprobados.
- Confirmar cuenta Google propietaria de la biblioteca y estructura de carpetas.
- Ejecutar npm run build y npm run test en checkout de la rama.

## No hacer
No colocar client_secret ni refresh_token en VITE_*; no compartir carpetas públicamente; no conceder rol de miembro interno a clientes externos; no reescribir archivos originales; no modificar el Supabase legacy vjsmsekbsjngdtuxfbmu.

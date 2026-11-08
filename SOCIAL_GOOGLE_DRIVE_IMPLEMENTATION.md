# Google Drive en Social

Desde el editor de un proyecto, abre **Google Drive**, conecta la cuenta y selecciona una raíz en **Elegir carpeta**. La autorización se abre en otra ventana para conservar el borrador. Después de vincular la raíz, puedes navegar, seleccionar e importar JPG, PNG, WebP, MP4 y MOV de hasta 50 MiB por archivo. El guardado continúa mediante la reserva, la subida privada y la operación atómica del editor. Una publicación guardada conserva su copia al desconectar Drive.

## Acceso

La cuenta y la raíz se vinculan por proyecto. Solo los roles owner y admin del workspace pueden acceder a esta integración. La RLS actual de Core permite que cualquier miembro modifique las asignaciones de equipo. Usarlas como autorización permitiría autoasignarse. Solo el usuario que autorizó Google puede explorar su cuenta para elegir la raíz. El resto de las consultas comprueba la ascendencia del ID solicitado. Las copias importadas heredan los permisos existentes del Media Manager de Social.

El callback del navegador devuelve un código de un solo uso al servidor autenticado. El servidor comprueba proyecto, usuario, sesión, state, expiración de diez minutos y PKCE S256. El intercambio, el cifrado AES-256-GCM asociado al proyecto y la renovación se realizan en Edge. Reautorizar sustituye la credencial y borra la vinculación anterior en una transacción. Desconectar invalida solicitudes pendientes y elimina la credencial y la raíz del proyecto. La revocación global en Google puede afectar a otros proyectos vinculados con la misma cuenta y se gestiona desde la cuenta Google.

## Ensayo local pendiente

Google Cloud confirmó la URI de prueba `http://localhost:5173/social/drive/callback` para el cliente web Karma Workspace - Google Drive. El proyecto karma-workspace muestra drive.readonly y la cuenta de Dani como usuario de prueba.

En el archivo local ignorado `supabase/functions/.env.local`, Dani debe completar GOOGLE_OAUTH_CLIENT_SECRET mediante su gestor de contraseñas. El ID público, WORKSPACE_ORIGIN y una clave local SOCIAL_DRIVE_ENCRYPTION_KEY de 32 bytes en base64 ya se prepararon en este equipo. La clave debe conservarse mientras se utilicen credenciales cifradas con ella. Ninguna variable privada lleva prefijo VITE_.

Para el ensayo integral se necesita una instancia local de Supabase con el esquema de Workspace, el bucket y las RPC de Social, dos proyectos sintéticos y un usuario owner. El repositorio solo contiene parte del historial remoto de Core. Usar un esquema de prueba sin datos de clientes. Servir las funciones localmente con el archivo de entorno anterior. Configurar el frontend en `.env.development.local` con la URL local `http://127.0.0.1:54321` y la clave pública local. Abrir Vite en `http://localhost:5173`. El build sigue exigiendo el proyecto autorizado.

Comprobar con la cuenta de prueba el consentimiento, la elección de raíz, el rechazo de un ID de la otra raíz, la importación de una imagen y un vídeo y la reapertura de la publicación guardada. Revocar el acceso en la cuenta Google de prueba para comprobar la reautorización. La prueba debe usar una cuenta sin otras conexiones que dependan del mismo consentimiento.

## Verificación de la rama

- Vitest incluye validación del callback, consumo único en navegador, importación de vídeo y restricción del backend de pruebas.
- Deno ejecuta los tres handlers con transporte simulado para Auth, PostgREST y Google. Comprueba autenticación, rol, PKCE, state, repetición, cifrado, renovación, rechazo de una raíz distinta, vídeo y revocación.
- La migración se ejecutó en PostgreSQL embebido con un esquema Core mínimo y roles de prueba. Se comprobaron privilegios de navegador, vínculo cruzado, sustitución y borrado de credenciales.
- La migración Drive sigue pendiente en el proyecto autorizado. Las únicas Edge Functions remotas observadas fueron care-agent y social-media-cleanup. Los identificadores históricos de varias migraciones de Care difieren entre el repositorio y el historial remoto. Evitar aplicar el historial en bloque.

Resultado local del 8 de noviembre de 2026. Build TypeScript/Vite correcto. Vitest pasó 62 de 66 pruebas, incluidas las cuatro nuevas de Drive. Los cuatro fallos de flows.test.tsx corresponden a flujos ya documentados de proyecto, archivo, tarea y evento. Pasaron el escenario Deno de los tres handlers y las comprobaciones SQL aisladas. El consentimiento real y el guardado de una publicación con datos procedentes de Google quedan pendientes.

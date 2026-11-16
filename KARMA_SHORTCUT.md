# Nueva tarea Karma

Endpoint: `POST https://karma-task-shortcut.infokarmawebs.workers.dev/tasks`

Cloudflare Worker independiente del sitio; no cambia su enrutado ni sus assets.
Atajos utiliza un bearer aleatorio de 256 bits, limitado a esta operación. Cloudflare
solo conserva su SHA-256 como secret y envía una credencial interna diferente a la
Edge Function `karma-shortcut`. Su hash vive en Supabase Secrets. La service role
preexistente se usa exclusivamente dentro de la Edge Function, tras autenticar la
credencial interna. Nunca se devuelve ni se copia al Worker o al atajo.

El destino está fijado en servidor: workspace `a2f2782b-0d3a-4d3e-8e5b-faadd94b756f`,
proyecto `b4542e33-c58f-49b1-8e1f-44ac65035cc3`, app `karma`. Se comprueba que siga
siendo el proyecto interno activo. Se inserta en `kw_tasks` sin sustituir los defaults
de PostgreSQL: pending, normal, sin responsable ni vencimiento. No se añaden tablas
ni se cambian políticas RLS. Realtime publica `kw_tasks` con las políticas existentes;
solo el listado de tareas de Karma incorpora la suscripción y refresco al recuperar foco.

## Configuración en Atajos de macOS

Crear un atajo llamado **Nueva tarea Karma** con estas acciones, por orden:

1. **Solicitar entrada**: tipo Texto; pregunta `¿Qué tarea quieres añadir?`;
   respuesta predeterminada vacía; desactivar varias líneas si aparece esa opción.
2. **Obtener contenido de URL**: URL del endpoint anterior; método **POST**.
   En Cabeceras: `Authorization` = `Bearer TOKEN_PERSONAL` (un espacio después de
   Bearer) y `Content-Type` = `application/json`. En Cuerpo de la solicitud elegir
   **JSON**; añadir campo **Texto** con clave `title` y valor variable **Entrada
   proporcionada** de la primera acción. No escribir la variable como texto literal.
3. **Obtener valor del diccionario**: clave `ok` del resultado anterior.
4. **Si** ese valor es verdadero: **Mostrar notificación**, texto
   `Tarea añadida a Karma`, título `Karma`.
5. **Si no**: **Mostrar notificación**, texto `No se pudo añadir la tarea. Revisa
   la conexión, el título y la credencial.`, título `Karma`. Cerrar el bloque Si.

La condición evita notificar éxito cuando un servidor devuelve JSON de error.
Un fallo de transporte puede detener la ejecución antes de llegar a la notificación.
Aceptar el acceso al dominio cuando Atajos lo solicite. El título debe tener 1–300
caracteres en una sola línea. JSON se genera con el editor nativo, no concatenando texto.

Desde la app: pulsar Ejecutar. Para el widget: clic secundario en el escritorio →
Editar widgets → Atajos; añadir el widget y seleccionar **Nueva tarea Karma** en
Editar widget. Para teclado: abrir el atajo → Detalles ⓘ → Añadir atajo de teclado;
asignar una combinación libre, por ejemplo Control–Opción–Comando–K.

Referencias Apple: [widgets](https://support.apple.com/es-es/guide/shortcuts-mac/apd029b36d05/mac)
y [teclado](https://support.apple.com/es-es/guide/shortcuts-mac/-apd163eb9f95/mac).

## Operación y revocación

- No compartir/exportar el atajo con el token incorporado. Atajos no es un almacén
  de credenciales: el token puede leerlo quien tenga acceso al editor del atajo.
- Para revocar: eliminar `KARMA_SHORTCUT_TOKEN_HASH` de los secrets del Worker.
  Para rotar: generar 32 bytes aleatorios, guardar solo su hash SHA-256 en ese
  secret y sustituir el bearer del atajo. No hace falta cambiar Supabase.
- Credencial interna: rotar `KARMA_SHORTCUT_BACKEND_TOKEN` en Cloudflare y su
  hash `KARMA_SHORTCUT_BACKEND_HASH` en Supabase. Nunca usar el bearer del atajo aquí.
- El Worker limita aproximadamente a 10 solicitudes válidas por minuto y ubicación
  de Cloudflare. Las credenciales incorrectas no consumen ese cupo.
- No hay reintentos automáticos: si se pierde la respuesta después del INSERT,
  comprobar Karma antes de reenviar para evitar duplicados.
- Los logs solo incluyen código HTTP o tipo de error; no títulos ni tokens.
- Desplegar Worker: `wrangler deploy --config workers/karma-shortcut/wrangler.jsonc`.
  Cargar secrets con `wrangler secret bulk` desde un archivo privado fuera del repo.
  Desplegar Edge Function con verify_jwt=false: autentica su propia credencial.
- Pruebas HTTP: `node --test tests/shortcut/http.test.mjs`. Frontend: `npm test`
  y `npm run build`. Rollback: retirar Worker/Edge y revertir el hook; no borrar tareas.

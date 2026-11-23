# Texto enriquecido compartido

## Implementación

`src/components/rich-text` contiene un único editor y visor. Tiptap/ProseMirror
aporta selección, historial de deshacer, IME, listas y pegado; no se utiliza una
interfaz externa ni `execCommand`. Versiones fijadas en package-lock. Solo se
habilitan párrafos, saltos, negrita, cursiva, subrayado, listas y enlaces.

La barra compacta permanece disponible también con teclado/táctil. Cmd/Ctrl+K
abre el control de enlaces sin perder la selección. Permite añadir, cambiar,
quitar y abrir. Los enlaces del contenido se abren con noopener/noreferrer.

Se conservan las columnas TEXT y los flujos existentes de FormData/saveRow/RPC.
Los valores nuevos con formato llevan `<!--karma-rich-text:v1-->` y HTML limitado.
Los textos sin esta marca se interpretan literalmente, incluidos `<tags>`, y no
se reescriben al abrir/cerrar o guardar sin modificaciones. Las URLs antiguas
se enlazan al visualizar, sin escrituras masivas. Las búsquedas y extractos usan
texto legible. La eliminación explícita de un enlace se conserva con una marca
interna permitida `span[data-karma-unlinked=true]`, para que no vuelva a enlazarse.

El sanitizador reconstruye nodos permitidos y no copia atributos arbitrarios.
Excluye scripts, estilos, imágenes, iframes, SVG, eventos y protocolos ajenos a
HTTP(S); rechaza URLs con credenciales o controles. Se aplica al pegar, guardar
y visualizar. No hay cambios de esquema, RLS, Auth, Storage, secretos ni legacy.

## Auditoría de campos

| Área | Aplicación |
| --- | --- |
| Core Work/Social/Care/Karma | Descripciones de proyectos, tareas, reuniones/eventos e hitos; diario; notas CRM; mensajes de alertas manuales |
| Diario de proyectos | Composición, historial, extractos y edición de entradas guardadas |
| Care | Descripción del alta de proyecto; resto mediante Core compartido |
| Social | Biblioteca/documentación y notas internas del gestor; vistas de descripción |
| Karma | Notas de contactos internos y tareas mediante Core |
| Portal | Visor seguro de copy, comentarios y notas compartidas con enlaces automáticos |

## Excepciones deliberadas

- **Copy de Social**: mantiene texto plano porque se envía literalmente a Instagram
  y participa en límites y validaciones de publicación. Incluye una vista previa
  desplegable con enlaces clicables; el portal también los muestra.
- **Comentarios de revisión/respuestas del portal**: siguen planos porque su contrato
  de 4.000 caracteres se comparte con RPC, notificaciones y correo. Los visores
  detectan enlaces. No se modifica el envío de notificaciones.
- **Notas del almacén de credenciales**: mantienen su payload cifrado y sus lectores
  actuales; el visor de notas compartidas reconoce enlaces. Usuario, contraseña,
  URL, nombres, títulos, checklists y subtítulos cortos siguen siendo campos simples.
- **Diagnósticos y mensajes técnicos legacy de Care**: solo lectura y protocolo
  externo; no se convierten ni se reescriben.

## Verificación

- Suite Vitest completa (121 pruebas): pruebas de formato, XSS/protocolos, URLs múltiples,
  conservación exacta de datos heredados, validación, reset, atajos, eliminación
  persistente y guardado de tarea a través del flujo existente con adjuntos.
- Chrome real headless: selección, pegado plano/HTML, varios enlaces, edición y
  borrado de enlaces, Cmd/Ctrl+K, guardado/reapertura, negrita, apertura segura y
  vistas 1440/768/390/320 sin overflow. Fixture `tests/browser/rich-text.html`.
- Runner reproducible `tests/browser/rich-text.mjs`: ejecutar con Playwright
  disponible, Chrome instalado y `npm run dev`. `QA_BASE_URL` permite cambiar
  el servidor y `QA_SCREENSHOT_DIR` el destino de capturas. No forma parte del
  bundle de producción ni añade Playwright como dependencia de la aplicación.
- Pruebas frontend con backend simulado; no se escriben fixtures en Supabase ni
  se envían notificaciones/publicaciones reales. Falta prueba física con teclado
  de iPhone/iPad; los tamaños móviles no sustituyen esa comprobación.

El motor añade aproximadamente 100–120 kB gzip al módulo de aplicación; se acepta
para no implementar desde cero selección, undo/redo y compatibilidad de edición.
El visor del portal no importa el motor de edición. Vite avisa del chunk grande
existente de App; el build completa correctamente. No se cambia la configuración
de bundling o despliegue de otras áreas.

Despliegue verificado: commit `a5ba86b`, Cloudflare versión
`b318746b-60b5-4dac-8dbb-dab6b866065d`. El dominio público sirve el mismo HTML y
bundle App que el build local (SHA-256 idéntico). El check global de formato
señala 55 archivos, igual que la base previa; los archivos nuevos pasan Prettier.

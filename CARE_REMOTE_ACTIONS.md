# Care — Acciones remotas 0.8.0

## Contrato

- `enqueue_workspace_care_action(p_care_site_id,p_action_type,p_target)` exige auth.uid(), Workspace miembro, proyecto `app_key='care'`, bridge coherente, instalación conectada >=0.8.0 y actualización en el último diagnóstico. Solo un target real por plugin/tema; Core no recibe target. Índice parcial único evita carreras y cualquier segundo job pending/running del sitio.
- `cancel_workspace_care_action(p_action_id)` solo cancela pending del Workspace autorizado. El navegador no escribe directamente action_jobs ni installations; nunca recibe api_token.
- `care-agent` mantiene los seis mensajes del protocolo plugin. wake requiere un JWT validado y pertenencia al sitio; no acepta site_id como autorización. No contacta el sitio sin un job pendiente. verify_jwt=false es intencional para el protocolo basado en credencial de instalación.
- Los vínculos legacy no se pueden reasignar desde el CRUD público; se crean con pairing. El dominio de wake procede del servidor y se exige HTTPS público, con redirects deshabilitados.

## Verificación reproducible

- `npm run build` (incluye TypeScript y comprobación de configuración).
- `npx vitest run tests/care-actions.test.tsx`: siete pruebas de confirmación, cancelación, targets, fallo de autorización/wake, agentes antiguos y estados de rollback.
- `node scripts/test-care-agent.mjs`: manejador Edge aislado, usuario ausente/inválido/ajeno, proyecto incorrecto, sin job, propietario y protocolo plugin.
- `supabase/tests/care_remote_actions.sql`: ejecutar administrativamente solo en wrkoskqfjuefgrwhymqu. Crea fixtures y jobs en una transacción y revierte todo; no usa HTTP, wake ni sitios reales.
- Plugin: pruebas separadas con actualizadores reales de WordPress, PHP 7.4/8.3 y paquetes locales. El transporte de salud y Supabase usa fixtures. Ver repositorio del plugin.

La suite general tiene cuatro fallos anteriores al cambio, reproducidos también en main limpio 24104eb; ninguna prueba nueva falla. Advisors ya no muestra funciones SECURITY DEFINER ejecutables por anon. Las tres advertencias de funciones accesibles a authenticated corresponden a pairing/enqueue/cancel, deliberadamente expuestas con validación de membresía. Persisten dos funciones legacy de etiquetas con search_path mutable y la protección de contraseñas filtradas desactivada: no se cambiaron ajustes Auth ajenos al alcance. [Advisor y explicación](https://supabase.com/docs/guides/database/database-linter).

## Instalación / primera prueba

Instalar el ZIP Karma Care 0.8.0 sobre la misma carpeta del plugin y pulsar **Sincronizar ahora**. Verificar versión 0.8.0 en el Área técnica. Es necesario un directorio privado escribible fuera del document root (predeterminado en el padre de ABSPATH; se puede definir KARMA_CARE_BACKUP_DIR). Después elegir un único plugin y confirmar manualmente su actualización. Se conserva el pairing actual; por la exposición previa de installations, es recomendable reconectar una vez para sustituir el token antiguo.

No se instaló el plugin ni se ejecutaron actualizaciones en karmawebs.com durante el desarrollo. Cero jobs activos al verificar la entrega.

## Límites del rollback

Se restauran archivos y activación, se comprueba la salud y se conserva la copia si la recuperación falla. No es un backup transaccional de la base de datos ni revierte efectos externos de plugins. Mantener una copia completa del hosting/BD. Si un cierre abrupto deja WordPress sin capacidad de arrancar, la recuperación requiere el panel del hosting/SFTP. Fallos de red al notificar resultados se reintentan sin repetir la actualización.

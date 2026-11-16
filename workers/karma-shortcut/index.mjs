import { endpoint, reply } from '../../supabase/functions/karma-shortcut/http.mjs';
export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname !== '/tasks') return reply(404, { ok: false, error: 'No encontrado.' });
    if (!env.KARMA_SHORTCUT_BACKEND_TOKEN || !env.RATE_LIMITER) return reply(503, { ok: false, error: 'Integración no disponible.' });
    return endpoint(env.KARMA_SHORTCUT_TOKEN_HASH, async title => {
      const { success } = await env.RATE_LIMITER.limit({ key: 'karma-shortcut' });
      if (!success) return reply(429, { ok: false, error: 'Demasiadas solicitudes. Espera un minuto.' });
      const response = await fetch('https://wrkoskqfjuefgrwhymqu.supabase.co/functions/v1/karma-shortcut', {
        method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Bearer ${env.KARMA_SHORTCUT_BACKEND_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      if (response.status !== 201) {
        console.error('Karma backend HTTP status', response.status);
        return reply(503, { ok: false, error: 'No se pudo confirmar la creación de la tarea.' });
      }
      const result = await response.json();
      if (result.ok !== true || typeof result.id !== 'string') throw new Error('Invalid backend response');
      return reply(201, { ok: true, id: result.id, status: result.status });
    })(request);
  },
};

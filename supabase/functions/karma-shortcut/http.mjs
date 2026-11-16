export const reply = (status, data) => Response.json(data, {
  status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
});

export async function authorized(request, expectedHash) {
  if (!/^[a-f0-9]{64}$/.test(expectedHash || '')) return false;
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.get('Authorization') || '');
  if (!match) return false;
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(match[1])));
  let difference = 0;
  for (let i = 0; i < 32; i++) difference |= digest[i] ^ parseInt(expectedHash.slice(i * 2, i * 2 + 2), 16);
  return difference === 0;
}

export async function readTitle(request) {
  if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json')
    throw { status: 415, message: 'Se requiere JSON.' };
  const reader = request.body?.getReader();
  if (!reader) throw { status: 400, message: 'Falta el título.' };
  const chunks = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 4096) { await reader.cancel(); throw { status: 413, message: 'Solicitud demasiado grande.' }; }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let data;
  try { data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw { status: 400, message: 'JSON inválido.' }; }
  if (!data || Array.isArray(data) || typeof data !== 'object' || Object.keys(data).some(key => key !== 'title') || typeof data.title !== 'string')
    throw { status: 400, message: 'Envía únicamente title como texto.' };
  const title = data.title.trim();
  if (!title || title.length > 300 || /[\u0000-\u001f\u007f]/.test(title))
    throw { status: 400, message: 'El título debe tener entre 1 y 300 caracteres, en una sola línea.' };
  return title;
}

export function endpoint(hash, createTask) {
  return async request => {
    if (request.method !== 'POST') return reply(405, { ok: false, error: 'Método no permitido.' });
    if (!hash) return reply(503, { ok: false, error: 'Integración no disponible.' });
    if (!await authorized(request, hash)) return reply(401, { ok: false, error: 'No autorizado.' });
    try {
      const title = await readTitle(request);
      return await createTask(title);
    } catch (error) {
      const status = [400, 413, 415].includes(error?.status) ? error.status : 503;
      if (status === 503) console.error('Karma integration failure type', error?.name || 'Unknown');
      return reply(status, { ok: false, error: status === 503 ? 'No se pudo confirmar la creación de la tarea.' : error.message });
    }
  };
}

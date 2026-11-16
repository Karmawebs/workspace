import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { endpoint, reply } from '../../supabase/functions/karma-shortcut/http.mjs';
import worker from '../../workers/karma-shortcut/index.mjs';
const token = 'a'.repeat(43), hash = createHash('sha256').update(token).digest('hex');
const request = (body, auth = token, type = 'application/json') => new Request('https://example.com/tasks', {
  method: 'POST', headers: { Authorization: `Bearer ${auth}`, 'Content-Type': type }, body: JSON.stringify(body),
});
test('rejects missing/wrong credentials without invoking storage', async () => {
  let calls = 0;
  const handler = endpoint(hash, () => { calls++; });
  for (const auth of ['', 'b'.repeat(43), 'a']) assert.equal((await handler(request({title:'Test'}, auth))).status, 401);
  assert.equal(calls, 0);
});
test('fails closed when unconfigured and rejects GET', async () => {
  assert.equal((await endpoint(undefined, () => {})(request({title:'Test'}))).status, 503);
  assert.equal((await endpoint(hash, () => {})(new Request('https://example.com'))).status, 405);
});
test('rejects invalid titles and scope injection before storage', async () => {
  let calls = 0;
  const handler = endpoint(hash, () => { calls++; });
  for (const body of [null, [], {}, { title: 1 }, {title:' '}, {title:'a'.repeat(301)}, {title:'a\nb'}, {title:'ok',project_id:'other'}, {title:'ok',status:'done'}])
    assert.equal((await handler(request(body))).status, 400);
  assert.equal(calls, 0);
});
test('enforces media type, malformed JSON and streamed byte limit', async () => {
  const handler = endpoint(hash, () => { throw Error('must not run'); });
  assert.equal((await handler(request({title:'a'}, token, 'text/plain'))).status, 415);
  assert.equal((await handler(request({title:'a'.repeat(5000)}))).status, 413);
  assert.equal((await handler(new Request('https://example.com', {method:'POST', headers:{Authorization:`Bearer ${token}`, 'Content-Type':'application/json'}, body:'{'}))).status, 400);
});
test('trims title, returns confirmed id, hides internal errors', async () => {
  const result = await endpoint(hash, title => { assert.equal(title, 'Comprar café ☕'); return reply(201, {ok:true,id:'test'}); })(request({title:'  Comprar café ☕  '}));
  assert.equal(result.status, 201); assert.equal(result.headers.get('cache-control'), 'no-store');
  const failure = await endpoint(hash, () => {throw new Error('private credential');})(request({title:'Test'}));
  assert.equal(failure.status, 503); assert.ok(!(await failure.text()).includes('private credential'));
});
test('worker enforces rate limit before contacting backend', async () => {
  const env = {KARMA_SHORTCUT_TOKEN_HASH:hash,KARMA_SHORTCUT_BACKEND_TOKEN:token,RATE_LIMITER:{limit:async()=>({success:false})}};
  assert.equal((await worker.fetch(request({title:'Test'}), env)).status, 429);
});
test('worker sends only title and separate backend credential; never reports backend failures as success', async () => {
  const original = globalThis.fetch;
  const env = {KARMA_SHORTCUT_TOKEN_HASH:hash,KARMA_SHORTCUT_BACKEND_TOKEN:'b'.repeat(43),RATE_LIMITER:{limit:async()=>({success:true})}};
  try {
    globalThis.fetch = async (url, options) => {
      assert.ok(url.includes('wrkoskqfjuefgrwhymqu.supabase.co'));
      assert.equal(options.headers.Authorization, `Bearer ${env.KARMA_SHORTCUT_BACKEND_TOKEN}`);
      assert.deepEqual(JSON.parse(options.body), {title:'Test'});
      return reply(201, {ok:true,id:'created',status:'pending'});
    };
    assert.equal((await worker.fetch(request({title:'Test'}), env)).status, 201);
    globalThis.fetch = async () => reply(500, {error:'private'});
    assert.equal((await worker.fetch(request({title:'Test'}), env)).status, 503);
  } finally {globalThis.fetch = original;}
});

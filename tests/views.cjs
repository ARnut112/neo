const test = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/views.js');

test('counter API permissions, configuration, credentials and upstream failures', async () => {
  const names = ['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'VERCEL_ENV'];
  const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const originalFetch = global.fetch;
  let calls = [];
  let upstream = new Response('42');
  global.fetch = async (url, options) => { calls.push({ url, options }); return upstream; };
  async function invoke(method = 'POST', headers = {}) {
    const res = { headers: {}, code: 200, setHeader(k,v) { this.headers[k]=v; }, status(c) {this.code=c; return this;}, json(v) {this.body=v; return this;}, end() {return this;} };
    await handler({ method, headers: { host: 'portfolio.example', ...headers } }, res);
    return res;
  }
  try {
    names.forEach(name => delete process.env[name]);
    assert.equal((await invoke('GET')).code, 405);
    assert.equal((await invoke('POST', {origin:'https://other.example'})).code, 403);
    assert.equal((await invoke('POST', {'sec-fetch-site':'cross-site'})).code, 403);
    assert.equal((await invoke()).code, 503);
    process.env.VERCEL_ENV = 'preview';
    assert.equal((await invoke()).code, 204);
    assert.equal(calls.length, 0);
    process.env.VERCEL_ENV = 'production';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';
    let res = await invoke('POST', {origin:'https://portfolio.example'});
    assert.equal(res.code, 200);
    assert.deepEqual(res.body, {views:'42'});
    assert.equal(res.headers['Cache-Control'], 'no-store');
    assert.equal(calls[0].url.href, 'https://test.supabase.co/rest/v1/rpc/increment_page_views');
    assert.equal(calls[0].options.headers.apikey, 'sb_secret_test');
    assert.equal(calls[0].options.headers.Authorization, undefined);
    delete process.env.SUPABASE_SECRET_KEY;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'legacy-test';
    upstream = new Response('9007199254740993');
    res = await invoke();
    assert.equal(res.body.views, '9007199254740993');
    assert.equal(calls[1].options.headers.Authorization, 'Bearer legacy-test');
    upstream = new Response('private database error', {status:401});
    res = await invoke();
    assert.equal(res.code, 502);
    assert.equal(JSON.stringify(res.body).includes('private'), false);
    upstream = new Response('null');
    assert.equal((await invoke()).code, 503);
    const before = calls.length;
    global.fetch = async () => { calls.push({}); throw new Error('timeout'); };
    assert.equal((await invoke()).code, 503);
    assert.equal(calls.length, before + 1, 'never retry a possibly committed increment');
  } finally {
    global.fetch = originalFetch;
    names.forEach(name => { if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name]; });
  }
});

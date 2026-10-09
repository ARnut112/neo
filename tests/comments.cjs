const test = require('node:test');
const assert = require('node:assert/strict');
const comments = require('../api/comments');
const authentication = require('../api/comment-auth');
const helpers = require('../lib/comments-server');

test('moderated comments and PKCE authentication', async () => {
  const keys = ['SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'COMMENTS_SITE_URL', 'VERCEL_ENV'];
  const saved = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  const originalFetch = global.fetch;
  const person = { id: '11111111-1111-4111-8111-111111111111', email_confirmed_at: '2026-01-01', email: 'private@example.com', identities: [{ provider:'google', identity_data:{name:'Viewer', picture:'https://lh3.googleusercontent.com/test'} }] };
  const token = 'test-token-abcdefghijklmnop';
  let requests = [];
  let queue = [];
  global.fetch = async (url, options) => { requests.push({url: new URL(url), options}); const value = queue.shift(); if (!value) throw new Error('Unexpected request'); return value; };
  async function call(fn, method, body, headers = {}, url = '/') {
    const res = { headers:{}, statusCode:200, setHeader(k,v){this.headers[k]=v;}, status(n){this.statusCode=n;return this;}, json(v){this.body=v;return this;}, end(){return this;} };
    await fn({method,body,url,headers:{origin:'https://site.example','content-type':'application/json',...headers}},res);
    return res;
  }
  try {
    process.env.SUPABASE_URL='https://example.supabase.co';
    process.env.SUPABASE_SECRET_KEY='sb_secret_test';
    process.env.COMMENTS_SITE_URL='https://site.example';
    process.env.VERCEL_ENV='preview';
    queue.push(new Response(JSON.stringify([{id:'1',display_name:'A',message:'Approved',avatar_url:'https://evil.example/x',created_at:'today'}])));
    let res=await call(comments,'GET');
    assert.equal(res.statusCode,200);
    assert.equal(requests.at(-1).url.searchParams.get('status'),'eq.approved');
    assert.equal(requests.at(-1).url.searchParams.get('channel'),'eq.preview');
    assert.equal(res.body.comments[0].avatar,null);
    assert(!requests.at(-1).url.searchParams.get('select').includes('user_id'));
    assert.equal((await call(comments,'POST',{message:'Hello',consent:true},{origin:'https://evil.example'})).statusCode,403);
    assert.equal((await call(comments,'POST',{message:'Hi',consent:true})).statusCode,400);
    assert.equal((await call(comments,'POST',{message:'Hello',consent:false})).statusCode,400);
    assert.equal((await call(comments,'POST',{message:'Hello',consent:true})).statusCode,401);
    queue.push(new Response(JSON.stringify(person)),new Response(null,{status:201}));
    res=await call(comments,'POST',{message:'Nice photos',consent:true,status:'approved',user_id:'forged',display_name:'forged'},{cookie:`${helpers.SESSION}=${token}`});
    assert.equal(res.statusCode,201);
    const inserted=JSON.parse(requests.at(-1).options.body);
    assert.equal(inserted.status,'pending'); assert.equal(inserted.user_id,person.id); assert.equal(inserted.display_name,'Viewer');
    assert.equal(requests.at(-2).options.headers.Authorization,`Bearer ${token}`);
    assert.equal(requests.at(-1).options.headers.Authorization,undefined);
    queue.push(new Response(JSON.stringify(person)),new Response('{}',{status:409}));
    assert.equal((await call(comments,'POST',{message:'Again',consent:true},{cookie:`${helpers.SESSION}=${token}`})).statusCode,429);
    queue.push(new Response('{}',{status:401}));
    assert.equal((await call(comments,'POST',{message:'Again',consent:true},{cookie:`${helpers.SESSION}=${token}`})).statusCode,401);
    queue.push(new Response('{}',{status:500}));
    assert.equal((await call(comments,'GET')).statusCode,503);
    res=await call(authentication,'POST',{action:'login'});
    assert.equal(res.statusCode,200);
    const cookie=res.headers['Set-Cookie'];
    assert(cookie.includes('HttpOnly; Secure; SameSite=Lax'));
    const verifier=cookie.split(';')[0].split('=')[1];
    const redirect=new URL(res.body.url);
    assert.equal(redirect.searchParams.get('provider'),'google');
    assert.equal(redirect.searchParams.get('redirect_to'),'https://site.example/api/comment-auth');
    assert.equal(redirect.searchParams.get('code_challenge'),require('node:crypto').createHash('sha256').update(verifier).digest('base64url'));
    assert(!JSON.stringify(res.body).includes('sb_secret'));
    const before=requests.length;
    res=await call(authentication,'GET',null,{},'/api/comment-auth?code=stolen');
    assert.equal(requests.length,before); assert(res.headers.Location.includes('failed'));
    queue.push(new Response(JSON.stringify({access_token:token,expires_in:3600,refresh_token:'must-not-return'})));
    res=await call(authentication,'GET',null,{cookie:`${helpers.PKCE}=${verifier}`},'/api/comment-auth?code=valid');
    assert.equal(res.statusCode,303); assert.equal(res.headers.Location,'https://site.example/#comments');
    assert.equal(JSON.parse(requests.at(-1).options.body).code_verifier,verifier);
    assert(res.headers['Set-Cookie'].some(c=>c.includes(`${helpers.SESSION}=${token}`)));
    assert.equal(res.body,undefined);
    queue.push(new Response(JSON.stringify(person)));
    res=await call(authentication,'GET',null,{cookie:`${helpers.SESSION}=${token}`});
    assert.equal(res.body.user.name,'Viewer'); assert(!JSON.stringify(res.body).includes('private@example.com'));
    res=await call(authentication,'POST',{action:'logout'});
    assert(res.headers['Set-Cookie'].every(c=>c.includes('Max-Age=0')));
    assert.equal((await call(authentication,'POST',{action:'login'},{origin:'https://evil.example'})).statusCode,403);
  } finally {
    global.fetch=originalFetch;
    keys.forEach(k=>{if(saved[k]===undefined) delete process.env[k]; else process.env[k]=saved[k];});
  }
});

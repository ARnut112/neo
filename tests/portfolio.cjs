'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const management = require('../api/admin-photos');
const login = require('../api/admin-auth');
const gallery = require('../api/portfolio');
const portfolio = require('../lib/portfolio-server');
const jpeg = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAQACADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDoaKKK+LPZCiiigD//2Q==';

test('portfolio access, upload lifecycle, moderation of visibility and admin OAuth', async () => {
  const envKeys = ['SUPABASE_URL','SUPABASE_SECRET_KEY','COMMENTS_SITE_URL','VERCEL_ENV'];
  const saved = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  const originalFetch = global.fetch, originalError = console.error;
  const token = 'admin-token-abcdefghijklmnop';
  const person = { id: '11111111-1111-4111-8111-111111111111', email_confirmed_at: 'today', identities: [{provider:'google',identity_data:{name:'Photographer'}}] };
  let allowed = true, expired = false, failUpload = false;
  const rows = [], objects = new Map(), requests = [], logs = [];
  console.error = (...args) => logs.push(args);
  function json(value, status = 200) { return new Response(JSON.stringify(value), {status}); }
  global.fetch = async (value, options) => {
    const url = new URL(value); requests.push({url, options});
    assert.equal(url.origin, 'https://project.supabase.co');
    if (url.pathname === '/auth/v1/user') {
      assert.equal(options.headers.Authorization, `Bearer ${token}`);
      return expired ? json({},401) : json(person);
    }
    if (url.pathname === '/auth/v1/token') return json({access_token:token,expires_in:3600,refresh_token:'private-refresh'});
    if (url.pathname === '/rest/v1/portfolio_admins') {
      assert.equal(url.searchParams.get('user_id'),`eq.${person.id}`);
      assert.equal(options.method,undefined,'admin allowlist is read only');
      return json(allowed ? [{user_id:person.id}] : []);
    }
    if (url.pathname === '/rest/v1/portfolio_photos') {
      const method = options.method || 'GET';
      if (method === 'POST') { rows.push({...JSON.parse(options.body),created_at:'today'}); return new Response(null,{status:201}); }
      const matched = rows.filter(row => (!url.searchParams.has('id') || `eq.${row.id}` === url.searchParams.get('id')) && `eq.${row.channel}` === url.searchParams.get('channel') && (!url.searchParams.has('published') || `eq.${row.published}` === url.searchParams.get('published')) && (!url.searchParams.has('ready') || `eq.${row.ready}` === url.searchParams.get('ready')));
      if (method === 'GET') return json(matched);
      if (method === 'PATCH') { matched.forEach(row=>Object.assign(row,JSON.parse(options.body))); return new Response(null,{status:204}); }
      if (method === 'DELETE') { matched.forEach(row=>rows.splice(rows.indexOf(row),1)); return new Response(null,{status:204}); }
    }
    if (url.pathname.startsWith('/storage/v1/object/portfolio-images/')) {
      if (failUpload) return json({},503);
      assert.equal(options.method,'POST'); assert.equal(options.headers['Content-Type'],'image/jpeg');
      assert(Buffer.isBuffer(options.body)); objects.set(url.pathname,options.body); return json({Key:url.pathname});
    }
    if (url.pathname === '/storage/v1/object/portfolio-images' && options.method === 'DELETE') {
      const paths = JSON.parse(options.body).prefixes;
      paths.forEach(path => { assert.match(path,/^preview\/wedding\/[-0-9a-f]{36}\.jpg$/); objects.delete(`/storage/v1/object/portfolio-images/${path}`); });
      return json([]);
    }
    throw new Error(`Unexpected test route: ${url.pathname}`);
  };
  async function call(fn, method = 'GET', body, {cookie = `${portfolio.SESSION}=${token}`, origin = 'https://site.example', url = '/'} = {}) {
    const res = { headers:{}, statusCode:200, setHeader(key,value){this.headers[key]=value;}, status(code){this.statusCode=code;return this;}, json(body){this.body=body;return this;}, end(){return this;} };
    await fn({method,body,url,headers:{cookie,origin,'content-type':'application/json'}},res); return res;
  }
  const upload = {action:'upload',category:'wedding',alt:'Wedding moment',sortOrder:60,published:true,image:jpeg,channel:'production',created_by:'forged'};
  try {
    Object.assign(process.env,{SUPABASE_URL:'https://project.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_test',COMMENTS_SITE_URL:'https://site.example',VERCEL_ENV:'preview'});
    assert.equal((await call(management,'POST',upload,{cookie:''})).statusCode,401);
    const before = requests.length;
    assert.equal((await call(management,'POST',upload,{origin:'https://evil.example'})).statusCode,403);
    assert.equal(requests.length,before);
    allowed=false; assert.equal((await call(management,'POST',upload)).statusCode,401); allowed=true;
    assert.equal((await call(management,'POST',{...upload,category:'forged'})).statusCode,400);
    assert.equal((await call(management,'POST',{...upload,image:Buffer.from('<svg onload=alert(1)>').toString('base64')})).statusCode,400);
    assert.equal((await call(management,'POST',{...upload,sortOrder:-1})).statusCode,400);
    const response = await call(management,'POST',upload);
    assert.equal(response.statusCode,201);
    assert.equal(rows.length,1); assert.equal(objects.size,1);
    const row = rows[0];
    assert.equal(row.channel,'preview'); assert.equal(row.created_by,person.id); assert.equal(row.ready,true); assert.equal(row.published,true);
    assert.equal(row.width,32); assert.equal(row.height,16);
    const reservation = requests.find(r=>r.url.pathname==='/rest/v1/portfolio_photos'&&r.options.method==='POST');
    assert.equal(JSON.parse(reservation.options.body).published,false,'cannot publish before upload succeeds');
    let publicResult = await call(gallery,'GET',null,{cookie:''});
    assert.equal(publicResult.body.photos.length,1);
    assert(publicResult.body.photos[0].url.startsWith('https://project.supabase.co/storage/v1/object/public/portfolio-images/preview/'));
    assert(!JSON.stringify(publicResult.body).includes('created_by'));
    assert(!JSON.stringify(publicResult.body).includes('sb_secret'));
    assert.equal((await call(management,'POST',{action:'update',id:row.id,category:'other',alt:'New caption',sortOrder:20,published:false,ready:false,channel:'production'})).statusCode,200);
    assert.equal(row.ready,true,'caller cannot forge readiness'); assert.equal(row.channel,'preview'); assert.equal(row.category,'other');
    assert.equal((await call(gallery)).body.photos.length,0,'hidden image not public');
    failUpload=true;
    assert.equal((await call(management,'POST',upload)).statusCode,503);
    assert.equal(rows[1].ready,false); assert.equal(rows[1].published,false);
    assert.equal((await call(management,'POST',{action:'update',id:rows[1].id,category:'wedding',alt:'Incomplete',sortOrder:30,published:true})).statusCode,409);
    assert.equal((await call(gallery)).body.photos.length,0);
    failUpload=false;
    assert.equal((await call(management,'POST',{action:'delete',id:row.id})).statusCode,200);
    assert.equal(objects.size,0); assert.equal(rows.length,1);
    assert.equal((await call(management,'POST',{action:'delete',id:'../../forged'})).statusCode,400);
    assert.equal((await call(management,'POST',{action:'delete',id:'22222222-2222-4222-8222-222222222222'})).statusCode,404);
    let authResult = await call(login,'POST',{action:'login'});
    const verifier = authResult.headers['Set-Cookie'].split(';')[0].split('=')[1];
    const authUrl = new URL(authResult.body.url);
    assert.equal(authUrl.searchParams.get('redirect_to'),'https://site.example/api/admin-auth');
    assert.equal(authUrl.searchParams.get('code_challenge'),require('node:crypto').createHash('sha256').update(verifier).digest('base64url'));
    authResult = await call(login,'GET',null,{cookie:`${portfolio.PKCE}=${verifier}`,url:'/api/admin-auth?code=valid'});
    assert.equal(authResult.statusCode,303); assert.equal(authResult.headers.Location,'https://site.example/admin.html');
    assert(authResult.headers['Set-Cookie'].some(value=>value.includes('HttpOnly; Secure; SameSite=Lax')&&value.includes(portfolio.SESSION)));
    allowed=false;
    authResult = await call(login,'GET',null,{cookie:`${portfolio.PKCE}=${verifier}`,url:'/api/admin-auth?code=valid'});
    assert(authResult.headers.Location.endsWith('?login=denied'));
    assert(authResult.headers['Set-Cookie'].every(value=>value.includes('Max-Age=0')));
    allowed=true; expired=true;
    assert.equal((await call(management)).statusCode,401,'expired sessions cannot read admin list');
    assert(!JSON.stringify(logs).includes(token));
  } finally {
    global.fetch=originalFetch; console.error=originalError;
    envKeys.forEach(key=>saved[key]===undefined?delete process.env[key]:process.env[key]=saved[key]);
  }
});

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/admin-comments');
const portfolio = require('../lib/portfolio-server');
test('moderation is admin-only, channel-scoped, paginated and changes status only', async () => {
  const keys=['SUPABASE_URL','SUPABASE_SECRET_KEY','COMMENTS_SITE_URL','VERCEL_ENV'];
  const saved=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  const originalFetch=global.fetch;
  const token='admin-token-abcdefghijklmnop';
  const person={id:'11111111-1111-4111-8111-111111111111',email_confirmed_at:'today',identities:[{provider:'google',identity_data:{name:'Admin'}}]};
  const rows=Array.from({length:27},(_,index)=>({id:`22222222-2222-4222-8222-${String(index).padStart(12,'0')}`,user_id:index%2?person.id:null,display_name:index%2?'Google viewer':'Guest',avatar_url:'https://lh3.googleusercontent.com/test',message:`Review ${index}`,status:index===26?'approved':'pending',channel:'preview',created_at:'2026-10-15T10:00:00Z'}));
  rows.push({...rows[0],id:'33333333-3333-4333-8333-333333333333',channel:'production'});
  let allowed=true, permission=true;
  const requests=[];
  global.fetch=async(value,options)=>{
    const url=new URL(value);requests.push({url,options});
    if(url.pathname==='/auth/v1/user')return new Response(JSON.stringify(person));
    if(url.pathname==='/rest/v1/portfolio_admins')return new Response(JSON.stringify(allowed?[{user_id:person.id}]:[]));
    assert.equal(url.pathname,'/rest/v1/comments');
    const matched=rows.filter(row=>`eq.${row.channel}`===url.searchParams.get('channel')&&(!url.searchParams.has('status')||`eq.${row.status}`===url.searchParams.get('status'))&&(!url.searchParams.has('id')||`eq.${row.id}`===url.searchParams.get('id')));
    if(options.method==='HEAD')return new Response(null,{headers:{'content-range':`*/${matched.length}`}});
    if(options.method==='PATCH'){
      if(!permission)return new Response(JSON.stringify({code:'42501',details:'private database detail'}),{status:403});
      assert.deepEqual(Object.keys(JSON.parse(options.body)),['status']);
      matched.forEach(row=>row.status=JSON.parse(options.body).status);
      return new Response(JSON.stringify(matched.map(row=>({id:row.id,status:row.status}))));
    }
    assert.equal(url.searchParams.get('limit'),'24');
    const offset=Number(url.searchParams.get('offset'));
    return new Response(JSON.stringify(matched.slice(offset,offset+24)));
  };
  async function call(method='GET',body,headers={},url='/api/admin-comments'){
    const res={headers:{},statusCode:200,setHeader(key,value){this.headers[key]=value;},status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;},end(){return this;}};
    await handler({method,body,url,headers:{cookie:`${portfolio.SESSION}=${token}`,origin:'https://site.example','content-type':'application/json',...headers}},res);return res;
  }
  try {
    Object.assign(process.env,{SUPABASE_URL:'https://project.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_test',COMMENTS_SITE_URL:'https://site.example',VERCEL_ENV:'preview'});
    assert.equal((await call('GET',null,{cookie:''})).statusCode,401);
    assert.equal((await call('GET',null,{cookie:'__Host-neo-comment-session='+token})).statusCode,401,'reviewer session cannot moderate');
    allowed=false;assert.equal((await call()).statusCode,401);allowed=true;
    const before=requests.length;
    assert.equal((await call('POST',{},{origin:'https://evil.example'})).statusCode,403);assert.equal(requests.length,before);
    let result=await call();
    assert.equal(result.statusCode,200);assert.deepEqual(result.body.stats,{pending:26,approved:1,rejected:0});
    assert.equal(result.body.comments.length,24);assert.equal(result.body.pages,2);
    assert.equal(result.body.comments[0].mode,'guest');assert.equal(result.body.comments[0].avatar,null);
    assert(!JSON.stringify(result.body).includes(person.id));assert(!JSON.stringify(result.body).includes('user_id'));
    result=await call('GET',null,{},'/api/admin-comments?status=pending&page=2');assert.equal(result.body.comments.length,2);
    assert.equal((await call('GET',null,{},'/api/admin-comments?status=invalid')).statusCode,400);
    assert.equal((await call('POST',{id:rows[0].id,status:'deleted',previousStatus:'pending'})).statusCode,400);
    result=await call('POST',{id:rows[0].id,status:'approved',previousStatus:'pending',message:'forged',channel:'production'});
    assert.equal(result.statusCode,200);assert.equal(rows[0].status,'approved');assert.equal(rows[0].message,'Review 0');
    assert.equal((await call('POST',{id:rows[0].id,status:'rejected',previousStatus:'pending'})).statusCode,409,'stale moderation cannot overwrite newer status');
    assert.equal((await call('POST',{id:rows[0].id,status:'rejected',previousStatus:'approved'})).statusCode,200);
    assert.equal((await call('POST',{id:rows[0].id,status:'pending',previousStatus:'rejected'})).statusCode,200);
    assert.equal((await call('POST',{id:rows.at(-1).id,status:'approved',previousStatus:'pending'})).statusCode,409,'preview cannot moderate production');
    permission=false;
    result=await call('POST',{id:rows[0].id,status:'approved',previousStatus:'pending'});
    assert.equal(result.statusCode,503);assert.equal(result.body.code,'MODERATION_SETUP_REQUIRED');assert(!JSON.stringify(result.body).includes('private'));
    assert.equal(result.headers['Cache-Control'],'no-store');
  }finally{global.fetch=originalFetch;keys.forEach(key=>saved[key]===undefined?delete process.env[key]:process.env[key]=saved[key]);}
});

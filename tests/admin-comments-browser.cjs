'use strict';
const {chromium}=require('playwright');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const rows=[
  {id:crypto.randomUUID(),name:'<b>นักเดินทาง</b>',message:'ภาพสวยครับ <img src=x onerror=alert(1)>',mode:'guest',avatar:null,status:'pending',createdAt:'2026-10-15T10:00:00Z'},
  {id:crypto.randomUUID(),name:'ผู้ชม Google',message:'ชอบบรรยากาศและสีของภาพมากครับ',mode:'google',avatar:null,status:'pending',createdAt:'2026-10-15T09:00:00Z'},
  {id:crypto.randomUUID(),name:'ผู้ชมเดิม',message:'รีวิวที่เคยอนุมัติไว้แล้ว',mode:'google',avatar:null,status:'approved',createdAt:'2026-10-14T09:00:00Z'},
];
let signedIn=false, failUpdate=false;
let lastLogin, lastUpdate;
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost'),route=url.pathname;
  const json=(value,status=200)=>res.writeHead(status,{'Content-Type':'application/json'}).end(JSON.stringify(value));
  if(route==='/api/admin-auth'){
    if(req.method==='GET')return json({user:signedIn?{name:'Arnut'}:null,channel:'preview'});
    let raw='';for await(const chunk of req)raw+=chunk;
    const input=JSON.parse(raw);
    if(input.action==='logout'){signedIn=false;return json({ok:true});}
    lastLogin=input;signedIn=true;return json({url:`http://127.0.0.1:${server.address().port}/admin-comments.html?test-login=1`});
  }
  if(route==='/api/admin-comments'){
    if(!signedIn)return json({error:'กรุณาเข้าสู่ระบบด้วยบัญชีผู้ดูแล'},401);
    if(req.method==='GET'){
      const status=url.searchParams.get('status')||'pending';
      const stats=Object.fromEntries(['pending','approved','rejected'].map(status=>[status,rows.filter(row=>row.status===status).length]));
      const filtered=rows.filter(row=>status==='all'||row.status===status);
      const pages=Math.max(1,Math.ceil(filtered.length/24));const page=Math.min(Number(url.searchParams.get('page')||1),pages);
      return json({comments:filtered.slice((page-1)*24,page*24),page,pages,stats,total:filtered.length,channel:'preview'});
    }
    let raw='';for await(const chunk of req)raw+=chunk;
    lastUpdate=JSON.parse(raw);
    if(failUpdate)return json({error:'บันทึกสถานะไม่สำเร็จ กรุณาลองใหม่'},503);
    const row=rows.find(row=>row.id===lastUpdate.id&&row.status===lastUpdate.previousStatus);
    if(!row)return json({error:'กรุณาโหลดรายการล่าสุด'},409);
    row.status=lastUpdate.status;return json({id:row.id,status:row.status});
  }
  if(route==='/api/comments')return json({comments:rows.filter(row=>row.status==='approved').map(row=>({id:row.id,name:row.name,message:row.message,avatar:row.avatar,mode:row.mode}))});
  if(route==='/api/portfolio')return json({error:'Use original gallery'},503);
  if(route==='/api/comment-auth')return json({user:null});
  if(route==='/api/views')return json({views:'42'});
  const file=path.resolve(root,'.'+(route==='/'?'/index.html':decodeURIComponent(route)));
  if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
  fs.readFile(file,(error,data)=>{
    if(error)return res.writeHead(404).end();
    const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml'};
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'}).end(data);
  });
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error'&&/Content Security Policy/.test(message.text()))errors.push(message.text());});
    const origin=`http://127.0.0.1:${server.address().port}`;
    await page.goto(origin+'/admin-comments.html');
    await page.waitForFunction(()=>!document.querySelector('#admin-login').disabled);
    assert(await page.locator('#admin-workspace').isHidden());
    await page.locator('#admin-login').click();
    await page.waitForFunction(()=>document.querySelectorAll('.admin-review-card').length===2);
    assert.equal(lastLogin.returnTo,'comments');
    assert.equal(await page.locator('#review-count-pending').textContent(),'2');
    assert.equal(await page.locator('.admin-review-author b').count(),0);assert.equal(await page.locator('.admin-review-message img').count(),0);
    assert(await page.locator('.admin-review-card').first().getByText('ไม่ได้เข้าสู่ระบบ',{exact:true}).isVisible());
    await page.screenshot({path:path.join(__dirname,'admin-comments-desktop.png')});
    await page.locator('.admin-review-card').first().getByRole('button',{name:'อนุมัติรีวิว'}).click();
    await page.waitForFunction(()=>document.querySelector('#review-count-pending').textContent==='1');
    assert.deepEqual(lastUpdate,{id:rows[0].id,status:'approved',previousStatus:'pending'});
    const home=await browser.newPage();await home.goto(origin);
    await home.waitForFunction(()=>document.querySelector('#comment-name').textContent==='<b>นักเดินทาง</b>');
    assert.equal(await home.locator('#comment-author-mode').textContent(),'ไม่ได้เข้าสู่ระบบ');
    assert.equal(await home.locator('#comment-name b').count(),0);
    await page.locator('#review-filters').getByRole('button',{name:'อนุมัติแล้ว',exact:true}).click();
    await page.waitForFunction(()=>document.querySelectorAll('.admin-review-card').length===2);
    await page.locator(`[data-id="${rows[0].id}"]`).getByRole('button',{name:'ไม่เผยแพร่',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('#review-count-rejected').textContent==='1');
    await home.reload();await home.waitForFunction(()=>document.querySelector('#comment-name').textContent==='ผู้ชมเดิม');
    await page.locator('#review-filters').getByRole('button',{name:'ไม่เผยแพร่',exact:true}).click();
    await page.waitForFunction(()=>document.querySelectorAll('.admin-review-card').length===1);
    await page.locator('.admin-review-card').getByRole('button',{name:'กลับไปรอตรวจสอบ'}).click();
    await page.waitForFunction(()=>document.querySelector('#review-empty').hidden===false);
    assert.equal(rows[0].status,'pending');
    await page.locator('#review-filters').getByRole('button',{name:'รอตรวจสอบ',exact:true}).click();
    await page.waitForFunction(()=>document.querySelectorAll('.admin-review-card').length===2);
    failUpdate=true;
    await page.locator('.admin-review-card').first().getByRole('button',{name:'อนุมัติรีวิว'}).click();
    await page.waitForFunction(()=>document.querySelector('#review-status').textContent.includes('ไม่สำเร็จ'));
    assert.equal(rows[0].status,'pending');assert.equal(await page.locator('.admin-review-card').count(),2);
    failUpdate=false;
    for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:950});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow ${width}`);}
    await page.setViewportSize({width:390,height:844});await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
    await page.screenshot({path:path.join(__dirname,'admin-comments-mobile.png'),fullPage:true});
    for(let index=0;index<25;index++)rows.push({...rows[1],id:crypto.randomUUID(),message:`More review ${index}`});
    await page.locator('#review-refresh').click();await page.waitForFunction(()=>document.querySelector('#review-page').textContent==='1 / 2');
    await page.locator('#review-next').click();await page.waitForFunction(()=>document.querySelector('#review-page').textContent==='2 / 2');
    assert.equal(await page.locator('.admin-review-card').count(),3);
    await page.locator('#admin-logout').click();await page.waitForFunction(()=>document.querySelector('#admin-workspace').hidden);
    assert(await page.locator('#admin-login').isVisible());assert.deepEqual(errors,[]);
    console.log('PASS: shared admin login, review filters, approve/reject/pending, public visibility, safe names/messages, failed update, pagination, mobile widths, logout.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>server.close());

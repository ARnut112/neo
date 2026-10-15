'use strict';
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const portfolio = require('../lib/portfolio-server');
const root = path.resolve(__dirname,'..');
const jpeg = Buffer.from(fs.readFileSync(path.join(__dirname,'portfolio.cjs'),'utf8').match(/const jpeg = '([^']+)'/)[1],'base64');
const rows = [
  {id:crypto.randomUUID(),category:'wedding',url:'/img/nun.jpg',alt:'Wedding original',width:3625,height:3625,sortOrder:10,published:true,ready:true,source:'original'},
  {id:crypto.randomUUID(),category:'ordination',url:'/img/mawork/b1.jpg',alt:'Ordination original',width:1920,height:1920,sortOrder:10,published:true,ready:true,source:'original'},
];
let signedIn=false, failUpload=false, failUpdate=false, galleryOffline=false;
const submissions=[];
const server=http.createServer(async(req,res)=>{
  const route=new URL(req.url,'http://localhost').pathname;
  const json=(data,status=200)=>res.writeHead(status,{'Content-Type':'application/json'}).end(JSON.stringify(data));
  if(route==='/api/admin-auth') {
    if(req.method==='GET')return json({user:signedIn?{name:'Arnut'}:null,channel:'preview'});
    let raw='';for await(const chunk of req)raw+=chunk;
    const input=JSON.parse(raw);
    signedIn=input.action==='login';
    return json(input.action==='login'?{url:`http://127.0.0.1:${server.address().port}/admin.html?test-login=1`}:{ok:true});
  }
  if(route==='/api/admin-photos') {
    if(!signedIn)return json({error:'Sign in'},401);
    if(req.method==='GET')return json({photos:[...rows].sort((a,b)=>a.sortOrder-b.sortOrder),categories:portfolio.CATEGORIES,channel:'preview'});
    let raw='';for await(const chunk of req)raw+=chunk;
    const input=JSON.parse(raw);submissions.push(input);
    if(input.action==='upload'){
      if(failUpload)return json({error:'อัปโหลดไม่สำเร็จ ลองใหม่ภายหลัง'},503);
      const image=portfolio.jpeg(input.image);
      const row={id:crypto.randomUUID(),category:input.category,url:'/test-upload.jpg',alt:input.alt,width:image.width,height:image.height,sortOrder:input.sortOrder,published:input.published,ready:true,source:'uploaded'};
      rows.push(row);return json({id:row.id},201);
    }
    const row=rows.find(row=>row.id===input.id);
    if(!row)return json({error:'Not found'},404);
    if(input.action==='update'){
      if(failUpdate)return json({error:'บันทึกไม่สำเร็จ ลองใหม่ภายหลัง'},503);
      Object.assign(row,{alt:input.alt,category:input.category,sortOrder:input.sortOrder,published:input.published});
    }
    if(input.action==='delete')rows.splice(rows.indexOf(row),1);
    return json({ok:true});
  }
  if(route==='/api/portfolio')return galleryOffline?json({error:'Unavailable'},503):json({categories:portfolio.CATEGORIES,photos:rows.filter(row=>row.ready&&row.published).sort((a,b)=>a.sortOrder-b.sortOrder)});
  if(route==='/api/comments')return json({comments:[]});
  if(route==='/api/comment-auth')return json({user:null});
  if(route==='/api/views')return json({views:'42'});
  if(route==='/test-upload.jpg')return res.writeHead(200,{'Content-Type':'image/jpeg'}).end(jpeg);
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
  try {
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error'&&/Content Security Policy/.test(message.text()))errors.push(message.text());});
    const url=`http://127.0.0.1:${server.address().port}`;
    await page.goto(url+'/admin.html');
    await page.waitForFunction(()=>!document.querySelector('#admin-login').disabled);
    assert(await page.locator('#admin-workspace').isHidden());
    await page.screenshot({path:path.join(__dirname,'admin-login-desktop.png')});
    await page.locator('#admin-login').click();
    await page.waitForFunction(()=>document.querySelectorAll('.admin-photo-card').length===2);
    assert.equal(await page.locator('.admin-photo-group').count(),2,'all view separates categories');
    assert.equal(await page.locator('.admin-photo-card input').count(),0,'compact cards have no permanent edit form');
    assert((await page.locator('.admin-photo-card').first().boundingBox()).height<300,'compact thumbnail height');
    assert.equal(await page.locator('#admin-environment').textContent(),'เว็บทดสอบ');
    await page.locator('#admin-filters').getByRole('button',{name:'งานแต่ง',exact:true}).click();
    assert.equal(await page.locator('.admin-photo-card').count(),1);
    await page.locator('#admin-add-photo').click();
    assert(await page.locator('#admin-upload-dialog').evaluate(e=>e.matches(':modal')));
    assert.equal(await page.locator('#admin-category').inputValue(),'wedding','upload follows selected category');
    await page.locator('#admin-files').setInputFiles([{name:'moment-one.jpg',mimeType:'image/jpeg',buffer:jpeg},{name:'moment-two.jpg',mimeType:'image/jpeg',buffer:jpeg}]);
    await page.locator('#admin-alt').fill('New wedding');
    await page.locator('#admin-upload').click();
    await page.waitForFunction(()=>document.querySelector('#admin-upload-status').textContent.includes('สำเร็จ 2 / 2'));
    assert.equal(rows.length,4);
    assert.equal(submissions.filter(item=>item.action==='upload').length,2);
    assert(submissions.filter(item=>item.action==='upload').every(item=>item.category==='wedding'));
    const uploaded=rows.find(row=>row.source==='uploaded');
    const card=page.locator(`[data-id="${uploaded.id}"]`);
    await page.waitForFunction(()=>!document.querySelector('#admin-upload-dialog').open);
    await card.getByRole('button').click();
    assert(await page.locator('#admin-edit-dialog').evaluate(e=>e.matches(':modal')));
    await page.screenshot({path:path.join(__dirname,'admin-photo-editor.png')});
    await page.locator('#admin-edit-alt').fill('<img src=x onerror=alert(1)>');
    await page.locator('#admin-edit-order').fill('1');
    await page.locator('#admin-edit-published').uncheck();
    await page.locator('#admin-edit-save').click();
    await page.waitForFunction(()=>document.querySelector('#admin-list-status').textContent.includes('บันทึกแล้ว'));
    assert.equal(uploaded.published,false);assert.equal(uploaded.sortOrder,1);
    assert.equal(await page.locator('.admin-photo-title img').count(),0,'caption remains plain text');
    await page.locator('#admin-filters').getByRole('button',{name:'ทั้งหมด',exact:true}).click();
    assert.equal(await page.locator('.admin-photo-group').count(),2);
    await page.locator('#admin-search').fill('Ordination');
    assert.equal(await page.locator('.admin-photo-card').count(),1,'search across categorized library');
    await page.locator('#admin-search').fill('');
    assert.equal(await page.locator('.admin-photo-card').count(),4);
    await page.screenshot({path:path.join(__dirname,'admin-workspace-desktop.png')});
    const home=await browser.newPage();
    await home.goto(url);
    await home.waitForFunction(()=>document.querySelectorAll('.highlight-loop-marker').length===2);
    assert.equal(await home.locator('.brand').getAttribute('href'),'https://arnut.vercel.app/admin.html');
    assert.equal(await home.locator('.highlight-scroll').first().locator('img').count(),4,'original and newly uploaded photos share original loop');
    assert.equal(await home.locator('.highlight-scroll').first().locator('img[alt="<img src=x onerror=alert(1)>"]').count(),0,'hidden photo omitted');
    await card.getByRole('button').click();
    await page.locator('#admin-edit-delete').click();
    assert(await page.locator('#admin-delete-dialog').evaluate(e=>e.matches(':modal')));
    await page.locator('#admin-delete-cancel').click();assert.equal(rows.length,4);
    assert(await page.locator('#admin-edit-dialog').evaluate(e=>e.open),'cancel delete returns to edit dialog');
    await page.locator('#admin-edit-delete').click();
    await page.locator('#admin-delete-confirm').click();
    await page.waitForFunction(()=>document.querySelector('#admin-total').textContent==='3');
    for(const width of [320,390,768,1440]){
      await page.setViewportSize({width,height:950});
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`admin overflow ${width}`);
    }
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:path.join(__dirname,'admin-workspace-mobile.png'),fullPage:true});
    const original=rows.find(row=>row.source==='original');
    await page.locator(`[data-id="${original.id}"] button`).click();
    for(const width of [320,390,768,1440]){
      await page.setViewportSize({width,height:950});
      assert(await page.locator('#admin-edit-dialog').evaluate(e=>e.scrollWidth<=e.clientWidth),`editor overflow ${width}`);
    }
    await page.setViewportSize({width:390,height:844});
    failUpdate=true;
    await page.locator('#admin-edit-alt').fill('Unsaved caption');
    await page.locator('#admin-edit-save').click();
    await page.waitForFunction(()=>document.querySelector('#admin-edit-status').textContent.includes('ไม่สำเร็จ'));
    assert.equal(await page.locator('#admin-edit-alt').inputValue(),'Unsaved caption');
    assert(await page.locator('#admin-edit-dialog').evaluate(e=>e.open));
    await page.keyboard.press('Escape');
    await page.waitForFunction(()=>!document.querySelector('#admin-edit-dialog').open);
    failUpdate=false;
    failUpload=true;
    await page.locator('#admin-add-photo').click();
    await page.locator('#admin-files').setInputFiles({name:'failed.jpg',mimeType:'image/jpeg',buffer:jpeg});
    await page.locator('#admin-upload').click();
    await page.waitForFunction(()=>document.querySelector('#admin-upload-status').textContent.includes('อัปโหลดไม่สำเร็จ'));
    assert.equal(await page.locator('#admin-files').evaluate(e=>e.files.length),1,'keep failed selection for review');
    await page.locator('#admin-upload-close').click();
    galleryOffline=true;await home.reload();
    await home.waitForFunction(()=>document.querySelectorAll('.highlight-loop-marker').length===4);
    assert.equal(await home.locator('.highlight-scroll').first().locator('img').count(),10,'fallback retains original wedding photos');
    await page.locator('#admin-logout').click();
    await page.waitForFunction(()=>document.querySelector('#admin-workspace').hidden);
    assert(await page.locator('#admin-login').isVisible());
    assert.deepEqual(errors,[]);
    console.log('PASS: categorized compact library, search, modal upload/edit, failed save preserves text, visibility, nested delete confirmation, gallery hydration/fallback, four widths, failed upload, logout.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>server.close());

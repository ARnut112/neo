const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
// Fixture comments are served only by this test, never shipped in the UI.
const fixtures = [
 {id:'1',name:'ผู้ชมตัวอย่าง',avatar:null,message:'ชอบบรรยากาศในภาพมากครับ แต่ละภาพดูเป็นธรรมชาติ เหมือนได้กลับไปอยู่ในช่วงเวลานั้นอีกครั้ง'},
 {id:'2',name:'ข้อความทดสอบ',avatar:null,message:'<img src=x onerror=alert(1)> ข้อความนี้ต้องแสดงเป็นตัวอักษร ไม่ใช่ HTML'},
];
let signedIn=false;
let submitStatus=201;
let submissions=[];
let list=fixtures;
const server=http.createServer(async(req,res)=>{
 const route=new URL(req.url,'http://localhost').pathname;
 function json(code,data){res.writeHead(code,{'Content-Type':'application/json'}).end(JSON.stringify(data));}
 if(route==='/api/comments') {
  if(req.method==='GET') return json(200,{comments:list});
  let text='';for await(const chunk of req) text+=chunk;
  submissions.push(JSON.parse(text));
  return json(submitStatus,submitStatus===201?{status:'pending'}:{error:submitStatus===401?'กรุณาเข้าสู่ระบบอีกครั้ง':'ลองใหม่ภายหลัง'});
 }
 if(route==='/api/comment-auth'){
  if(req.method==='GET')return json(200,{user:signedIn?{name:'ผู้ชมตัวอย่าง',avatar:null}:null});
  let text='';for await(const chunk of req)text+=chunk;
  if(JSON.parse(text).action==='logout'){signedIn=false;return json(200,{ok:true});}
  return json(503,{error:'ยังไม่ได้ตั้งค่า Google สำหรับการทดสอบ'});
 }
 if(route==='/api/views')return json(200,{views:'123'});
 const file=path.resolve(root,'.'+(route==='/'?'/index.html':decodeURIComponent(route)));
 if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
 fs.readFile(file,(error,data)=>{if(error)return res.writeHead(404).end();const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml'};res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'}).end(data);});
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:950}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'&&/Content Security Policy/.test(m.text()))errors.push(m.text());});
  const url=`http://127.0.0.1:${server.address().port}`;
  await page.goto(url);
  await page.locator('#comments').scrollIntoViewIfNeeded();
  await page.mouse.move(0,0);
  await page.waitForFunction(()=>document.querySelector('#comment-position').textContent==='1 / 2');
  await page.screenshot({path:path.join(root,'tests','comments-desktop.png')});
  await page.waitForTimeout(7500);
  assert.equal(await page.locator('#comment-position').textContent(),'1 / 2','no automatic movement');
  assert.equal(await page.locator('.comment-message img').count(),0,'no HTML injection');
  await page.locator('#comment-next').click();
  await page.waitForFunction(()=>document.querySelector('#comment-position').textContent==='2 / 2');
  assert(await page.locator('#comment-next').isDisabled(),'stop at end');
  await page.locator('#comment-prev').click();
  await page.waitForFunction(()=>document.querySelector('#comment-position').textContent==='1 / 2');
  await page.locator('#comment-stage').focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(()=>document.querySelector('#comment-position').textContent==='2 / 2');
  await page.locator('#comment-stage').evaluate(e=>e.scrollTo({left:0,behavior:'instant'}));
  await page.waitForFunction(()=>document.querySelector('#comment-position').textContent==='1 / 2');
  await page.locator('#comment-compose summary').click();
  assert(await page.locator('#comment-login').isVisible());
  assert(await page.locator('#comment-login-reason').isVisible());
  assert(!(await page.locator('#comment-form').isVisible()));
  await page.locator('#comment-login').click();
  await page.waitForFunction(()=>!document.querySelector('#comment-login').disabled);
  assert.match(await page.locator('#comment-feedback').textContent(),/Google/);
  signedIn=true;
  await page.goto(url+'/#comments');
  await page.reload();
  await page.waitForFunction(()=>!document.querySelector('#comment-form').hidden);
  await page.locator('#comment-input').fill('ข้อความที่รออนุมัติ');
  await page.locator('#comment-consent').check();
  await page.locator('#comment-submit').click();
  await page.waitForFunction(()=>document.querySelector('#comment-feedback').textContent.includes('กำลังรออนุมัติ'));
  assert.deepEqual(submissions[0],{message:'ข้อความที่รออนุมัติ',consent:true});
  assert.equal(await page.locator('#comment-input').inputValue(),'');
  assert(!(await page.locator('.comment-message').first().textContent()).includes('ข้อความที่รออนุมัติ'));
  submitStatus=503;
  await page.locator('#comment-input').fill('เก็บข้อความนี้หากส่งไม่สำเร็จ');
  await page.locator('#comment-consent').check();
  await page.locator('#comment-submit').click();
  await page.waitForFunction(()=>document.querySelector('#comment-feedback').textContent==='ลองใหม่ภายหลัง');
  assert.equal(await page.locator('#comment-input').inputValue(),'เก็บข้อความนี้หากส่งไม่สำเร็จ');
  await page.emulateMedia({reducedMotion:'reduce'});
  for(const width of [320,390,768,1440]){
   await page.setViewportSize({width,height:950});
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow ${width}`);
  }
  await page.setViewportSize({width:390,height:844});
  await page.locator('#comments').evaluate(e=>e.scrollIntoView({block:'start',behavior:'instant'}));
  await page.locator('#comment-next').click();
  await page.waitForFunction(()=>document.querySelector('#comment-position').textContent==='2 / 2');
  await page.locator('#comments').evaluate(e=>e.scrollIntoView({block:'start',behavior:'instant'}));
  await page.screenshot({path:path.join(root,'tests','comments-mobile.png')});
  await page.locator('#comment-logout').click();
  await page.waitForFunction(()=>document.querySelector('#comment-form').hidden);
  list=[];await page.reload();
  await page.waitForFunction(()=>document.querySelector('#comment-empty').textContent.includes('ยังไม่มี'));
  assert(!(await page.locator('#comment-controls').isVisible()));
  list=[fixtures[0]];await page.reload();
  await page.waitForFunction(()=>!!document.querySelector('.comment-bubble'));
  assert(!(await page.locator('#comment-controls').isVisible()));
  assert.deepEqual(errors,[]);
  console.log('PASS: manual scrolling, keyboard navigation, no autoplay, boundary controls, text-only rendering, auth states, consent submission, pending not published, failure preserves text, logout, empty/single lists, 4 widths.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());

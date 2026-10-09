const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
let viewRequests = 0;
let counterOffline = false;
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (pathname === '/api/views' && req.method === 'POST') {
    viewRequests++;
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(counterOffline ? 503 : 200).end(JSON.stringify(counterOffline ? {error:'Unavailable'} : {views:String(viewRequests)}));
    return;
  }
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404).end(); return; }
    const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml'};
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    res.end(data);
  });
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && /Content Security Policy/.test(m.text())) errors.push(m.text()); });
    const url = `http://127.0.0.1:${server.address().port}`;
    await page.goto(url);
    await page.waitForFunction(() => document.getElementById('view-count').textContent === '1');
    const chat = page.locator('#quick-contact');
    const back = page.locator('#back-to-top');
    assert(!(await chat.isVisible()), 'chat hidden on hero');
    assert(!(await back.isVisible()), 'back-to-top hidden on hero');
    await page.locator('#works').evaluate(e => e.scrollIntoView({block: 'start', behavior: 'instant'}));
    await page.evaluate(() => window.scrollBy({top: 120, behavior: 'instant'}));
    await page.waitForFunction(() => document.querySelector('#quick-contact').classList.contains('is-visible'));
    assert(await back.evaluate(e => e.classList.contains('is-visible')));
    await chat.locator('summary').click();
    await page.evaluate(() => window.scrollTo({top: 0, behavior: 'instant'}));
    await page.waitForFunction(() => document.querySelector('#quick-contact').inert);
    assert(!(await chat.evaluate(e => e.open)), 'panel closes when returning to hero');
    assert(await back.evaluate(e => e.inert));
    await page.locator('#works').evaluate(e => e.scrollIntoView({block: 'start', behavior: 'instant'}));
    await page.evaluate(() => window.scrollBy({top: 120, behavior: 'instant'}));
    await chat.locator('summary').click();
    assert(await chat.evaluate(e => e.open));
    assert.equal(await chat.locator('a').count(), 3);
    await chat.locator('summary').focus();
    await page.keyboard.press('Tab');
    assert(await chat.locator('a').first().evaluate(e => e === document.activeElement));
    await page.keyboard.press('Escape');
    assert(!(await chat.evaluate(e => e.open)));
    assert(await chat.locator('summary').evaluate(e => e === document.activeElement));
    await chat.locator('summary').click();
    await page.locator('.hero-title').click();
    assert(!(await chat.evaluate(e => e.open)));
    const cards = page.locator('.tile .image-open');
    await cards.first().click();
    assert(await page.locator('#lightbox').evaluate(e => e.open));
    await page.keyboard.press('ArrowLeft');
    assert.match(await page.locator('#lightbox-caption').textContent(), /^9 \/ 9/);
    await page.keyboard.press('Escape');
    assert(await cards.first().evaluate(e => e === document.activeElement));
    await page.waitForFunction(() => !document.body.classList.contains('viewer-open'));
    const rail = page.locator('.highlight-scroll').first();
    assert.equal(await page.locator('.hero a, .hero button').count(), 0);
    assert.equal(await page.locator('.gallery-controls, .highlight-scroll button').count(), 0);
    assert.equal(await rail.locator('.highlight-loop-marker').count(), 1);
    assert.equal(await rail.locator('.feature-card').count(), 10);
    await rail.scrollIntoViewIfNeeded();
    await rail.hover();
    const start = await rail.evaluate(e => e.scrollLeft);
    await page.waitForFunction(start => document.querySelector('.highlight-scroll').scrollLeft > start + 5, start);
    await rail.evaluate(e => {
      const marker = e.querySelector('.highlight-loop-marker');
      e.scrollLeft = marker.offsetLeft - e.firstElementChild.offsetLeft - 2;
    });
    await page.waitForFunction(() => document.querySelector('.highlight-scroll').scrollLeft < 100);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 850 });
      await page.evaluate(() => window.scrollTo(0, 0));
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow ${width}`);
      if (width < 720) {
        await page.waitForFunction(() => document.getElementById('main-nav').inert);
        assert(await page.locator('#main-nav').evaluate(e => e.inert));
        await page.locator('#nav-toggle').click();
        assert(!(await page.locator('#main-nav').evaluate(e => e.inert)));
        await page.keyboard.press('Escape');
        assert(await page.locator('#main-nav').evaluate(e => e.inert));
      }
    }
    await page.screenshot({ path: path.join(root, 'tests', 'desktop.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#works').evaluate(e => e.scrollIntoView({block: 'start', behavior: 'instant'}));
    await page.evaluate(() => window.scrollBy({top: 120, behavior: 'instant'}));
    await chat.locator('summary').click();
    await page.screenshot({ path: path.join(root, 'tests', 'mobile.png') });
    const panel = await chat.locator('.quick-contact-panel').boundingBox();
    assert(panel.x >= 0 && panel.x + panel.width <= 390);
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator('#works').evaluate(e => e.scrollIntoView({block: 'start', behavior: 'instant'}));
    await page.evaluate(() => window.scrollBy({top: 120, behavior: 'instant'}));
    await page.screenshot({ path: path.join(root, 'tests', 'works.png') });
    await page.locator('.about').scrollIntoViewIfNeeded();
    await page.locator('.about-media img').evaluate(img => img.decode());
    await page.screenshot({ path: path.join(root, 'tests', 'about.png') });
    assert.equal(viewRequests, 1, 'gallery interactions never increment');
    await page.reload();
    await page.waitForFunction(() => document.getElementById('view-count').textContent === '2');
    counterOffline = true;
    await page.reload();
    await page.waitForLoadState('networkidle');
    assert.equal(await page.locator('#view-count').textContent(), '—');
    await cards.first().click();
    assert(await page.locator('#lightbox').evaluate(e => e.open), 'gallery works when counter fails');
    assert.equal(viewRequests, 3);
    assert.deepEqual(errors, []);
    console.log('PASS: main gallery, original slideshow autoplay and loop reset, separator, no slideshow controls, mobile navigation, 4 responsive widths, runtime/CSP errors.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => server.close());


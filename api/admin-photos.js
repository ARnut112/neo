'use strict';
const crypto = require('node:crypto');
const auth = require('../lib/comments-server');
const portfolio = require('../lib/portfolio-server');
const FIELDS = 'id,category,storage_path,local_path,alt,width,height,sort_order,published,ready,created_at';
function details(input) {
  if (!portfolio.CATEGORIES.some(category => category.id === input.category)) throw new Error('เลือกหมวดงานให้ถูกต้อง');
  if (typeof input.alt !== 'string' || !input.alt.trim() || input.alt.trim().length > 160 || /[\u0000-\u001f]/.test(input.alt)) throw new Error('กรอกคำอธิบายภาพ 1–160 ตัวอักษร');
  if (!Number.isInteger(input.sortOrder) || input.sortOrder < 0 || input.sortOrder > 100000) throw new Error('ลำดับต้องเป็นตัวเลข 0–100000');
  if (typeof input.published !== 'boolean') throw new Error('เลือกสถานะการแสดงภาพ');
  return { category: input.category, alt: input.alt.trim(), sort_order: input.sortOrder, published: input.published };
}
async function checked(cfg, path, options, timeout) {
  const response = await auth.request(cfg, path, options, undefined, timeout);
  if (!response.ok) {
    console.error('portfolio_storage_error', { status: response.status });
    throw new Error('Storage operation failed');
  }
  return response;
}
module.exports = async function handler(req, res) {
  auth.setup(res);
  if (!['GET', 'POST'].includes(req.method)) { res.setHeader('Allow', 'GET, POST'); return res.status(405).end(); }
  let cfg;
  try { cfg = auth.config(); } catch { return res.status(503).json({ error: 'ยังไม่ได้ตั้งค่าระบบหลังบ้าน' }); }
  if (req.method === 'POST' && !auth.sameOrigin(req, cfg.site)) return res.status(403).json({ error: 'ไม่อนุญาตคำขอนี้' });
  try {
    const person = await portfolio.admin(req, cfg);
    if (!person) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบด้วยบัญชีผู้ดูแล' });
    const channel = auth.channel();
    if (req.method === 'GET') {
      const rows = await portfolio.listPhotos(cfg, { select: FIELDS, channel: `eq.${channel}`, order: 'sort_order.asc,created_at.asc,id.asc' });
      return res.status(200).json({ categories: portfolio.CATEGORIES, channel, photos: rows.map(row => ({ ...portfolio.publicPhoto(cfg, row), published: row.published, ready: row.ready, source: row.local_path ? 'original' : 'uploaded' })) });
    }
    let input;
    try { input = auth.body(req); } catch { return res.status(400).json({ error: 'คำขอไม่ถูกต้อง' }); }
    if (input.action === 'upload') {
      let data, image;
      try { data = details(input); image = portfolio.jpeg(input.image); } catch (error) { return res.status(400).json({ error: error.message.startsWith('Invalid') || error.message.startsWith('Missing') ? 'ใช้ไฟล์ JPEG ที่ย่อแล้วไม่เกิน 2 MB และด้านยาวไม่เกิน 2560 พิกเซล' : error.message }); }
      const id = crypto.randomUUID();
      const storagePath = `${channel}/${data.category}/${id}.jpg`;
      // Reserve a hidden row first. An interrupted upload stays visible to admins for cleanup.
      await checked(cfg, '/rest/v1/portfolio_photos', {
        method: 'POST', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ ...data, id, channel, storage_path: storagePath, width: image.width, height: image.height, published: false, ready: false, created_by: person.id }),
      });
      await checked(cfg, `/storage/v1/object/${portfolio.BUCKET}/${storagePath}`, { method: 'POST', headers: { 'Content-Type': 'image/jpeg', 'x-upsert': 'false', 'cache-control': 'max-age=31536000' }, body: image.bytes }, 20000);
      const query = new URLSearchParams({ id: `eq.${id}`, channel: `eq.${channel}` });
      await checked(cfg, `/rest/v1/portfolio_photos?${query}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ ready: true, published: data.published }) });
      return res.status(201).json({ id });
    }
    if (!['update', 'delete'].includes(input.action) || !portfolio.UUID.test(input.id || '')) return res.status(400).json({ error: 'คำขอไม่ถูกต้อง' });
    const query = new URLSearchParams({ select: FIELDS, id: `eq.${input.id}`, channel: `eq.${channel}`, limit: '1' });
    const response = await checked(cfg, `/rest/v1/portfolio_photos?${query}`);
    const [row] = await response.json();
    if (!row) return res.status(404).json({ error: 'ไม่พบภาพในเว็บไซต์นี้ กรุณาโหลดรายการใหม่' });
    const filter = new URLSearchParams({ id: `eq.${input.id}`, channel: `eq.${channel}` });
    if (input.action === 'update') {
      let data;
      try { data = details(input); } catch (error) { return res.status(400).json({ error: error.message }); }
      if (data.published && !row.ready) return res.status(409).json({ error: 'ภาพนี้อัปโหลดไม่ครบ กรุณาลบแล้วอัปโหลดใหม่' });
      await checked(cfg, `/rest/v1/portfolio_photos?${filter}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(data) });
      return res.status(200).json({ ok: true });
    }
    // Hide first, then remove the storage object, then metadata. Failed deletion can be retried.
    await checked(cfg, `/rest/v1/portfolio_photos?${filter}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ published: false }) });
    if (row.storage_path) {
      portfolio.photoUrl(cfg, row); // Validate paths from the database before any storage mutation.
      const deleted = await auth.request(cfg, `/storage/v1/object/${portfolio.BUCKET}`, { method: 'DELETE', body: JSON.stringify({ prefixes: [row.storage_path] }) }, undefined, 15000);
      if (!deleted.ok && deleted.status !== 404) throw new Error('Delete unavailable');
    }
    await checked(cfg, `/rest/v1/portfolio_photos?${filter}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
    return res.status(200).json({ ok: true });
  } catch {
    return res.status(503).json({ error: 'ทำรายการไม่สำเร็จ กรุณาโหลดรายการใหม่เพื่อตรวจสถานะ ภาพที่อัปโหลดไม่ครบจะยังไม่แสดงบนเว็บไซต์' });
  }
};

'use strict';
const auth = require('../lib/comments-server');

module.exports = async function handler(req, res) {
  auth.setup(res);
  let cfg;
  try { cfg = auth.config(); } catch { return res.status(503).json({ error: 'ยังไม่เปิดรับข้อความ' }); }
  try {
    if (req.method === 'GET') {
      const query = new URLSearchParams({ select: 'id,display_name,avatar_url,message,created_at', status: 'eq.approved', channel: `eq.${auth.channel()}`, order: 'created_at.desc', limit: '50' });
      const result = await auth.request(cfg, `/rest/v1/comments?${query}`);
      if (!result.ok) throw new Error('Database unavailable');
      const rows = await result.json();
      return res.status(200).json({ comments: rows.map(row => ({ id: row.id, name: row.display_name, avatar: auth.avatar(row.avatar_url), message: row.message })) });
    }
    if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return res.status(405).end(); }
    if (!auth.sameOrigin(req, cfg.site)) return res.status(403).json({ error: 'ไม่อนุญาตคำขอนี้' });
    let input;
    try { input = auth.body(req); } catch { return res.status(400).json({ error: 'คำขอไม่ถูกต้อง' }); }
    const message = typeof input.message === 'string' ? input.message.trim() : '';
    if (message.length < 5 || message.length > 400 || input.consent !== true) {
      return res.status(400).json({ error: 'กรอกข้อความ 5–400 ตัวอักษร และยินยอมให้แสดงชื่อ รูป และข้อความ' });
    }
    const person = await auth.user(req, cfg);
    if (!person) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบด้วย Google อีกครั้ง' });
    const result = await auth.request(cfg, '/rest/v1/comments', {
      method: 'POST', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ user_id: person.id, channel: auth.channel(), display_name: person.name, avatar_url: person.avatar, message, status: 'pending' }),
    });
    if (result.status === 409) return res.status(429).json({ error: 'ส่งได้วันละ 1 ข้อความต่อบัญชี ระบบเริ่มวันใหม่เวลา 07:00 น. (เวลาไทย)' });
    if (!result.ok) throw new Error('Insert failed');
    return res.status(201).json({ status: 'pending' });
  } catch {
    return res.status(503).json({ error: 'ส่งหรือโหลดข้อความไม่สำเร็จ กรุณาลองใหม่ภายหลัง' });
  }
};

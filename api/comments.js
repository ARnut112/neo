'use strict';
const crypto = require('node:crypto');
const { isIP } = require('node:net');
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
      return res.status(400).json({ error: 'กรอกรีวิว 5–400 ตัวอักษร และยินยอมให้เผยแพร่ตามรูปแบบที่เลือก' });
    }
    // Default preserves existing Google clients; never silently turn an expired login into a guest review.
    const mode = input.mode === undefined ? 'google' : input.mode;
    if (mode !== 'google' && mode !== 'guest') return res.status(400).json({ error: 'เลือกรูปแบบการส่งรีวิวอีกครั้ง' });
    let author;
    if (mode === 'guest') {
      // Vercel overwrites this header. Do not use caller-provided identity or an in-memory rate limit.
      const forwarded = process.env.VERCEL === '1' ? req.headers['x-vercel-forwarded-for'] : req.socket?.remoteAddress;
      const ip = typeof forwarded === 'string' ? forwarded.trim() : '';
      if (!isIP(ip)) return res.status(503).json({ error: 'ยังส่งแบบนักท่องเที่ยวไม่ได้ กรุณาลองใหม่ภายหลัง' });
      const day = new Date().toISOString().slice(0, 10);
      const guestKey = crypto.createHmac('sha256', cfg.key).update(`comment-guest:${auth.channel()}:${day}:${ip}`).digest('hex');
      author = { user_id: null, guest_key: guestKey, submitted_on: day, display_name: 'ผู้ชมไม่ระบุตัวตน', avatar_url: null };
    } else {
      const person = await auth.user(req, cfg);
      if (!person) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบด้วย Google อีกครั้ง' });
      author = { user_id: person.id, display_name: person.name, avatar_url: person.avatar };
    }
    const result = await auth.request(cfg, '/rest/v1/comments', {
      method: 'POST', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ ...author, channel: auth.channel(), message, status: 'pending' }),
    });
    if (result.status === 409) return res.status(429).json({ error: mode === 'guest' ? 'โหมดนักท่องเที่ยวส่งได้วันละ 1 รีวิวต่อเครือข่าย ลองใหม่หลัง 07:00 น. (เวลาไทย) หรือเลือกใช้บัญชี Google' : 'ส่งได้วันละ 1 ข้อความต่อบัญชี ระบบเริ่มวันใหม่เวลา 07:00 น. (เวลาไทย)' });
    if (!result.ok) throw new Error('Insert failed');
    return res.status(201).json({ status: 'pending' });
  } catch {
    return res.status(503).json({ error: 'ส่งหรือโหลดข้อความไม่สำเร็จ กรุณาลองใหม่ภายหลัง' });
  }
};

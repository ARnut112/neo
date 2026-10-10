'use strict';
const crypto = require('node:crypto');
const { isIP } = require('node:net');
const auth = require('../lib/comments-server');

async function storageFailure(result, operation) {
  let error;
  try { error = await result.json(); } catch { /* Never log response bodies or personal data. */ }
  const code = typeof error?.code === 'string' && /^[A-Z0-9]{5,12}$/.test(error.code) ? error.code : 'UNKNOWN';
  console.error('comments_storage_error', { operation, status: result.status, code });
  return code;
}

module.exports = async function handler(req, res) {
  auth.setup(res);
  let cfg;
  try { cfg = auth.config(); } catch { return res.status(503).json({ error: 'ยังไม่เปิดรับข้อความ' }); }
  try {
    if (req.method === 'GET') {
      const query = new URLSearchParams({ select: 'id,user_id,display_name,avatar_url,message,created_at', status: 'eq.approved', channel: `eq.${auth.channel()}`, order: 'created_at.desc', limit: '50' });
      const result = await auth.request(cfg, `/rest/v1/comments?${query}`);
      if (!result.ok) { await storageFailure(result, 'read'); throw new Error('Database unavailable'); }
      const rows = await result.json();
      return res.status(200).json({ comments: rows.map(row => ({ id: row.id, name: row.display_name, avatar: row.user_id === null ? null : auth.avatar(row.avatar_url), message: row.message, mode: row.user_id === null ? 'guest' : 'google' })) });
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
      if (input.guestName !== undefined && typeof input.guestName !== 'string') return res.status(400).json({ error: 'กรอกชื่อที่ใช้แสดงไม่เกิน 40 ตัวอักษร' });
      const name = (input.guestName || '').trim().replace(/\s+/gu, ' ');
      if (name.length > 40 || /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(name)) return res.status(400).json({ error: 'กรอกชื่อที่ใช้แสดงไม่เกิน 40 ตัวอักษร โดยไม่ใช้อักขระควบคุม' });
      // Vercel overwrites this header. Do not use caller-provided identity or an in-memory rate limit.
      const forwarded = process.env.VERCEL === '1' ? req.headers['x-vercel-forwarded-for'] : req.socket?.remoteAddress;
      const ip = typeof forwarded === 'string' ? forwarded.trim() : '';
      if (!isIP(ip)) return res.status(503).json({ error: 'ยังส่งแบบนักท่องเที่ยวไม่ได้ กรุณาลองใหม่ภายหลัง' });
      const day = new Date().toISOString().slice(0, 10);
      const guestKey = crypto.createHmac('sha256', cfg.key).update(`comment-guest:${auth.channel()}:${day}:${ip}`).digest('hex');
      author = { user_id: null, guest_key: guestKey, submitted_on: day, display_name: name || 'ผู้ชมไม่ระบุตัวตน', avatar_url: null };
    } else {
      const person = await auth.user(req, cfg);
      if (!person) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบด้วย Google อีกครั้ง' });
      author = { user_id: person.id, display_name: person.name, avatar_url: person.avatar };
    }
    const result = await auth.request(cfg, '/rest/v1/comments', {
      method: 'POST', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ ...author, channel: auth.channel(), message, status: 'pending' }),
    });
    if (!result.ok) {
      const code = await storageFailure(result, `insert_${mode}`);
      if (code === '23505') return res.status(429).json({ error: mode === 'guest' ? 'โหมดนักท่องเที่ยวส่งได้วันละ 1 รีวิวต่อเครือข่าย ลองใหม่หลัง 07:00 น. (เวลาไทย) หรือเลือกใช้บัญชี Google' : 'ส่งได้วันละ 1 ข้อความต่อบัญชี ระบบเริ่มวันใหม่เวลา 07:00 น. (เวลาไทย)' });
      if (mode === 'guest' && ['PGRST204', '42703', '23502', '42501'].includes(code)) {
        return res.status(503).json({ code: 'COMMENT_STORAGE_SETUP_REQUIRED', error: 'โหมดนักท่องเที่ยวยังไม่พร้อมรับรีวิว ข้อความของคุณยังอยู่ กรุณาลองใหม่ภายหลังหรือเลือกใช้บัญชี Google' });
      }
      throw new Error('Insert failed');
    }
    return res.status(201).json({ status: 'pending' });
  } catch {
    return res.status(503).json({ error: 'ส่งหรือโหลดข้อความไม่สำเร็จ กรุณาลองใหม่ภายหลัง' });
  }
};

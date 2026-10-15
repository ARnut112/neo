'use strict';
const auth = require('../lib/comments-server');
const portfolio = require('../lib/portfolio-server');
const STATUSES = ['pending', 'approved', 'rejected'];
const PAGE_SIZE = 24;
async function count(cfg, channel, status) {
  const query = new URLSearchParams({ select: 'id', channel: `eq.${channel}`, status: `eq.${status}` });
  const response = await auth.request(cfg, `/rest/v1/comments?${query}`, { method: 'HEAD', headers: { Prefer: 'count=exact' } });
  const total = response.headers.get('content-range')?.split('/')[1];
  if (!response.ok || !/^\d+$/.test(total || '')) throw new Error('Count unavailable');
  return Number(total);
}
module.exports = async function handler(req, res) {
  auth.setup(res);
  if (!['GET', 'POST'].includes(req.method)) { res.setHeader('Allow', 'GET, POST'); return res.status(405).end(); }
  let cfg;
  try { cfg = auth.config(); } catch { return res.status(503).json({ error: 'ยังไม่ได้ตั้งค่าระบบหลังบ้าน' }); }
  if (req.method === 'POST' && !auth.sameOrigin(req, cfg.site)) return res.status(403).json({ error: 'ไม่อนุญาตคำขอนี้' });
  try {
    if (!await portfolio.admin(req, cfg)) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบด้วยบัญชีผู้ดูแล' });
    const channel = auth.channel();
    if (req.method === 'GET') {
      const params = new URL(req.url, cfg.site).searchParams;
      const status = params.get('status') || 'pending';
      const requestedPage = params.get('page') || '1';
      if (!['all', ...STATUSES].includes(status) || !/^[1-9]\d{0,5}$/.test(requestedPage)) return res.status(400).json({ error: 'ตัวกรองไม่ถูกต้อง' });
      const counts = await Promise.all(STATUSES.map(status => count(cfg, channel, status)));
      const stats = Object.fromEntries(STATUSES.map((status, index) => [status, counts[index]]));
      const total = status === 'all' ? counts.reduce((a, b) => a + b, 0) : stats[status];
      const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
      const page = Math.min(Number(requestedPage), pages);
      const query = new URLSearchParams({ select: 'id,user_id,display_name,avatar_url,message,status,created_at', channel: `eq.${channel}`, order: 'created_at.desc,id.desc', limit: String(PAGE_SIZE), offset: String((page - 1) * PAGE_SIZE) });
      if (status !== 'all') query.set('status', `eq.${status}`);
      const response = await auth.request(cfg, `/rest/v1/comments?${query}`);
      if (!response.ok) throw new Error('Read unavailable');
      const rows = await response.json();
      return res.status(200).json({ channel, stats, page, pages, total, comments: rows.map(row => ({ id: row.id, name: row.display_name, message: row.message, avatar: row.user_id === null ? null : auth.avatar(row.avatar_url), mode: row.user_id === null ? 'guest' : 'google', status: row.status, createdAt: row.created_at })) });
    }
    let input;
    try { input = auth.body(req); } catch { return res.status(400).json({ error: 'คำขอไม่ถูกต้อง' }); }
    if (!portfolio.UUID.test(input.id || '') || !STATUSES.includes(input.status) || !STATUSES.includes(input.previousStatus)) return res.status(400).json({ error: 'เลือกสถานะให้ถูกต้อง' });
    const query = new URLSearchParams({ id: `eq.${input.id}`, channel: `eq.${channel}`, status: `eq.${input.previousStatus}`, select: 'id,status' });
    const response = await auth.request(cfg, `/rest/v1/comments?${query}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ status: input.status }) });
    if (!response.ok) {
      let code;
      try { const error = await response.json(); code = error.code; } catch { /* Keep upstream details private. */ }
      if (code === '42501') return res.status(503).json({ code: 'MODERATION_SETUP_REQUIRED', error: 'ยังบันทึกสถานะไม่ได้ กรุณาตั้งค่าสิทธิ์จัดการรีวิวใน Supabase ตามคู่มือหลังบ้าน' });
      throw new Error('Update unavailable');
    }
    const changed = await response.json();
    if (changed.length !== 1) return res.status(409).json({ error: 'รีวิวนี้อาจเปลี่ยนสถานะหรือถูกลบไปแล้ว กรุณาโหลดรายการล่าสุดก่อนลองอีกครั้ง' });
    return res.status(200).json({ id: changed[0].id, status: changed[0].status });
  } catch { return res.status(503).json({ error: 'โหลดหรือบันทึกรีวิวไม่สำเร็จ กรุณาลองใหม่ภายหลัง' }); }
};

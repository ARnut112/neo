'use strict';
const auth = require('../lib/comments-server');
const portfolio = require('../lib/portfolio-server');
module.exports = async function handler(req, res) {
  auth.setup(res);
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).end(); }
  try {
    const cfg = auth.config();
    const rows = await portfolio.listPhotos(cfg, { select: 'id,category,storage_path,local_path,alt,width,height,sort_order', channel: `eq.${auth.channel()}`, published: 'eq.true', ready: 'eq.true', order: 'sort_order.asc,created_at.asc,id.asc' });
    return res.status(200).json({ categories: portfolio.CATEGORIES, photos: rows.map(row => portfolio.publicPhoto(cfg, row)) });
  } catch { return res.status(503).json({ error: 'ยังโหลดภาพจากคลังไม่ได้' }); }
};

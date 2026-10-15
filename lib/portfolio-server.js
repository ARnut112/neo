'use strict';
const auth = require('./comments-server');
const SESSION = '__Host-neo-admin-session';
const PKCE = '__Host-neo-admin-pkce';
const BUCKET = 'portfolio-images';
const CATEGORIES = [
  { id: 'wedding', name: 'งานแต่ง' },
  { id: 'ordination', name: 'งานบวช' },
  { id: 'graduation', name: 'งานรับปริญญา' },
  { id: 'other', name: 'ผลงานอื่นๆ' },
];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BYTES = 2 * 1024 * 1024;
async function admin(req, cfg) {
  const person = await auth.user(req, cfg, SESSION);
  if (!person || !UUID.test(person.id)) return null;
  const query = new URLSearchParams({ select: 'user_id', user_id: `eq.${person.id}`, limit: '1' });
  const response = await auth.request(cfg, `/rest/v1/portfolio_admins?${query}`);
  if (!response.ok) throw new Error('Admin setup unavailable');
  const rows = await response.json();
  return rows.length === 1 ? person : null;
}
function photoUrl(cfg, row) {
  if (row.local_path && /^img\/[A-Za-z0-9_./ -]+\.(jpg|jpeg|png|webp)$/i.test(row.local_path) && !row.local_path.includes('..')) return `/${row.local_path}`;
  if (typeof row.storage_path === 'string' && /^(production|preview)\/(wedding|ordination|graduation|other)\/[0-9a-f-]{36}\.jpg$/.test(row.storage_path)) {
    return new URL(`/storage/v1/object/public/${BUCKET}/${row.storage_path}`, cfg.url).href;
  }
  throw new Error('Invalid image path');
}
function publicPhoto(cfg, row) {
  return { id: row.id, category: row.category, url: photoUrl(cfg, row), alt: row.alt, width: row.width, height: row.height, sortOrder: row.sort_order };
}
async function listPhotos(cfg, filters) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const query = new URLSearchParams({ ...filters, limit: '500', offset: String(offset) });
    const response = await auth.request(cfg, `/rest/v1/portfolio_photos?${query}`);
    if (!response.ok) throw new Error('Photo list unavailable');
    const page = await response.json();
    if (!Array.isArray(page)) throw new Error('Invalid photo list');
    rows.push(...page);
    if (page.length < 500) return rows;
  }
}
// Verify actual JPEG framing and dimensions, rather than trusting the supplied MIME type.
function jpeg(input) {
  if (typeof input !== 'string' || input.length > Math.ceil(MAX_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(input)) throw new Error('Invalid JPEG');
  const bytes = Buffer.from(input, 'base64');
  if (bytes.length < 20 || bytes.length > MAX_BYTES || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) throw new Error('Invalid JPEG');
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset++] !== 0xff) throw new Error('Invalid JPEG marker');
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0x01 || marker >= 0xd0 && marker <= 0xd7) continue;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) throw new Error('Invalid JPEG segment');
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      if (length < 8) throw new Error('Invalid JPEG frame');
      const height = bytes.readUInt16BE(offset + 3);
      const width = bytes.readUInt16BE(offset + 5);
      if (!width || !height || width > 2560 || height > 2560) throw new Error('Invalid JPEG dimensions');
      return { bytes, width, height };
    }
    offset += length;
  }
  throw new Error('Missing JPEG frame');
}
module.exports = { SESSION, PKCE, BUCKET, CATEGORIES, UUID, MAX_BYTES, admin, photoUrl, publicPhoto, listPhotos, jpeg };

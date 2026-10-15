'use strict';
const crypto = require('node:crypto');
const auth = require('../lib/comments-server');
const portfolio = require('../lib/portfolio-server');

module.exports = async function handler(req, res) {
  auth.setup(res);
  let cfg;
  try { cfg = auth.config(); } catch { return res.status(503).json({ error: 'ยังไม่ได้ตั้งค่าระบบหลังบ้าน' }); }
  const query = new URL(req.url, cfg.site).searchParams;
  if (req.method === 'GET' && (query.has('code') || query.has('error'))) {
    const verifier = auth.cookie(req, portfolio.PKCE);
    const destination = auth.cookie(req, portfolio.RETURN) === 'comments' ? 'admin-comments.html' : 'admin.html';
    const cleared = [auth.setCookie(portfolio.PKCE, '', 0), auth.setCookie(portfolio.RETURN, '', 0)];
    res.setHeader('Set-Cookie', cleared);
    let failure = 'failed';
    try {
      const code = query.get('code');
      if (!code || code.length > 2048 || !/^[A-Za-z0-9_-]{43}$/.test(verifier)) throw new Error('Invalid callback');
      const response = await auth.request(cfg, '/auth/v1/token?grant_type=pkce', { method: 'POST', body: JSON.stringify({ auth_code: code, code_verifier: verifier }) });
      if (!response.ok) throw new Error('Exchange failed');
      const data = await response.json();
      if (!/^[A-Za-z0-9_.-]{20,8192}$/.test(data.access_token) || !Number.isFinite(data.expires_in) || data.expires_in <= 0) throw new Error('Invalid session');
      const person = await portfolio.admin({ headers: { cookie: `${portfolio.SESSION}=${data.access_token}` } }, cfg);
      if (!person) { failure = 'denied'; throw new Error('Not an admin'); }
      res.setHeader('Set-Cookie', [...cleared, auth.setCookie(portfolio.SESSION, data.access_token, Math.min(3600, data.expires_in))]);
      res.setHeader('Location', `${cfg.site}/${destination}`);
    } catch {
      res.setHeader('Set-Cookie', [...cleared, auth.setCookie(portfolio.SESSION, '', 0)]);
      res.setHeader('Location', `${cfg.site}/${destination}?login=${failure}`);
    }
    return res.status(303).end();
  }
  if (req.method === 'GET') {
    try {
      const person = await portfolio.admin(req, cfg);
      return res.status(200).json({ user: person ? { name: person.name, avatar: person.avatar } : null, channel: auth.channel() });
    } catch { return res.status(503).json({ error: 'ตรวจสอบสิทธิ์ไม่ได้ กรุณาตรวจการตั้งค่าหลังบ้านใน Supabase' }); }
  }
  if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return res.status(405).end(); }
  if (!auth.sameOrigin(req, cfg.site)) return res.status(403).json({ error: 'ไม่อนุญาตคำขอนี้' });
  let input;
  try { input = auth.body(req); } catch { return res.status(400).json({ error: 'คำขอไม่ถูกต้อง' }); }
  if (input.action === 'logout') {
    res.setHeader('Set-Cookie', [auth.setCookie(portfolio.SESSION, '', 0), auth.setCookie(portfolio.PKCE, '', 0), auth.setCookie(portfolio.RETURN, '', 0)]);
    return res.status(200).json({ ok: true });
  }
  if (input.action !== 'login') return res.status(400).json({ error: 'คำขอไม่ถูกต้อง' });
  if (input.returnTo !== undefined && !['photos', 'comments'].includes(input.returnTo)) return res.status(400).json({ error: 'คำขอไม่ถูกต้อง' });
  const verifier = crypto.randomBytes(32).toString('base64url');
  const url = new URL('/auth/v1/authorize', cfg.url);
  url.search = new URLSearchParams({ provider: 'google', redirect_to: `${cfg.site}/api/admin-auth`, code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 's256', scopes: 'openid email profile' });
  res.setHeader('Set-Cookie', [auth.setCookie(portfolio.PKCE, verifier, 600), auth.setCookie(portfolio.RETURN, input.returnTo === 'comments' ? 'comments' : 'photos', 600)]);
  return res.status(200).json({ url: url.href });
};

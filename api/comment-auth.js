'use strict';
const crypto = require('node:crypto');
const auth = require('../lib/comments-server');

module.exports = async function handler(req, res) {
  auth.setup(res);
  let cfg;
  try { cfg = auth.config(); } catch { return res.status(503).json({ error: 'ยังไม่เปิดรับข้อความ' }); }
  const query = new URL(req.url, cfg.site).searchParams;
  if (req.method === 'GET' && (query.has('code') || query.has('error'))) {
    // The verifier stays in an HttpOnly cookie; tokens never enter frontend JS.
    const verifier = auth.cookie(req, auth.PKCE);
    res.setHeader('Set-Cookie', auth.setCookie(auth.PKCE, '', 0));
    try {
      const code = query.get('code');
      if (!code || code.length > 2048 || !/^[A-Za-z0-9_-]{43}$/.test(verifier)) throw new Error('Invalid callback');
      const response = await auth.request(cfg, '/auth/v1/token?grant_type=pkce', {
        method: 'POST', body: JSON.stringify({ auth_code: code, code_verifier: verifier }),
      });
      if (!response.ok) throw new Error('Exchange failed');
      const data = await response.json();
      if (!/^[A-Za-z0-9_.-]{20,8192}$/.test(data.access_token) || !Number.isFinite(data.expires_in) || data.expires_in <= 0) throw new Error('Invalid session');
      res.setHeader('Set-Cookie', [auth.setCookie(auth.PKCE, '', 0), auth.setCookie(auth.SESSION, data.access_token, Math.min(3600, data.expires_in))]);
      res.setHeader('Location', `${cfg.site}/#comments`);
    } catch {
      res.setHeader('Location', `${cfg.site}/?comment-login=failed#comments`);
    }
    return res.status(303).end();
  }
  if (req.method === 'GET') {
    try {
      const person = await auth.user(req, cfg);
      return res.status(200).json({ user: person ? { name: person.name, avatar: person.avatar } : null });
    } catch { return res.status(503).json({ error: 'ตรวจสอบการเข้าสู่ระบบไม่ได้ กรุณาลองใหม่' }); }
  }
  if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return res.status(405).end(); }
  if (!auth.sameOrigin(req, cfg.site)) return res.status(403).json({ error: 'ไม่อนุญาตคำขอนี้' });
  let input;
  try { input = auth.body(req); } catch { return res.status(400).json({ error: 'คำขอไม่ถูกต้อง' }); }
  if (input.action === 'logout') {
    res.setHeader('Set-Cookie', [auth.setCookie(auth.SESSION, '', 0), auth.setCookie(auth.PKCE, '', 0)]);
    return res.status(200).json({ ok: true });
  }
  if (input.action !== 'login') return res.status(400).json({ error: 'คำขอไม่ถูกต้อง' });
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const url = new URL('/auth/v1/authorize', cfg.url);
  url.search = new URLSearchParams({ provider: 'google', redirect_to: `${cfg.site}/api/comment-auth`, code_challenge: challenge, code_challenge_method: 's256', scopes: 'openid email profile' });
  res.setHeader('Set-Cookie', auth.setCookie(auth.PKCE, verifier, 600));
  return res.status(200).json({ url: url.href });
};

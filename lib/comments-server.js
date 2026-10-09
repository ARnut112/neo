'use strict';

const SESSION = '__Host-neo-comment-session';
const PKCE = '__Host-neo-comment-pkce';
function config() {
  const url = new URL(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const site = new URL(process.env.COMMENTS_SITE_URL);
  if (url.protocol !== 'https:' || site.protocol !== 'https:' || !key) throw new Error('Configuration');
  return { url, key, site: site.origin };
}
function cookie(req, name) {
  return (req.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith(`${name}=`))?.slice(name.length + 1) || '';
}
function setCookie(name, value, seconds) {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${seconds}`;
}
function setup(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}
function sameOrigin(req, site) {
  return req.headers.origin === site && req.headers['sec-fetch-site'] !== 'cross-site';
}
function body(req) {
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw new Error('Invalid body');
  const value = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid body');
  return value;
}
async function request(cfg, path, options = {}, token) {
  const headers = { apikey: cfg.key, 'Content-Type': 'application/json', ...options.headers };
  if (token) headers.Authorization = `Bearer ${token}`;
  else if (!cfg.key.startsWith('sb_secret_')) headers.Authorization = `Bearer ${cfg.key}`;
  return fetch(new URL(path, cfg.url), { ...options, headers, signal: AbortSignal.timeout(6000), redirect: 'error' });
}
function avatar(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.endsWith('.googleusercontent.com') && !url.username && !url.password && !url.port ? url.href : null;
  } catch { return null; }
}
async function user(req, cfg) {
  const token = cookie(req, SESSION);
  if (!/^[A-Za-z0-9_.-]{20,8192}$/.test(token)) return null;
  const result = await request(cfg, '/auth/v1/user', {}, token);
  if (result.status === 401 || result.status === 403) return null;
  if (!result.ok) throw new Error('Auth unavailable');
  const data = await result.json();
  const identity = data.identities?.find(item => item.provider === 'google')?.identity_data;
  if (!data.id || !data.email_confirmed_at || !identity) return null;
  return {
    id: data.id,
    name: String(identity.full_name || identity.name || 'ผู้ชม').trim().slice(0, 80) || 'ผู้ชม',
    avatar: avatar(identity.avatar_url || identity.picture),
  };
}
function channel() { return process.env.VERCEL_ENV === 'production' ? 'production' : 'preview'; }
module.exports = { SESSION, PKCE, config, cookie, setCookie, setup, sameOrigin, body, request, avatar, user, channel };

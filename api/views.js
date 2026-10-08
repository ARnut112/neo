'use strict';

// Vercel Node.js Function. Credentials never reach the browser.
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Prevent another website from incrementing via a visitor's browser.
  // This is not bot protection; direct requests can still be made.
  if (req.headers['sec-fetch-site'] === 'cross-site') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (req.headers.origin) {
    try {
      if (new URL(req.headers.origin).host !== req.headers.host) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    } catch {
      return res.status(403).json({ error: 'Forbidden' });
    }
  }
  // Preview/testing deployments must not inflate the live website's count.
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production') {
    return res.status(204).end();
  }

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return res.status(503).json({ error: 'Counter unavailable' });

  try {
    const endpoint = new URL('/rest/v1/rpc/increment_page_views', url);
    if (endpoint.protocol !== 'https:') throw new Error('Invalid database URL');
    const headers = { apikey: key, 'Content-Type': 'application/json' };
    // New sb_secret keys use apikey only; legacy service_role is a JWT.
    if (!key.startsWith('sb_secret_')) headers.Authorization = `Bearer ${key}`;
    const response = await fetch(endpoint, {
      method: 'POST', headers, body: '{}',
      signal: AbortSignal.timeout(5000), redirect: 'error',
    });
    if (!response.ok) {
      console.error('View counter database HTTP status:', response.status);
      return res.status(502).json({ error: 'Counter unavailable' });
    }
    // Keep bigint as decimal text instead of rounding through a JS number.
    const views = (await response.text()).trim();
    if (!/^\d+$/.test(views) || views.length > 19) throw new Error('Invalid count');
    return res.status(200).json({ views });
  } catch {
    // Do not expose upstream responses or credentials. Do not retry an increment:
    // a timed-out request may already have committed in the database.
    return res.status(503).json({ error: 'Counter unavailable' });
  }
};

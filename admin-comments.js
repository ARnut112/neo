'use strict';
(() => {
  const el = id => document.getElementById(id);
  const names = { pending: 'รอตรวจสอบ', approved: 'อนุมัติแล้ว', rejected: 'ไม่เผยแพร่' };
  let status = 'pending', page = 1, pages = 1, busy = false;
  const notice = new URL(location.href).searchParams.get('login');
  async function api(path, body) {
    const response = await fetch(path, { method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(25000), ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
    let data;
    try { data = await response.json(); } catch { throw new Error('ติดต่อระบบไม่ได้ กรุณาลองใหม่'); }
    if (!response.ok) {
      if (response.status === 401) {
        el('admin-workspace').hidden = true; el('admin-login-panel').hidden = false;
        el('admin-login-status').textContent = 'กรุณาเข้าสู่ระบบด้วยบัญชีผู้ดูแลอีกครั้ง';
      }
      const error = new Error(data.error || 'ทำรายการไม่สำเร็จ'); error.status = response.status; throw error;
    }
    return data;
  }
  function setBusy(value) {
    busy = value;
    el('review-list').setAttribute('aria-busy', String(value));
    document.querySelectorAll('#admin-workspace button').forEach(button => { button.disabled = value; });
    if (!value) { el('review-prev').disabled = page <= 1; el('review-next').disabled = page >= pages; }
  }
  function render(data) {
    page = data.page; pages = data.pages;
    Object.keys(names).forEach(key => { el(`review-count-${key}`).textContent = data.stats[key]; });
    el('review-pagination').hidden = pages <= 1;
    el('review-page').textContent = `${page} / ${pages}`;
    el('review-prev').disabled = page <= 1; el('review-next').disabled = page >= pages;
    el('review-empty').hidden = data.comments.length > 0;
    el('review-empty').textContent = status === 'pending' ? 'ไม่มีรีวิวที่รอตรวจสอบในขณะนี้ครับ' : 'ไม่มีรีวิวในสถานะที่เลือกครับ';
    el('review-list').replaceChildren();
    data.comments.forEach(comment => {
      const card = document.createElement('article'); card.className = 'admin-review-card'; card.dataset.id = comment.id;
      const header = document.createElement('div'); header.className = 'admin-review-header';
      const avatar = document.createElement('span'); avatar.className = 'admin-review-avatar'; avatar.setAttribute('aria-hidden','true'); avatar.textContent = comment.mode === 'guest' ? '◎' : Array.from(comment.name || 'ผู้ชม')[0];
      try {
        const url = new URL(comment.avatar);
        if (comment.mode === 'google' && url.protocol === 'https:' && url.hostname.endsWith('.googleusercontent.com')) {
          const image = document.createElement('img'); image.alt = ''; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer'; image.src = url.href;
          image.addEventListener('error', () => image.remove(), {once:true}); avatar.replaceChildren(image);
        }
      } catch { /* Keep the fallback icon. */ }
      const author = document.createElement('div'); author.className = 'admin-review-author';
      const name = document.createElement('strong'); name.textContent = comment.name;
      const mode = document.createElement('small'); mode.textContent = comment.mode === 'guest' ? 'ไม่ได้เข้าสู่ระบบ' : 'บัญชี Google'; author.append(name, mode); header.append(avatar, author);
      const message = document.createElement('p'); message.className = 'admin-review-message'; message.textContent = comment.message;
      const meta = document.createElement('div'); meta.className = 'admin-review-meta';
      const badge = document.createElement('span'); badge.className = 'admin-review-badge'; badge.dataset.status = comment.status; badge.textContent = names[comment.status];
      const time = document.createElement('time');
      const date = new Date(comment.createdAt);
      if (!Number.isNaN(date.valueOf())) { time.dateTime = date.toISOString(); time.textContent = new Intl.DateTimeFormat('th-TH',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Bangkok'}).format(date); }
      meta.append(badge,time);
      const actions = document.createElement('div'); actions.className = 'admin-review-actions';
      ['approved','rejected','pending'].filter(next=>next!==comment.status).forEach(next => {
        const button = document.createElement('button'); button.type = 'button'; button.dataset.action = next;
        button.className = `admin-button${next === 'approved' ? ' admin-button-gold' : ''}`; button.textContent = next === 'approved' ? 'อนุมัติรีวิว' : next === 'rejected' ? 'ไม่เผยแพร่' : 'กลับไปรอตรวจสอบ';
        button.addEventListener('click', () => moderate(comment, next)); actions.append(button);
      });
      card.append(header,message,meta,actions); el('review-list').append(card);
    });
  }
  async function load() {
    render(await api(`/api/admin-comments?${new URLSearchParams({status,page:String(page)})}`));
  }
  async function refresh() {
    if (busy) return;
    setBusy(true); el('review-status').textContent = 'กำลังโหลดรีวิว…';
    try { await load(); el('review-status').textContent = ''; }
    catch (error) { el('review-status').textContent = error.message; }
    finally { setBusy(false); }
  }
  async function moderate(comment, next) {
    if (busy) return;
    setBusy(true); el('review-status').textContent = 'กำลังบันทึกสถานะ…';
    let saved = false;
    try {
      await api('/api/admin-comments', {id:comment.id,status:next,previousStatus:comment.status});
      saved = true;
      await load();
      el('review-status').textContent = next === 'approved' ? 'อนุมัติแล้ว รีวิวจะแสดงบนเว็บไซต์เมื่อโหลดหน้าใหม่' : next === 'rejected' ? 'บันทึกแล้ว รีวิวนี้จะไม่แสดงบนเว็บไซต์เมื่อโหลดหน้าใหม่' : 'ย้ายกลับไปรอตรวจสอบแล้ว';
    } catch (error) { el('review-status').textContent = saved ? 'บันทึกสถานะแล้ว แต่โหลดรายการใหม่ไม่ได้ กรุณากดโหลดใหม่' : error.message; }
    finally { setBusy(false); el('review-status').focus({preventScroll:true}); }
  }
  el('review-filters').querySelectorAll('button').forEach(button => button.addEventListener('click', () => {
    if (busy) return; status = button.dataset.status; page = 1;
    el('review-filters').querySelectorAll('button').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
    refresh();
  }));
  el('review-refresh').addEventListener('click', refresh);
  el('review-prev').addEventListener('click', () => { if (!busy && page > 1) { page--; refresh(); } });
  el('review-next').addEventListener('click', () => { if (!busy && page < pages) { page++; refresh(); } });
  async function checkSession() {
    el('admin-login').disabled = true; el('admin-check').disabled = true;
    try {
      const data = await api('/api/admin-auth');
      el('admin-workspace').hidden = !data.user; el('admin-login-panel').hidden = !!data.user;
      if (data.user) {
        el('admin-user').textContent = data.user.name;
        el('admin-environment').textContent = data.channel === 'production' ? 'เว็บไซต์จริง' : 'เว็บทดสอบ';
        await refresh();
      } else if (!notice) el('admin-login-status').textContent = 'พร้อมเข้าสู่ระบบด้วยบัญชีผู้ดูแล';
    } catch (error) { el('admin-login-status').textContent = error.message; }
    finally { el('admin-login').disabled = false; el('admin-check').disabled = false; }
  }
  el('admin-check').addEventListener('click', checkSession);
  el('admin-login').addEventListener('click', async () => {
    el('admin-login').disabled = true; el('admin-login-status').textContent = 'กำลังพาไปเข้าสู่ระบบ…';
    try { const data = await api('/api/admin-auth',{action:'login',returnTo:'comments'}); location.assign(data.url); }
    catch (error) { el('admin-login-status').textContent = error.message; el('admin-login').disabled = false; }
  });
  el('admin-logout').addEventListener('click', async () => {
    if (busy) return; setBusy(true);
    try { await api('/api/admin-auth',{action:'logout'}); el('review-list').replaceChildren(); el('admin-workspace').hidden = true; el('admin-login-panel').hidden = false; el('admin-login-status').textContent = 'ออกจากระบบแล้ว'; el('admin-login').focus(); }
    catch (error) { el('review-status').textContent = error.message; }
    finally { setBusy(false); }
  });
  if (notice) {
    el('admin-login-status').textContent = notice === 'denied' ? 'บัญชีนี้ยังไม่มีสิทธิ์ผู้ดูแล กรุณาเลือกบัญชีที่ลงทะเบียนไว้' : 'เข้าสู่ระบบไม่สำเร็จหรือยกเลิก กรุณาลองใหม่';
    const url = new URL(location.href); url.searchParams.delete('login'); history.replaceState(null,'',url.pathname+url.search);
  }
  checkSession();
})();

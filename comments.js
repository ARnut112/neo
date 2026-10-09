'use strict';

(() => {
  const section = document.getElementById('comments');
  if (!section) return;
  const el = id => document.getElementById(id);
  const stage = el('comment-stage');
  const bubble = el('comment-bubble');
  const empty = el('comment-empty');
  const feedback = el('comment-feedback');
  const form = el('comment-form');
  const login = el('comment-login');
  const logout = el('comment-logout');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let comments = [];
  let index = 0;
  let paused = false;
  let hovered = false;
  let visible = !('IntersectionObserver' in window);
  let timer;
  let animation;

  async function api(path, payload) {
    const response = await fetch(path, {
      method: payload ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store',
      ...(payload ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) } : {}),
      signal: AbortSignal.timeout(10000),
    });
    let data;
    try { data = await response.json(); } catch { throw new Error('ติดต่อระบบไม่ได้ กรุณาลองใหม่ภายหลัง'); }
    if (!response.ok) {
      const error = new Error(data.error || 'ติดต่อระบบไม่ได้ กรุณาลองใหม่ภายหลัง');
      error.status = response.status;
      throw error;
    }
    return data;
  }
  function render(animate = false) {
    const item = comments[index];
    if (!item) return;
    el('comment-message').textContent = item.message;
    el('comment-name').textContent = item.name;
    const avatar = el('comment-avatar');
    avatar.replaceChildren();
    avatar.textContent = Array.from(item.name || 'ผู้ชม')[0];
    try {
      const url = new URL(item.avatar);
      if (url.protocol === 'https:' && url.hostname.endsWith('.googleusercontent.com')) {
        const image = document.createElement('img');
        image.alt = '';
        image.referrerPolicy = 'no-referrer';
        image.addEventListener('error', () => image.remove(), { once: true });
        image.src = url.href;
        avatar.append(image);
      }
    } catch { /* Keep the initial when no profile image is available. */ }
    el('comment-position').textContent = `${index + 1} / ${comments.length}`;
    animation?.cancel();
    if (animate && !motion.matches && bubble.animate) {
      animation = bubble.animate([{ opacity: .15, transform: 'translateY(12px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 420, easing: 'ease-out' });
    }
  }
  function sync() {
    clearInterval(timer);
    if (comments.length < 2 || paused || hovered || !visible || document.hidden || motion.matches || section.contains(document.activeElement) || el('comment-compose').open) return;
    timer = setInterval(() => { index = (index + 1) % comments.length; render(true); }, 7000);
  }
  function step(direction) {
    index = (index + direction + comments.length) % comments.length;
    render(true);
    sync();
  }
  el('comment-prev').addEventListener('click', () => step(-1));
  el('comment-next').addEventListener('click', () => step(1));
  el('comment-pause').addEventListener('click', () => {
    paused = !paused;
    el('comment-pause').textContent = paused ? 'เล่นต่อ' : 'พักการเลื่อน';
    el('comment-pause').setAttribute('aria-pressed', String(paused));
    sync();
  });
  stage.addEventListener('pointerenter', event => { if (event.pointerType === 'mouse') { hovered = true; sync(); } });
  stage.addEventListener('pointerleave', () => { hovered = false; sync(); });
  document.addEventListener('focusin', sync);
  document.addEventListener('visibilitychange', sync);
  el('comment-compose').addEventListener('toggle', sync);
  motion.addEventListener('change', () => { animation?.cancel(); sync(); });
  if ('IntersectionObserver' in window) new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); }, { threshold: .2 }).observe(stage);
  api('/api/comments').then(data => {
    comments = Array.isArray(data.comments) ? data.comments.filter(item => typeof item.name === 'string' && typeof item.message === 'string') : [];
    empty.hidden = comments.length > 0;
    bubble.hidden = comments.length === 0;
    empty.textContent = 'ยังไม่มีข้อความที่เผยแพร่ ฝากความรู้สึกแรกไว้ให้ผมได้เลยครับ';
    el('comment-controls').hidden = comments.length < 2;
    render();
    sync();
  }).catch(() => { empty.textContent = 'ยังโหลดข้อความไม่ได้ ลองกลับมาอ่านอีกครั้งได้ครับ'; });

  function session(person) {
    login.hidden = !!person;
    el('comment-login-reason').hidden = !!person;
    form.hidden = !person;
    logout.hidden = !person;
    el('comment-identity').hidden = !person;
    el('comment-identity').textContent = person ? `เขียนในชื่อ ${person.name}` : '';
  }
  api('/api/comment-auth').then(data => { session(data.user); login.disabled = false; }).catch(error => { feedback.textContent = error.message; });
  login.addEventListener('click', async () => {
    login.disabled = true;
    feedback.textContent = 'กำลังพาไปเข้าสู่ระบบ…';
    try {
      const data = await api('/api/comment-auth', { action: 'login' });
      window.location.assign(data.url);
    } catch (error) { feedback.textContent = error.message; login.disabled = false; }
  });
  logout.addEventListener('click', async () => {
    logout.disabled = true;
    try {
      await api('/api/comment-auth', { action: 'logout' });
      form.reset();
      el('comment-length').textContent = '0 / 400';
      session(null);
      feedback.textContent = 'ออกจากระบบแล้ว';
    } catch (error) { feedback.textContent = error.message; }
    finally { logout.disabled = false; }
  });
  el('comment-input').addEventListener('input', event => { el('comment-length').textContent = `${event.target.value.length} / 400`; });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const submit = el('comment-submit');
    submit.disabled = true;
    feedback.textContent = 'กำลังส่งข้อความ…';
    try {
      await api('/api/comments', { message: el('comment-input').value, consent: el('comment-consent').checked });
      form.reset();
      el('comment-length').textContent = '0 / 400';
      feedback.textContent = 'ขอบคุณครับ ส่งแล้วและกำลังรออนุมัติ ข้อความยังไม่แสดงบนเว็บไซต์';
    } catch (error) {
      feedback.textContent = error.message;
      if (error.status === 401) { session(null); login.disabled = false; }
    } finally { submit.disabled = false; }
  });
  const url = new URL(location.href);
  if (url.searchParams.has('comment-login')) {
    feedback.textContent = 'เข้าสู่ระบบไม่สำเร็จหรือยกเลิก ลองกดเข้าสู่ระบบอีกครั้งได้ครับ';
    el('comment-compose').open = true;
    url.searchParams.delete('comment-login');
    history.replaceState(null, '', url.pathname + url.search + url.hash);
  } else if (location.hash === '#comments') el('comment-compose').open = true;
})();

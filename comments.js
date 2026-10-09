'use strict';

(() => {
  const section = document.getElementById('comments');
  if (!section) return;
  const el = id => document.getElementById(id);
  const stage = el('comment-stage');
  const empty = el('comment-empty');
  const feedback = el('comment-feedback');
  const form = el('comment-form');
  const login = el('comment-login');
  const logout = el('comment-logout');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let comments = [];
  let index = 0;
  let cards = [];

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
  function updatePosition() {
    if (!cards.length) return;
    const left = stage.getBoundingClientRect().left;
    index = cards.reduce((nearest, card, i) =>
      Math.abs(card.getBoundingClientRect().left - left) < Math.abs(cards[nearest].getBoundingClientRect().left - left) ? i : nearest, 0);
    el('comment-position').textContent = `${index + 1} / ${cards.length}`;
    el('comment-prev').disabled = index === 0;
    el('comment-next').disabled = index === cards.length - 1;
  }
  function step(direction) {
    if (!cards.length) return;
    index = Math.max(0, Math.min(cards.length - 1, index + direction));
    stage.scrollTo({ left: cards[index].offsetLeft - cards[0].offsetLeft, behavior: motion.matches ? 'instant' : 'smooth' });
  }
  el('comment-prev').addEventListener('click', () => step(-1));
  el('comment-next').addEventListener('click', () => step(1));
  stage.addEventListener('keydown', event => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    step(event.key === 'ArrowLeft' ? -1 : 1);
  });
  stage.addEventListener('scroll', updatePosition, { passive: true });
  window.addEventListener('resize', updatePosition);
  function render() {
    cards = comments.map(item => {
      const card = el('comment-template').content.firstElementChild.cloneNode(true);
      card.querySelector('.comment-message').textContent = item.message;
      card.querySelector('.comment-name').textContent = item.name;
      const avatar = card.querySelector('.comment-avatar');
      avatar.textContent = Array.from(item.name || 'ผู้ชม')[0];
      try {
        const url = new URL(item.avatar);
        if (url.protocol === 'https:' && url.hostname.endsWith('.googleusercontent.com')) {
          const image = document.createElement('img');
          image.alt = '';
          image.loading = 'lazy';
          image.referrerPolicy = 'no-referrer';
          image.addEventListener('error', () => image.remove(), { once: true });
          image.src = url.href;
          avatar.append(image);
        }
      } catch { /* Keep the initial when no profile image is available. */ }
      stage.append(card);
      return card;
    });
    stage.classList.toggle('comment-stage-single', cards.length === 1);
    updatePosition();
  }
  api('/api/comments').then(data => {
    comments = Array.isArray(data.comments) ? data.comments.filter(item => typeof item.name === 'string' && typeof item.message === 'string') : [];
    empty.hidden = comments.length > 0;
    empty.textContent = 'ยังไม่มีข้อความที่เผยแพร่ ฝากความรู้สึกแรกไว้ให้ผมได้เลยครับ';
    el('comment-controls').hidden = comments.length < 2;
    render();
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

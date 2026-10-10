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
  const dialog = el('comment-compose');
  const opener = el('comment-open');
  function openComposer() {
    if (dialog.open) return;
    if (!el('comment-success').hidden) feedback.textContent = '';
    el('comment-success').hidden = true;
    el('comment-editor').hidden = false;
    el('comment-dialog-title').textContent = 'เขียนคอมเมนต์';
    dialog.showModal();
    dialog.scrollTop = 0;
    document.documentElement.classList.add('comment-modal-open');
    sync();
  }
  opener.addEventListener('click', openComposer);
  el('comment-close').addEventListener('click', () => dialog.close());
  el('comment-done').addEventListener('click', () => dialog.close());
  function showThanks() {
    el('comment-editor').hidden = true;
    el('comment-success').hidden = false;
    el('comment-dialog-title').textContent = 'ขอบคุณสำหรับรีวิวครับ';
    dialog.scrollTop = 0;
    if (dialog.open) el('comment-dialog-title').focus({ preventScroll: true });
  }
  dialog.addEventListener('close', () => {
    document.documentElement.classList.remove('comment-modal-open');
    opener.focus({ preventScroll: true });
    sync();
  });
  let backdropDown = false;
  function outside(event) {
    const box = dialog.getBoundingClientRect();
    return event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
  }
  dialog.addEventListener('pointerdown', event => { backdropDown = event.target === dialog && outside(event); });
  dialog.addEventListener('click', event => {
    if (backdropDown && event.target === dialog && outside(event)) dialog.close();
    backdropDown = false;
  });
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let comments = [];
  let index = 0;
  let paused = false;
  let hovered = false;
  let visible = !('IntersectionObserver' in window);
  let timer;
  let animation;
  let person = null;
  let authReady = false;
  let busy = false;
  const draftKey = 'neo-comment-draft-v1';
  function mode() { return el('comment-mode-guest').checked ? 'guest' : 'google'; }
  function clearDraft() { try { sessionStorage.removeItem(draftKey); } catch { /* Storage may be disabled. */ } }
  function saveDraft() {
    try {
      sessionStorage.setItem(draftKey, JSON.stringify({ message: el('comment-input').value, savedAt: Date.now() }));
      return true;
    } catch { return false; }
  }
  try {
    const draft = JSON.parse(sessionStorage.getItem(draftKey));
    if (draft && typeof draft.message === 'string' && draft.message.length <= 400 && Number.isFinite(draft.savedAt) && Date.now() - draft.savedAt < 86400000 && Date.now() >= draft.savedAt) {
      el('comment-input').value = draft.message;
      el('comment-length').textContent = `${draft.message.length} / 400`;
    } else clearDraft();
  } catch { clearDraft(); }

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
    avatar.textContent = item.name === 'ผู้ชมไม่ระบุตัวตน' && !item.avatar ? '◎' : Array.from(item.name || 'ผู้ชม')[0];
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

  function session(value) {
    person = value;
    updateMethod();
  }
  function updateMethod() {
    const google = mode() === 'google';
    login.hidden = !google || !!person;
    login.disabled = busy || !authReady;
    el('comment-submit').hidden = google && !person;
    el('comment-submit').disabled = busy;
    el('comment-login-reason').hidden = !google;
    el('comment-guest-note').hidden = google;
    logout.hidden = !person;
    el('comment-identity').hidden = !google || !person;
    el('comment-identity').textContent = person && google ? `รีวิวในชื่อ ${person.name}` : '';
    el('comment-consent-text').textContent = google ? 'ยินยอมให้เผยแพร่รีวิวพร้อมชื่อและรูปโปรไฟล์ Google หลังได้รับอนุมัติ' : 'ยินยอมให้เผยแพร่รีวิวในชื่อ “ผู้ชมไม่ระบุตัวตน” หลังได้รับอนุมัติ';
    form.querySelectorAll('input[name="review-mode"]').forEach(input => { input.disabled = busy; });
    logout.disabled = busy;
  }
  form.querySelectorAll('input[name="review-mode"]').forEach(input => input.addEventListener('change', () => {
    el('comment-consent').checked = false;
    feedback.textContent = '';
    updateMethod();
  }));
  updateMethod();
  api('/api/comment-auth').then(data => { session(data.user); }).catch(() => {
    feedback.textContent = 'ตรวจสอบบัญชี Google ไม่ได้ในขณะนี้ คุณยังส่งรีวิวแบบนักท่องเที่ยวได้ครับ';
  }).finally(() => { authReady = true; updateMethod(); });
  async function startLogin() {
    if (!saveDraft()) {
      feedback.textContent = 'เบราว์เซอร์เก็บข้อความก่อนไปล็อกอินไม่ได้ กรุณาคัดลอกข้อความไว้ หรือเลือกโหมดนักท่องเที่ยว';
      return;
    }
    busy = true;
    updateMethod();
    feedback.textContent = 'กำลังพาไปเข้าสู่ระบบ…';
    try {
      const data = await api('/api/comment-auth', { action: 'login' });
      window.location.assign(data.url);
    } catch (error) { feedback.textContent = error.message; busy = false; updateMethod(); }
  }
  logout.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    updateMethod();
    try {
      await api('/api/comment-auth', { action: 'logout' });
      el('comment-consent').checked = false;
      session(null);
      feedback.textContent = 'ออกจากระบบแล้ว';
    } catch (error) { feedback.textContent = error.message; }
    finally { busy = false; updateMethod(); }
  });
  el('comment-input').addEventListener('input', event => { el('comment-length').textContent = `${event.target.value.length} / 400`; });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    if (busy) return;
    if (mode() === 'google' && !person) {
      if (authReady) await startLogin();
      return;
    }
    busy = true;
    const selectedMode = mode();
    updateMethod();
    feedback.textContent = 'กำลังส่งข้อความ…';
    try {
      await api('/api/comments', { message: el('comment-input').value, mode: selectedMode, consent: el('comment-consent').checked });
      clearDraft();
      form.reset();
      el('comment-length').textContent = '0 / 400';
      feedback.textContent = 'ขอบคุณครับ ส่งแล้วและกำลังรออนุมัติ ข้อความยังไม่แสดงบนเว็บไซต์';
      showThanks();
    } catch (error) {
      feedback.textContent = error.message;
      if (error.status === 401) { session(null); }
    } finally { busy = false; updateMethod(); }
  });
  const url = new URL(location.href);
  if (url.searchParams.has('comment-login')) {
    feedback.textContent = 'เข้าสู่ระบบไม่สำเร็จหรือยกเลิก ลองกดเข้าสู่ระบบอีกครั้งได้ครับ';
    openComposer();
    url.searchParams.delete('comment-login');
    history.replaceState(null, '', url.pathname + url.search + url.hash);
  } else if (location.hash === '#comments') openComposer();
})();

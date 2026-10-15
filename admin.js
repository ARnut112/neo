'use strict';
(() => {
  const el = id => document.getElementById(id);
  let photos = [], categories = [], activeCategory = 'all', busy = false, previews = [], deleting = null, loginNotice = false;
  async function api(path, data) {
    const response = await fetch(path, { method: data ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(45000), ...(data ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : {}) });
    let result;
    try { result = await response.json(); } catch { throw new Error('ติดต่อระบบไม่ได้ กรุณาลองใหม่'); }
    if (!response.ok) {
      const error = new Error(result.error || 'ทำรายการไม่สำเร็จ');
      error.status = response.status;
      if (response.status === 401) {
        el('admin-workspace').hidden = true;
        el('admin-login-panel').hidden = false;
        el('admin-login-status').textContent = 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบผู้ดูแลอีกครั้ง';
      }
      throw error;
    }
    return result;
  }
  function setBusy(value) {
    busy = value;
    document.querySelectorAll('#admin-workspace button, #admin-upload-form input, #admin-upload-form select, #admin-photos input, #admin-photos select').forEach(control => { control.disabled = value; });
    if (!value) document.querySelectorAll('[data-incomplete="true"]').forEach(control => { control.disabled = true; });
  }
  function fillCategories(select, selected) {
    select.replaceChildren();
    categories.forEach(category => {
      const option = document.createElement('option'); option.value = category.id; option.textContent = category.name; option.selected = category.id === selected; select.append(option);
    });
  }
  function defaultOrder() {
    const rows = photos.filter(photo => photo.category === el('admin-category').value);
    el('admin-order').value = Math.min(100000, rows.length ? Math.max(...rows.map(photo => photo.sortOrder)) + 10 : 10);
  }
  function field(form, text, type, value, name) {
    const label = document.createElement('label');
    const input = document.createElement(type === 'select' ? 'select' : 'input');
    if (type !== 'select') input.type = type;
    input.name = name;
    if (type === 'select') fillCategories(input, value); else input.value = value;
    label.textContent = text; label.append(input); form.append(label);
    return input;
  }
  function safeImage(url) {
    try { const parsed = new URL(url, location.origin); return parsed.origin === location.origin || parsed.protocol === 'https:' && parsed.hostname.endsWith('.supabase.co'); } catch { return false; }
  }
  function render() {
    el('admin-total').textContent = photos.length;
    el('admin-visible').textContent = photos.filter(photo => photo.ready && photo.published).length;
    const query = el('admin-search').value.trim().toLocaleLowerCase();
    const filtered = photos.filter(photo => (activeCategory === 'all' || photo.category === activeCategory) && photo.alt.toLocaleLowerCase().includes(query));
    el('admin-empty').hidden = filtered.length !== 0;
    el('admin-photos').replaceChildren();
    filtered.forEach(photo => {
      const card = document.createElement('article'); card.className = 'admin-photo-card'; card.dataset.id = photo.id;
      const preview = document.createElement('div'); preview.className = 'admin-photo-preview';
      if (photo.ready && safeImage(photo.url)) {
        const image = document.createElement('img'); image.src = photo.url; image.alt = photo.alt; image.loading = 'lazy'; image.width = photo.width; image.height = photo.height;
        image.addEventListener('error', () => { image.remove(); preview.prepend(document.createTextNode('โหลดภาพตัวอย่างไม่ได้')); }, { once: true }); preview.append(image);
      } else preview.textContent = 'อัปโหลดไม่ครบ';
      const badge = document.createElement('span'); badge.className = 'admin-photo-badge'; badge.textContent = !photo.ready ? 'อัปโหลดไม่ครบ · ลบแล้วลองใหม่' : photo.published ? 'แสดงบนเว็บ' : 'ซ่อนจากเว็บ'; preview.append(badge);
      const form = document.createElement('form');
      const meta = document.createElement('span'); meta.className = 'admin-photo-meta'; meta.textContent = `${photo.width} × ${photo.height} · ${photo.source === 'original' ? 'ภาพเดิมในโปรเจกต์' : 'ภาพอัปโหลด'}`; form.append(meta);
      const alt = field(form, 'คำอธิบายภาพ', 'text', photo.alt, 'alt'); alt.maxLength = 160; alt.required = true;
      const category = field(form, 'หมวดงาน', 'select', photo.category, 'category');
      const order = field(form, 'ลำดับ', 'number', photo.sortOrder, 'order'); order.min = 0; order.max = 100000; order.step = 1; order.required = true;
      const label = document.createElement('label'); label.className = 'admin-checkbox';
      const published = document.createElement('input'); published.type = 'checkbox'; published.checked = photo.published; published.disabled = !photo.ready; published.dataset.incomplete = String(!photo.ready); label.append(published, document.createTextNode(' แสดงบนเว็บไซต์')); form.append(label);
      const actions = document.createElement('div'); actions.className = 'admin-photo-actions';
      const save = document.createElement('button'); save.type = 'submit'; save.className = 'admin-button'; save.textContent = 'บันทึก';
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'admin-button admin-button-danger'; remove.textContent = 'ลบภาพ'; actions.append(save, remove); form.append(actions);
      const status = document.createElement('p'); status.className = 'admin-status'; status.setAttribute('role', 'status'); form.append(status);
      form.addEventListener('submit', async event => {
        event.preventDefault(); if (busy || !form.reportValidity()) return;
        setBusy(true); status.textContent = 'กำลังบันทึก…';
        try {
          await api('/api/admin-photos', { action: 'update', id: photo.id, alt: alt.value, category: category.value, sortOrder: Number(order.value), published: published.checked });
          await loadPhotos(); el('admin-list-status').textContent = 'บันทึกแล้ว หน้าเว็บไซต์จะแสดงข้อมูลใหม่เมื่อโหลดอีกครั้ง';
        } catch (error) { status.textContent = error.message; }
        finally { setBusy(false); }
      });
      remove.addEventListener('click', () => {
        deleting = photo;
        el('admin-delete-description').textContent = photo.source === 'original' ? `“${photo.alt}” จะถูกนำออกจากสไลด์ ไฟล์ต้นฉบับในโปรเจกต์ยังอยู่` : `“${photo.alt}” จะถูกนำออกจากสไลด์และลบไฟล์ที่อัปโหลด การลบจะย้อนกลับไม่ได้`;
        el('admin-delete-dialog').showModal();
      });
      card.append(preview, form); el('admin-photos').append(card);
    });
  }
  async function loadPhotos() {
    const data = await api('/api/admin-photos');
    photos = data.photos; categories = data.categories;
    const selected = el('admin-category').value;
    fillCategories(el('admin-category'), selected || categories[0].id);
    el('admin-filters').replaceChildren();
    [{ id: 'all', name: 'ทั้งหมด' }, ...categories].forEach(category => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'admin-button'; button.textContent = category.name; button.setAttribute('aria-pressed', String(activeCategory === category.id));
      button.addEventListener('click', () => {
        if (busy) return;
        activeCategory = category.id;
        el('admin-filters').querySelectorAll('button').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
        render();
      }); el('admin-filters').append(button);
    });
    defaultOrder(); render();
  }
  async function checkSession() {
    el('admin-login').disabled = true;
    try {
      const data = await api('/api/admin-auth');
      el('admin-workspace').hidden = !data.user;
      el('admin-login-panel').hidden = !!data.user;
      if (data.user) {
        el('admin-user').textContent = data.user.name;
        el('admin-environment').textContent = data.channel === 'production' ? 'เว็บไซต์จริง' : 'เว็บทดสอบ';
        el('admin-list-status').textContent = 'กำลังโหลดคลังภาพ…';
        await loadPhotos(); el('admin-list-status').textContent = '';
      } else if (!loginNotice) el('admin-login-status').textContent = 'พร้อมเข้าสู่ระบบด้วยบัญชีผู้ดูแล';
    } catch (error) { el('admin-login-status').textContent = error.message; el('admin-list-status').textContent = error.message; }
    finally { el('admin-login').disabled = false; }
  }
  el('admin-check').addEventListener('click', checkSession);
  el('admin-login').addEventListener('click', async () => {
    el('admin-login').disabled = true; el('admin-login-status').textContent = 'กำลังพาไปเข้าสู่ระบบ…';
    try { const data = await api('/api/admin-auth', { action: 'login' }); location.assign(data.url); }
    catch (error) { el('admin-login-status').textContent = error.message; el('admin-login').disabled = false; }
  });
  el('admin-logout').addEventListener('click', async () => {
    if (busy) return; setBusy(true);
    try { await api('/api/admin-auth', { action: 'logout' }); photos = []; el('admin-photos').replaceChildren(); await checkSession(); }
    catch (error) { el('admin-list-status').textContent = error.message; } finally { setBusy(false); }
  });
  el('admin-category').addEventListener('change', defaultOrder);
  el('admin-search').addEventListener('input', () => { if (!busy) render(); });
  el('admin-refresh').addEventListener('click', async () => {
    if (busy) return; setBusy(true);
    try { await loadPhotos(); el('admin-list-status').textContent = 'โหลดรายการล่าสุดแล้ว'; } catch (error) { el('admin-list-status').textContent = error.message; } finally { setBusy(false); }
  });
  function clearPreviews() { previews.forEach(url => URL.revokeObjectURL(url)); previews = []; el('admin-file-previews').replaceChildren(); }
  el('admin-files').addEventListener('change', () => {
    clearPreviews();
    Array.from(el('admin-files').files).slice(0, 20).forEach(file => {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return;
      const url = URL.createObjectURL(file); previews.push(url);
      const image = document.createElement('img'); image.src = url; image.alt = file.name; el('admin-file-previews').append(image);
    });
  });
  window.addEventListener('pagehide', clearPreviews);
  async function prepare(file) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 30 * 1024 * 1024) throw new Error('ใช้ JPEG, PNG หรือ WebP ไม่เกิน 30 MB ต่อภาพ');
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    try {
      if (bitmap.width * bitmap.height > 60000000) throw new Error('ภาพใหญ่เกินไป กรุณาย่อก่อนอัปโหลด');
      const scale = Math.min(1, 2560 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d'); context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      let blob;
      for (const quality of [.88, .78, .65, .5]) {
        blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
        if (blob && blob.size <= 2 * 1024 * 1024) break;
      }
      if (!blob || blob.size > 2 * 1024 * 1024) throw new Error('ย่อภาพไม่สำเร็จ กรุณาลองใช้ไฟล์ที่เล็กลง');
      return await new Promise((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ')); reader.readAsDataURL(blob);
      });
    } finally { bitmap.close(); }
  }
  el('admin-upload-form').addEventListener('submit', async event => {
    event.preventDefault(); if (busy || !event.target.reportValidity()) return;
    const files = Array.from(el('admin-files').files);
    if (files.length > 20) { el('admin-upload-status').textContent = 'เลือกได้สูงสุดครั้งละ 20 ภาพครับ'; return; }
    const category = el('admin-category').value, baseAlt = el('admin-alt').value.trim(), start = Number(el('admin-order').value), published = el('admin-publish').checked;
    if (start + files.length - 1 > 100000) { el('admin-upload-status').textContent = 'ลำดับภาพต้องไม่เกิน 100000'; return; }
    setBusy(true); let uploaded = 0; const failures = [];
    try {
      for (let i = 0; i < files.length; i++) {
        el('admin-upload-status').textContent = `กำลังเตรียมและอัปโหลด ${i + 1} / ${files.length}…`;
        try {
          const image = await prepare(files[i]);
          await api('/api/admin-photos', { action: 'upload', category, alt: (baseAlt ? `${baseAlt}${files.length > 1 ? ` · ${i + 1}` : ''}` : files[i].name.replace(/\.[^.]+$/, '')).slice(0, 160) || 'ภาพผลงาน', sortOrder: start + i, published, image });
          uploaded++;
        } catch (error) { failures.push(`${files[i].name}: ${error.message}`); if (error.status === 401) break; }
      }
      try { await loadPhotos(); } catch (error) { failures.push(error.message); }
      el('admin-upload-status').textContent = `อัปโหลดสำเร็จ ${uploaded} / ${files.length} ภาพ${failures.length ? ` · ${failures.join(' · ')}` : published ? ' พร้อมแสดงในหมวดที่เลือกแล้ว' : ' เก็บไว้ในคลังโดยยังไม่แสดงบนเว็บ'}`;
      if (!failures.length) { el('admin-files').value = ''; el('admin-alt').value = ''; clearPreviews(); }
    } finally { setBusy(false); }
  });
  const confirm = el('admin-delete-dialog');
  el('admin-delete-cancel').addEventListener('click', () => confirm.close());
  el('admin-delete-confirm').addEventListener('click', async () => {
    if (!deleting || busy) return;
    const photo = deleting; confirm.close(); setBusy(true);
    try { await api('/api/admin-photos', { action: 'delete', id: photo.id }); await loadPhotos(); el('admin-list-status').textContent = 'ลบภาพแล้ว'; }
    catch (error) { el('admin-list-status').textContent = error.message; }
    finally { deleting = null; setBusy(false); el('admin-refresh').focus({ preventScroll: true }); }
  });
  const current = new URL(location.href);
  if (current.searchParams.has('login')) {
    loginNotice = true;
    el('admin-login-status').textContent = current.searchParams.get('login') === 'denied' ? 'บัญชีนี้ยังไม่มีสิทธิ์ผู้ดูแล กรุณาเลือกบัญชีที่ลงทะเบียนไว้' : 'เข้าสู่ระบบไม่สำเร็จหรือยกเลิก กรุณาลองใหม่';
    current.searchParams.delete('login'); history.replaceState(null, '', current.pathname + current.search);
  }
  checkSession();
})();

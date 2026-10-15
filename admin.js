'use strict';
(() => {
  const el = id => document.getElementById(id);
  let photos = [], categories = [], activeCategory = 'all', busy = false, previews = [], deleting = null, editing = null, loginNotice = false;
  const uploadDialog = el('admin-upload-dialog');
  const editDialog = el('admin-edit-dialog');
  async function api(path, data) {
    const response = await fetch(path, { method: data ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(45000), ...(data ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : {}) });
    let result;
    try { result = await response.json(); } catch { throw new Error('ติดต่อระบบไม่ได้ กรุณาลองใหม่'); }
    if (!response.ok) {
      const error = new Error(result.error || 'ทำรายการไม่สำเร็จ');
      error.status = response.status;
      if (response.status === 401) {
        document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
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
    document.querySelectorAll('#admin-workspace button, #admin-upload-dialog button, #admin-upload-dialog input, #admin-upload-dialog select, #admin-edit-dialog button, #admin-edit-dialog input, #admin-edit-dialog select').forEach(control => { control.disabled = value; });
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
    categories.forEach(category => {
      const groupPhotos = filtered.filter(photo => photo.category === category.id);
      if (!groupPhotos.length) return;
      const group = document.createElement('section'); group.className = 'admin-photo-group'; group.dataset.category = category.id;
      const heading = document.createElement('h2'); heading.className = 'admin-photo-group-title'; heading.textContent = category.name;
      const count = document.createElement('span'); count.textContent = `${groupPhotos.length} ภาพ`; heading.append(count);
      const grid = document.createElement('div'); grid.className = 'admin-photo-grid'; group.append(heading, grid);
      groupPhotos.forEach(photo => {
      const card = document.createElement('article'); card.className = 'admin-photo-card'; card.dataset.id = photo.id;
      const button = document.createElement('button'); button.type = 'button'; button.className = 'admin-photo-select'; button.setAttribute('aria-label', `แก้ไขภาพ ${photo.alt}`); button.setAttribute('aria-haspopup', 'dialog');
      const preview = document.createElement('span'); preview.className = 'admin-photo-preview';
      if (photo.ready && safeImage(photo.url)) {
        const image = document.createElement('img'); image.src = photo.url; image.alt = ''; image.loading = 'lazy'; image.width = photo.width; image.height = photo.height;
        image.addEventListener('error', () => { image.remove(); preview.prepend(document.createTextNode('โหลดภาพตัวอย่างไม่ได้')); }, { once: true }); preview.append(image);
      } else preview.textContent = 'อัปโหลดไม่ครบ';
      const badge = document.createElement('span'); badge.className = 'admin-photo-badge'; badge.textContent = !photo.ready ? 'อัปโหลดไม่ครบ' : photo.published ? 'แสดงบนเว็บ' : 'ซ่อนจากเว็บ'; preview.append(badge);
      const caption = document.createElement('span'); caption.className = 'admin-photo-caption';
      const title = document.createElement('span'); title.className = 'admin-photo-title'; title.textContent = photo.alt;
      const order = document.createElement('span'); order.className = 'admin-photo-order'; order.textContent = `ลำดับ ${photo.sortOrder}`; caption.append(title, order);
      button.append(preview, caption); button.addEventListener('click', () => { if (!busy) openEdit(photo); });
      card.append(button); grid.append(card);
      });
      el('admin-photos').append(group);
    });
  }
  function openEdit(photo) {
    editing = photo;
    el('admin-edit-alt').value = photo.alt;
    fillCategories(el('admin-edit-category'), photo.category);
    el('admin-edit-order').value = photo.sortOrder;
    el('admin-edit-published').checked = photo.published;
    el('admin-edit-published').disabled = !photo.ready;
    el('admin-edit-published').dataset.incomplete = String(!photo.ready);
    el('admin-edit-meta').textContent = `${photo.width} × ${photo.height} · ${photo.source === 'original' ? 'ภาพเดิมในโปรเจกต์' : 'ภาพอัปโหลด'}${!photo.ready ? ' · อัปโหลดไม่ครบ กรุณาลบแล้วลองใหม่' : ''}`;
    el('admin-edit-status').textContent = '';
    const preview = el('admin-edit-preview'); preview.replaceChildren();
    if (photo.ready && safeImage(photo.url)) {
      const image = document.createElement('img'); image.src = photo.url; image.alt = photo.alt;
      image.addEventListener('error', () => { image.remove(); preview.textContent = 'โหลดภาพตัวอย่างไม่ได้'; }, {once:true}); preview.append(image);
    } else preview.textContent = 'อัปโหลดไม่ครบ';
    editDialog.showModal(); editDialog.scrollTop = 0;
  }
  el('admin-add-photo').addEventListener('click', () => {
    if (busy) return;
    if (activeCategory !== 'all') el('admin-category').value = activeCategory;
    defaultOrder(); el('admin-upload-status').textContent = '';
    uploadDialog.showModal(); uploadDialog.scrollTop = 0;
  });
  [[uploadDialog, 'admin-upload-close'], [editDialog, 'admin-edit-close']].forEach(([dialog, closeId]) => {
    el(closeId).addEventListener('click', () => { if (!busy) dialog.close(); });
    dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  });
  el('admin-edit-form').addEventListener('submit', async event => {
    event.preventDefault(); if (busy || !editing || !event.target.reportValidity()) return;
    const id = editing.id;
    const data = { action: 'update', id, alt: el('admin-edit-alt').value, category: el('admin-edit-category').value, sortOrder: Number(el('admin-edit-order').value), published: el('admin-edit-published').checked };
    setBusy(true); el('admin-edit-status').textContent = 'กำลังบันทึก…';
    let saved = false;
    try {
      await api('/api/admin-photos', data); saved = true; editDialog.close();
      if (activeCategory !== 'all') activeCategory = data.category;
      await loadPhotos(); el('admin-list-status').textContent = 'บันทึกแล้ว หน้าเว็บไซต์จะแสดงข้อมูลใหม่เมื่อโหลดอีกครั้ง';
    } catch (error) {
      if (saved) el('admin-list-status').textContent = 'บันทึกแล้ว แต่โหลดรายการใหม่ไม่ได้ กรุณากดโหลดใหม่';
      else el('admin-edit-status').textContent = error.message;
    } finally {
      setBusy(false);
      if (saved) {
        editing = null;
        const card = Array.from(el('admin-photos').querySelectorAll('.admin-photo-card')).find(card => card.dataset.id === id);
        (card?.querySelector('button') || el('admin-refresh')).focus({preventScroll:true});
      }
    }
  });
  el('admin-edit-delete').addEventListener('click', () => {
    if (busy || !editing) return;
    deleting = editing;
    el('admin-delete-description').textContent = editing.source === 'original' ? `“${editing.alt}” จะถูกนำออกจากสไลด์ ไฟล์ต้นฉบับในโปรเจกต์ยังอยู่` : `“${editing.alt}” จะถูกนำออกจากสไลด์และลบไฟล์ที่อัปโหลด การลบจะย้อนกลับไม่ได้`;
    el('admin-delete-dialog').showModal();
  });
  async function loadPhotos() {
    const data = await api('/api/admin-photos');
    photos = data.photos; categories = data.categories;
    const selected = el('admin-category').value;
    fillCategories(el('admin-category'), selected || categories[0].id);
    el('admin-filters').replaceChildren();
    [{ id: 'all', name: 'ทั้งหมด' }, ...categories].forEach(category => {
      const count = category.id === 'all' ? photos.length : photos.filter(photo => photo.category === category.id).length;
      const button = document.createElement('button'); button.type = 'button'; button.className = 'admin-button'; button.textContent = category.name; button.setAttribute('aria-label', category.name); button.setAttribute('aria-pressed', String(activeCategory === category.id));
      const badge = document.createElement('span'); badge.className = 'admin-category-count'; badge.textContent = count; button.append(badge);
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
      if (uploaded) { activeCategory = category; el('admin-search').value = ''; }
      try { await loadPhotos(); } catch (error) { failures.push(error.message); }
      el('admin-upload-status').textContent = `อัปโหลดสำเร็จ ${uploaded} / ${files.length} ภาพ${failures.length ? ` · ${failures.join(' · ')}` : published ? ' พร้อมแสดงในหมวดที่เลือกแล้ว' : ' เก็บไว้ในคลังโดยยังไม่แสดงบนเว็บ'}`;
      if (!failures.length) {
        el('admin-files').value = ''; el('admin-alt').value = ''; clearPreviews();
        el('admin-list-status').textContent = el('admin-upload-status').textContent; uploadDialog.close();
      }
    } finally { setBusy(false); if (!uploadDialog.open) el('admin-add-photo').focus({preventScroll:true}); }
  });
  const confirm = el('admin-delete-dialog');
  el('admin-delete-cancel').addEventListener('click', () => confirm.close());
  el('admin-delete-confirm').addEventListener('click', async () => {
    if (!deleting || busy) return;
    const photo = deleting; confirm.close(); setBusy(true);
    try {
      await api('/api/admin-photos', { action: 'delete', id: photo.id }); editDialog.close(); editing = null;
      await loadPhotos(); el('admin-list-status').textContent = 'ลบภาพแล้ว';
    }
    catch (error) { (editDialog.open ? el('admin-edit-status') : el('admin-list-status')).textContent = error.message; }
    finally { deleting = null; setBusy(false); if (!editDialog.open) el('admin-refresh').focus({ preventScroll: true }); }
  });
  const current = new URL(location.href);
  if (current.searchParams.has('login')) {
    loginNotice = true;
    el('admin-login-status').textContent = current.searchParams.get('login') === 'denied' ? 'บัญชีนี้ยังไม่มีสิทธิ์ผู้ดูแล กรุณาเลือกบัญชีที่ลงทะเบียนไว้' : 'เข้าสู่ระบบไม่สำเร็จหรือยกเลิก กรุณาลองใหม่';
    current.searchParams.delete('login'); history.replaceState(null, '', current.pathname + current.search);
  }
  checkSession();
})();

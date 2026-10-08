'use strict';

const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
const behavior = () => motion.matches ? 'auto' : 'smooth';
document.getElementById('year').textContent = new Date().getFullYear();

const header = document.querySelector('.site-header');
const nav = document.getElementById('main-nav');
const toggle = document.getElementById('nav-toggle');
const mobile = window.matchMedia('(max-width: 720px)');
function setMenu(open) {
  nav.classList.toggle('is-open', open);
  toggle.setAttribute('aria-expanded', String(open));
  toggle.setAttribute('aria-label', open ? 'ปิดเมนู' : 'เปิดเมนู');
  nav.inert = mobile.matches && !open;
}
toggle.setAttribute('aria-controls', 'main-nav');
toggle.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => setMenu(false)));
mobile.addEventListener('change', () => setMenu(false));
document.addEventListener('click', event => { if (!header.contains(event.target)) setMenu(false); });
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
    setMenu(false);
    toggle.focus();
  }
});
setMenu(false);
document.documentElement.classList.add('js');

const back = document.getElementById('back-to-top');
let scrollPending = false;
function updateScroll() {
  header.classList.toggle('is-scrolled', window.scrollY > 20);
  back.classList.toggle('is-visible', window.scrollY > 320);
  scrollPending = false;
}
window.addEventListener('scroll', () => {
  if (!scrollPending) { scrollPending = true; requestAnimationFrame(updateScroll); }
}, { passive: true });
updateScroll();
back.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: behavior() });
  document.querySelector('.brand').focus({ preventScroll: true });
});

// Native dialog keeps keyboard focus inside the viewer and the background inert.
const viewer = document.getElementById('lightbox');
const photo = document.getElementById('lightbox-img');
const caption = document.getElementById('lightbox-caption');
let activeImages = [];
let activeIndex = 0;
let opener;
let currentCaption = '';
function showImage(index) {
  activeIndex = (index + activeImages.length) % activeImages.length;
  const image = activeImages[activeIndex];
  currentCaption = `${activeIndex + 1} / ${activeImages.length} — ${image.closest('figure')?.querySelector('figcaption')?.textContent || image.alt}`;
  caption.textContent = currentCaption;
  photo.alt = image.alt;
  photo.src = image.currentSrc || image.src;
}
photo.addEventListener('error', () => { caption.textContent = `${currentCaption} · โหลดภาพไม่สำเร็จ กรุณาเลือกภาพถัดไป`; });
photo.addEventListener('load', () => { caption.textContent = currentCaption; });
function openViewer(images, index, trigger) {
  if (typeof viewer.showModal !== 'function') { window.location.assign(images[index].src); return; }
  activeImages = images;
  opener = trigger;
  showImage(index);
  viewer.showModal();
  document.body.classList.add('viewer-open');
  document.getElementById('lightbox-close').focus();
}
function closeViewer() { viewer.close(); }
document.getElementById('lightbox-close').addEventListener('click', closeViewer);
document.getElementById('lightbox-prev').addEventListener('click', () => showImage(activeIndex - 1));
document.getElementById('lightbox-next').addEventListener('click', () => showImage(activeIndex + 1));
viewer.addEventListener('close', () => {
  document.body.classList.remove('viewer-open');
  opener?.focus({ preventScroll: true });
  photo.removeAttribute('src');
});
viewer.addEventListener('click', event => { if (event.target === viewer) closeViewer(); });
viewer.addEventListener('keydown', event => {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    showImage(activeIndex + (event.key === 'ArrowRight' ? 1 : -1));
  }
});
let touchStart = null;
viewer.addEventListener('touchstart', event => {
  touchStart = event.touches.length === 1 ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null;
}, { passive: true });
viewer.addEventListener('touchend', event => {
  if (!touchStart) return;
  const dx = event.changedTouches[0].clientX - touchStart.x;
  const dy = event.changedTouches[0].clientY - touchStart.y;
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) showImage(activeIndex + (dx < 0 ? 1 : -1));
  touchStart = null;
}, { passive: true });
viewer.addEventListener('touchcancel', () => { touchStart = null; });

document.querySelectorAll('.grid').forEach(gallery => {
  const images = Array.from(gallery.querySelectorAll('img'));
  images.forEach((image, index) => {
    const card = image.closest('.tile, .feature-card');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'image-open';
    button.setAttribute('aria-label', `ดูภาพ ${image.alt} (${index + 1}/${images.length})`);
    button.setAttribute('aria-haspopup', 'dialog');
    card.append(button);
    button.addEventListener('click', () => openViewer(images, index, button));
  });
});

/* Highlight auto-scroll — original draft */
const highlightScrolls = document.querySelectorAll('.highlight-scroll');

function setupHighlightAutoScroll(scroll) {
  let animationId;
  let isVisible = false;
  let lastTimestamp = 0;
  let loopWidth = 0;
  const direction = 1;

  const originalCards = Array.from(scroll.children);
  const loopMarker = document.createElement('span');
  loopMarker.className = 'highlight-loop-marker';
  loopMarker.setAttribute('aria-hidden', 'true');
  scroll.appendChild(loopMarker);

  originalCards.forEach((card) => {
    const clone = card.cloneNode(true);
    clone.setAttribute('aria-hidden', 'true');
    scroll.appendChild(clone);
  });

  loopWidth = loopMarker.offsetLeft - originalCards[0].offsetLeft;
  scroll.scrollLeft = loopWidth / 2;

  function stopAutoScroll() {
    window.cancelAnimationFrame(animationId);
    animationId = undefined;
    lastTimestamp = 0;
  }

  function startAutoScroll() {
    stopAutoScroll();
    if (!isVisible) return;

    function animate(timestamp) {
      if (!lastTimestamp) lastTimestamp = timestamp;
      const elapsed = Math.min(timestamp - lastTimestamp, 40);
      lastTimestamp = timestamp;
      scroll.scrollLeft += elapsed * 0.035 * direction;

      if (direction === 1 && scroll.scrollLeft >= loopWidth) {
        scroll.scrollLeft -= loopWidth;
      }

      animationId = window.requestAnimationFrame(animate);
    }

    animationId = window.requestAnimationFrame(animate);
  }

  const observer = new IntersectionObserver(([entry]) => {
    isVisible = entry.isIntersecting;
    if (isVisible) startAutoScroll();
    else stopAutoScroll();
  }, { threshold: 0.2 });

  observer.observe(scroll);
}

highlightScrolls.forEach(setupHighlightAutoScroll);

if ('IntersectionObserver' in window) {
  const sections = Array.from(nav.querySelectorAll('a'));
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      sections.forEach(link => {
        if (link.hash === `#${entry.target.id}`) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    });
  }, { rootMargin: '-15% 0px -50% 0px' });
  document.querySelectorAll('#hero, #works, #highlights, #about, #contact').forEach(section => observer.observe(section));
}

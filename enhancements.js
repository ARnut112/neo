'use strict';

// Decorative enhancements are independent of the original slideshow.
(() => {
  const progress = document.getElementById('reading-progress');
  let pending = false;
  function updateProgress() {
    const distance = document.documentElement.scrollHeight - window.innerHeight;
    progress.value = distance > 0 ? Math.max(0, Math.min(100, window.scrollY / distance * 100)) : 0;
    pending = false;
  }
  function scheduleProgress() {
    if (!pending) { pending = true; requestAnimationFrame(updateProgress); }
  }
  if (progress) {
    window.addEventListener('scroll', scheduleProgress, { passive: true });
    window.addEventListener('resize', scheduleProgress);
    window.addEventListener('load', scheduleProgress);
    if ('ResizeObserver' in window) new ResizeObserver(scheduleProgress).observe(document.body);
    updateProgress();
  }

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (!('IntersectionObserver' in window) || !Element.prototype.animate) return;
  const running = new Set();
  // Content stays visible without JS. Animate once only when it enters view;
  // never animate the moving rails or their parents.
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      observer.unobserve(entry.target);
      if (reduced.matches) return;
      const animation = entry.target.animate([
        { opacity: 0.25, transform: 'translateY(22px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ], { duration: 650, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
      running.add(animation);
      animation.onfinish = animation.oncancel = () => running.delete(animation);
    });
  }, { threshold: 0.08 });
  document.querySelectorAll('.works-head, .tile, .collection-intro, .about-media, .about-copy, .contact > *').forEach(element => observer.observe(element));
  reduced.addEventListener('change', () => {
    if (reduced.matches) running.forEach(animation => animation.cancel());
  });
})();

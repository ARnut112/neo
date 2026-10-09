'use strict';

(() => {
  const contact = document.getElementById('quick-contact');
  if (!contact) return;
  const trigger = contact.querySelector('summary');
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && contact.open) {
      contact.open = false;
      trigger.focus({ preventScroll: true });
    }
  });
  document.addEventListener('click', event => {
    if (!contact.contains(event.target)) contact.open = false;
  });
  document.addEventListener('focusin', event => {
    if (!contact.contains(event.target)) contact.open = false;
  });
})();

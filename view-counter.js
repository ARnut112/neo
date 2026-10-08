'use strict';

(async function countPageView() {
  const output = document.getElementById('view-count');
  if (!output) return;
  try {
    const response = await fetch('/api/views', {
      method: 'POST', cache: 'no-store', credentials: 'same-origin',
      signal: AbortSignal.timeout(8000),
    });
    if (response.status === 204) return;
    if (!response.ok) throw new Error('Counter unavailable');
    const data = await response.json();
    if (typeof data.views !== 'string' || !/^\d{1,19}$/.test(data.views)) {
      throw new Error('Invalid count');
    }
    output.textContent = new Intl.NumberFormat('en-US').format(BigInt(data.views));
  } catch {
    // An unavailable counter must not interrupt the gallery or invent a total.
    output.textContent = '—';
  }
})();

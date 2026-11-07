// Shared, dependency-free markup for the app's animated loading state.
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function loadingHtml(label = 'Loading…', className = '') {
  return `<div class="app-loading ${escape(className)}" role="status">
    <svg class="feed-loading-graph" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path d="M6 7 16 16 26 7M6 26 16 16 26 26" fill="none" stroke="#4b5563" stroke-width="1.8" stroke-linecap="round"/>
      <circle class="flg-node flg-n1" cx="6" cy="7" r="4" fill="#8e44ad" stroke="#6c3483"/>
      <circle class="flg-node flg-n2" cx="26" cy="7" r="4" fill="#e74c3c" stroke="#c0392b"/>
      <circle class="flg-node flg-n3" cx="6" cy="26" r="4" fill="#3498db" stroke="#2980b9"/>
      <circle class="flg-node flg-n4" cx="26" cy="26" r="4" fill="#27ae60" stroke="#1e8449"/>
      <circle class="flg-center" cx="16" cy="16" r="6" fill="#f5a623" stroke="#c47d00" stroke-width="1.5"/>
    </svg><span>${escape(label)}</span>
  </div>`;
}

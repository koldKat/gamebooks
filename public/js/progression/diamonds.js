export const DIAMOND_SVG = '<svg class="diamond-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2h8l3 4-7 8L1 6z" fill="#67e8f9" stroke="#22d3ee" stroke-linejoin="round"/><path d="M1 6h14M4 2l4 12 4-12M4 2l4 4 4-4" fill="none" stroke="#0891b2" stroke-linejoin="round"/></svg>';

export function updateDiamondsDisplay(balance, data) {
  const el = document.getElementById('diamonds-display');
  if (!el) return;
  const visible = Number.isSafeInteger(balance) && balance >= 0;
  el.hidden = !visible;
  if (!visible) {
    el.textContent = '';
    el.removeAttribute('aria-label');
    el.dataset.tooltip = 'Black Market: Diamonds';
    return;
  }
  const formatted = balance.toLocaleString();
  el.innerHTML = `${DIAMOND_SVG} ${formatted}`;
  el.setAttribute('aria-label', `Black Market, ${formatted} diamonds`);
  el.dataset.tooltip = Number.isSafeInteger(data?.diamondExchangeRate)
    ? `Black Market: 1 diamond = ${data.diamondExchangeRate.toLocaleString()} GC`
    : 'Black Market: Diamonds';
}

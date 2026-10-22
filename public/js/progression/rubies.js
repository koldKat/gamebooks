export const RUBY_SVG = '<svg class="ruby-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2h8l3 4-7 8L1 6z" fill="#fda4af" stroke="#fb7185" stroke-linejoin="round"/><path d="M1 6h14M4 2l4 12 4-12M4 2l4 4 4-4" fill="none" stroke="#be123c" stroke-linejoin="round"/></svg>';

export function updateRubiesDisplay(balance, data) {
  const el = document.getElementById('rubies-display');
  if (!el) return;
  const visible = Number.isSafeInteger(balance) && balance >= 0;
  el.hidden = !visible;
  if (!visible) {
    el.textContent = '';
    el.removeAttribute('aria-label');
    el.dataset.tooltip = 'Ruby Exchange';
    return;
  }
  const formatted = balance.toLocaleString();
  el.innerHTML = `${RUBY_SVG} ${formatted}`;
  el.setAttribute('aria-label', `Ruby Exchange, ${formatted} rubies`);
  el.dataset.tooltip = Number.isSafeInteger(data?.rubyExchangeRate)
    ? `Ruby Exchange: 1 ruby = ${data.rubyExchangeRate.toLocaleString()} GC`
    : 'Ruby Exchange';
}

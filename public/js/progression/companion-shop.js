// Present the admin companion marketplace and dispose previews when it closes.
import { apiFetch, getToken } from '../core/state.js';
import { COIN_SVG } from '../ui-helpers/coin-icon.js';
import { updateCoinsDisplay } from './shop.js';
import { cursorDesigns } from '../seasonal-events/cursor-designs.js';
import { createDesignPreviews } from '../seasonal-events/cursor-previews.js';
import { loadingHtml } from '../ui-helpers/loading.js';
import { initTooltip } from '../ui-helpers/tooltip.js';
import '../ui-helpers/dialog-escape.js';

const designs = Object.values(cursorDesigns).flat();
const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('companion-market') : null;
let allowedToken = null, dialog, data, stopPreviews, generation = 0, tab = 'buy', busy = false;
const pendingSales = new Map();
const messages = {
  last_copy: 'Keep your last companion. Only spare copies can be listed.',
  level_zero: 'Reach player level 1 to buy companions.',
  already_owned: 'You already have this companion.',
  insufficient_coins: 'You do not have enough gold coins.',
  price_changed: 'Your level changed. Check the updated price and try again.',
  unavailable: 'This listing is no longer available.',
  not_found: 'This listing is no longer available.',
};

export function updateCompanionShopButton(collection) {
  const button = document.getElementById('companions-shop-btn');
  const enabled = collection?.companionShopEnabled === true;
  allowedToken = enabled ? getToken() : null;
  if (!button) return;
  button.hidden = !enabled;
  if (!enabled) { button.replaceChildren(); close(); return; }
  const count = Object.values(collection.quantities || {}).reduce((sum, quantity) => sum + Math.max(0, quantity - 1), 0);
  button.innerHTML = '<span class="companion-icon" aria-hidden="true"></span> ' + count.toLocaleString();
  button.setAttribute('aria-label', `Companions Shop, ${count.toLocaleString()} spare companions to sell`);
  button.dataset.tooltip = `Companions Shop: ${count.toLocaleString()} available to sell`;
}
function dispose() { stopPreviews?.(); stopPreviews = null; }
function close() {
  ++generation; dispose(); data = null;
  dialog?.close(); dialog?.querySelector('.companion-shop-items').replaceChildren();
}
function status(text) { dialog.querySelector('[role="status"]').textContent = text; }
function actionButton(label, handler, disabled = false) {
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'shop-buy-btn'; button.textContent = label;
  button.disabled = disabled || busy;
  button.addEventListener('click', handler); return button;
}
function render() {
  dispose();
  const holder = dialog.querySelector('.companion-shop-items'); holder.replaceChildren();
  dialog.querySelector('.companion-shop-balance').innerHTML = COIN_SVG + ' ' + data.coinsBalance.toLocaleString();
  for (const button of dialog.querySelectorAll('[role="tab"]')) {
    const selected = button.dataset.tab === tab;
    button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1;
  }
  holder.setAttribute('aria-labelledby', 'companion-shop-' + tab);
  dialog.querySelector('.companion-shop-note').textContent = tab === 'buy'
    ? data.price < 1 ? 'Reach player level 1 to buy companions.' : 'Each companion costs your current player level in gold coins.'
    : 'List spare copies for other players. You receive gold when someone buys; remove a listing to take it back.';
  const rows = tab === 'buy' ? data.buying : [...data.sellable, ...data.listings];
  if (!rows.length) {
    const empty = document.createElement('p'); empty.className = 'companion-shop-empty';
    empty.textContent = tab === 'buy' ? 'No new companions are for sale.' : 'No spare companions to sell.';
    holder.append(empty); return;
  }
  // A type has one preview even when several copies of it are listed.
  const visible = designs.filter(design => rows.some(row => row.itemId === design.id));
  stopPreviews = createDesignPreviews(holder, visible);
  for (const host of holder.querySelectorAll('[data-cursor-preview]')) {
    const id = host.dataset.cursorPreview, card = host.parentElement;
    card.classList.add('companion-shop-item');
    if (tab === 'buy') {
      const row = data.buying.find(row => row.itemId === id);
      const button = actionButton('Buy ', () => trade('buy', { listingId: row.listingId, expectedPrice: data.price }), data.price < 1 || data.coinsBalance < data.price);
      button.append(document.createTextNode(data.price.toLocaleString() + ' '));
      const coin = document.createElement('span'); coin.innerHTML = COIN_SVG; button.append(coin);
      card.append(button);
    } else {
      const spare = data.sellable.find(row => row.itemId === id);
      if (spare) {
        card.append(actionButton(`Sell (${spare.quantity.toLocaleString()} spare)`, () => {
          if (!pendingSales.has(id)) pendingSales.set(id, crypto.randomUUID());
          trade('sell', { itemId: id, requestId: pendingSales.get(id) });
        }));
      }
      for (const row of data.listings.filter(row => row.itemId === id))
        card.append(actionButton('Remove listing', () => trade('cancel', { listingId: row.id })));
    }
  }
}
async function load() {
  const token = getToken(), sequence = ++generation;
  if (!token || token !== allowedToken) return;
  dispose(); dialog.querySelector('.companion-shop-items').innerHTML = loadingHtml();
  try {
    const response = await apiFetch('/api/companion-market');
    if (token !== getToken() || sequence !== generation || !dialog.open) return;
    if (response.status === 403) { updateCompanionShopButton(null); return; }
    if (!response.ok) throw Error();
    const next = await response.json();
    if (token !== getToken() || sequence !== generation || !dialog.open) return;
    data = next; render(); status('');
  } catch { if (sequence === generation && dialog.open) status('Unable to load. Close and try again.'); }
}
async function trade(action, body) {
  const token = getToken();
  if (busy || token !== allowedToken) return;
  busy = true; const sequence = ++generation;
  if (data && dialog.open) render(); status('');
  try {
    const response = await apiFetch('/api/companion-market/' + action, { method: 'POST', body: JSON.stringify(body) });
    const result = await response.json();
    if (token !== getToken()) return;
    if (!response.ok) {
      if (action === 'sell') pendingSales.delete(body.itemId);
      if (response.status === 403) { updateCompanionShopButton(null); return; }
      if (sequence === generation && dialog.open) { await load(); status(messages[result.error] || 'Unable to complete this trade.'); }
      return;
    }
    if (action === 'sell') pendingSales.delete(body.itemId);
    updateCoinsDisplay(result.coinsBalance);
    window.dispatchEvent(new Event('companions-changed')); channel?.postMessage({ changed: true });
    if (sequence === generation && dialog.open) { data = result; render(); status(action === 'sell' ? 'Companion listed.' : action === 'cancel' ? 'Companion returned.' : 'Companion purchased.'); }
  } catch { if (sequence === generation && dialog.open) status('Connection interrupted. Try again; the same trade will not be charged twice.'); }
  finally { busy = false; if (token === getToken() && dialog?.open && data) render(); }
}
function open() {
  if (!getToken() || getToken() !== allowedToken) return;
  initTooltip();
  if (!dialog) {
    dialog = document.createElement('dialog'); dialog.id = 'companion-shop-dialog';
    dialog.setAttribute('aria-labelledby', 'companion-shop-title');
    dialog.innerHTML = '<header><h2 id="companion-shop-title">Companions</h2><span class="companion-shop-balance"></span><button type="button" data-dialog-close aria-label="Close Companions Shop">✕</button></header><div class="shop-tabs" role="tablist" aria-label="Companion trades"><button type="button" id="companion-shop-buy" role="tab" data-tab="buy" aria-controls="companion-shop-items" aria-selected="true">Buy</button><button type="button" id="companion-shop-sell" role="tab" data-tab="sell" aria-controls="companion-shop-items" aria-selected="false" tabindex="-1">Sell</button></div><p class="companion-shop-note"></p><div id="companion-shop-items" class="companion-shop-items" role="tabpanel"></div><p role="status" aria-live="polite"></p>';
    dialog.querySelector('[data-dialog-close]').addEventListener('click', close);
    dialog.addEventListener('cancel', close); dialog.addEventListener('close', () => {
      if (!dialog.open) { dispose(); dialog.querySelector('.companion-shop-items').replaceChildren(); }
    });
    for (const button of dialog.querySelectorAll('[role="tab"]')) {
      const select = () => { tab = button.dataset.tab; if (data) { render(); status(''); } };
      button.addEventListener('click', select);
      button.addEventListener('keydown', event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const next = dialog.querySelector(`[data-tab="${event.key === 'Home' ? 'buy' : event.key === 'End' ? 'sell' : tab === 'buy' ? 'sell' : 'buy'}"]`); next.click(); next.focus(); } });
    }
    document.body.append(dialog);
  }
  tab = 'buy'; dialog.showModal(); load();
}
document.addEventListener('click', event => { if (event.target.closest?.('#companions-shop-btn')) open(); });
function reset() { allowedToken = null; pendingSales.clear(); close(); const button = document.getElementById('companions-shop-btn'); if (button) button.hidden = true; }
window.addEventListener('auth-token-change', reset);
window.addEventListener('auth-expired', reset);
window.addEventListener('storage', event => { if (event.key === null || event.key === 'gamebook_auth_token') reset(); });
channel?.addEventListener('message', () => { window.dispatchEvent(new Event('companions-changed')); if (dialog?.open && !busy) load(); });
window.addEventListener('companion-market-updated', () => {
  if (!getToken() || allowedToken !== getToken()) return;
  window.dispatchEvent(new Event('companions-changed'));
  if (dialog?.open && !busy) load();
});

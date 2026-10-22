import { apiFetch, getToken } from '../core/state.js';
import { COIN_SVG } from '../ui-helpers/coin-icon.js';
import { DIAMOND_SVG } from './diamonds.js';
import { showConfirm } from '../ui-helpers/confirm.js';

let _profile = null, _generation = 0, _busy = false, _pending = null, _hooks = {}, _direction = 'sell', _closeConfirmation = null;
const el = name => document.getElementById('exchange-shop-' + name);

function amount() {
  const value = el('amount').value;
  return /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : 0;
}

function message(text, error = false) {
  el('message').textContent = text;
  el('message').classList.toggle('exchange-shop-message--error', error);
}

function render() {
  const ready = Number.isSafeInteger(_profile?.diamondsBalance);
  const balance = ready ? _profile.diamondsBalance : 0, buying = _direction === 'buy';
  const rate = (buying ? _profile?.diamondBuyRate : _profile?.diamondExchangeRate) || 0;
  const stock = Math.max(0, _profile?.diamondPurchaseStock || 0);
  const maximum = buying ? (rate > 0 ? Math.min(stock, Math.max(0, Math.floor((_profile?.coinsBalance || 0) / rate))) : 0) : balance;
  el('stock').hidden = !buying;
  el('stock').innerHTML = `(Diamonds available for purchase: <span class="exchange-shop-stock-value">${stock.toLocaleString()}</span>)`;
  el('balance').innerHTML = `<span class="shop-modal-balance exchange-shop-diamonds">${DIAMOND_SVG} ${balance.toLocaleString()}</span><span class="shop-modal-balance">${COIN_SVG} ${Number(_profile?.coinsBalance || 0).toLocaleString()}</span>`;
  const sold = Number(_profile?.diamondsExchanged || 0), bought = Number(_profile?.diamondsBought || 0);
  el('total').textContent = `${(sold + bought).toLocaleString()} exchanged`;
  el('total').dataset.tooltip = `${sold.toLocaleString()} sold · ${bought.toLocaleString()} bought`;
  el('amount-label').textContent = buying ? 'Diamonds to buy' : 'Diamonds to sell';
  el('tip').textContent = buying ? 'Diamonds are added to your balance immediately.' : 'Gold coins are added to your balance immediately.';
  el('sell').setAttribute('aria-pressed', String(!buying)); el('buy').setAttribute('aria-pressed', String(buying));
  el('sell').disabled = _busy; el('buy').disabled = _busy;
  el('amount').max = String(maximum);
  el('amount').disabled = !ready || _busy || maximum < 1;
  el('max').disabled = !ready || _busy || maximum < 1;
  el('dec').disabled = !ready || _busy || maximum < 1 || amount() <= 1;
  el('inc').disabled = !ready || _busy || maximum < 1 || amount() >= maximum;
  el('rate').innerHTML = `1 ${DIAMOND_SVG} = ${rate.toLocaleString()} ${COIN_SVG}`;
  const quantity = amount(), gold = quantity * rate;
  const valid = ready && quantity > 0 && quantity <= maximum && rate > 0 && Number.isSafeInteger(gold);
  el('receive').innerHTML = buying
    ? `You’ll receive ${DIAMOND_SVG} ${(valid ? quantity : 0).toLocaleString()} for ${COIN_SVG} ${(valid ? gold : 0).toLocaleString()}`
    : `You’ll receive ${COIN_SVG} ${(valid ? gold : 0).toLocaleString()}`;
  el('submit').disabled = _busy || !valid;
  el('submit').textContent = _busy ? 'Exchanging…' : buying ? 'Buy diamonds' : 'Sell diamonds';
}

function closeConfirmation() {
  _closeConfirmation?.();
  _closeConfirmation = null;
}

export function closeDiamondExchangeShop() {
  _generation++;
  _profile = null;
  _pending = null;
  closeConfirmation();
  el('modal-overlay')?.classList.remove('active');
}

export async function openDiamondExchangeShop() {
  const token = getToken(), generation = ++_generation;
  if (!token) return;
  closeConfirmation();
  _profile = null; _pending = null; _direction = 'sell';
  el('modal-overlay').classList.add('active');
  el('amount').value = '';
  message('Loading…'); render();
  try {
    const response = await apiFetch('/api/profile');
    if (!response.ok) throw Error('Unable to load Diamond Exchange.');
    const data = await response.json();
    if (getToken() !== token || generation !== _generation) return;
    if (!Number.isSafeInteger(data.diamondsBalance)) { closeDiamondExchangeShop(); return; }
    _profile = data;
    _hooks.onRewardSnapshot?.(data);
    el('amount').value = data.diamondsBalance > 0 ? '1' : '';
    message(data.diamondsBalance > 0 ? '' : 'No diamonds available to exchange.'); render();
    if (data.diamondsBalance > 0) el('amount').focus();
  } catch (_) {
    if (getToken() === token && generation === _generation) message('Unable to load Diamond Exchange.', true);
  }
}

function submit(event) {
  event.preventDefault();
  if (_busy || !_profile || el('submit').disabled) return;
  const quantity = amount(), token = getToken(), generation = _generation;
  const rate = _direction === 'buy' ? _profile.diamondBuyRate : _profile.diamondExchangeRate;
  const maximum = _direction === 'buy' ? Math.min(_profile.diamondPurchaseStock || 0, Math.floor(_profile.coinsBalance / rate)) : _profile.diamondsBalance;
  if (!quantity || quantity > maximum || !rate) return;
  const direction = _direction, gold = quantity * rate, unit = quantity === 1 ? 'diamond' : 'diamonds';
  closeConfirmation();
  _closeConfirmation = showConfirm(direction === 'buy'
    ? `Spend ${gold.toLocaleString()} GC to buy ${quantity.toLocaleString()} ${unit}?`
    : `Sell ${quantity.toLocaleString()} ${unit} for ${gold.toLocaleString()} GC?`, () => {
    _closeConfirmation = null;
    if (getToken() !== token || generation !== _generation || direction !== _direction || amount() !== quantity) return;
    return performExchange(quantity, rate, token, generation, direction);
  }, { confirmLabel: direction === 'buy' ? 'Confirm Buy' : 'Confirm Sell', danger: false, win: true });
}

async function performExchange(quantity, rate, token, generation, direction) {
  if (_busy) return;
  if (!_pending || _pending.amount !== quantity || _pending.expectedRate !== rate || _pending.direction !== direction) {
    const requestId = crypto.randomUUID?.() || Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join('');
    _pending = { amount: quantity, expectedRate: rate, requestId, direction };
  }
  const request = _pending;
  _busy = true; message(''); render();
  try {
    const response = await apiFetch('/api/shop/exchange-diamonds', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request),
    });
    const data = await response.json();
    if (getToken() !== token) return;
    if (response.ok) _hooks.onRewardSnapshot?.(data);
    else if (data.profile) _hooks.onRewardSnapshot?.(data.profile);
    if (generation !== _generation) return;
    if (!response.ok) {
      if (data.profile) { _profile = data.profile; _pending = null; }
      message(data.error || 'Exchange failed. Please try again.', true);
      return;
    }
    _profile = data; _pending = null;
    el('amount').value = '1';
    const diamondUnit = data.exchanged === 1 ? 'diamond' : 'diamonds';
    message(data.direction === 'buy'
      ? `Bought ${data.exchanged.toLocaleString()} ${diamondUnit} for ${data.goldSpent.toLocaleString()} GC.`
      : `Sold ${data.exchanged.toLocaleString()} ${diamondUnit} for ${data.goldReceived.toLocaleString()} GC.`);
  } catch (_) {
    if (getToken() === token && generation === _generation) message('Connection interrupted. Retry to check this exchange.', true);
  } finally {
    _busy = false;
    if (generation === _generation) render();
  }
}

export function initDiamondExchangeShop(hooks = {}) {
  _hooks = hooks;
  document.getElementById('diamonds-display')?.addEventListener('click', openDiamondExchangeShop);
  el('close')?.addEventListener('click', closeDiamondExchangeShop);
  el('form')?.addEventListener('submit', submit);
  el('amount')?.addEventListener('input', () => { closeConfirmation(); message(''); render(); });
  el('max')?.addEventListener('click', () => { if (_profile && !_busy) { closeConfirmation(); el('amount').value = el('amount').max; message(''); render(); } });
  for (const [name, delta] of [['dec', -1], ['inc', 1]]) el(name)?.addEventListener('click', () => {
    if (!_profile || _busy || el(name).disabled) return;
    closeConfirmation();
    el('amount').value = String(Math.max(1, Math.min(Number(el('amount').max), (amount() || 0) + delta)));
    message(''); render();
  });
  for (const direction of ['sell', 'buy']) el(direction)?.addEventListener('click', () => {
    if (!_busy && _profile) { closeConfirmation(); _direction = direction; _pending = null; el('amount').value = '1'; message(''); render(); }
  });
  el('modal-overlay')?.addEventListener('click', event => {
    if (event.target === event.currentTarget && _hooks.getMousedownOverlay?.() === event.currentTarget) closeDiamondExchangeShop();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && el('modal-overlay')?.classList.contains('active')) closeDiamondExchangeShop();
  });
}

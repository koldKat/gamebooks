import { apiFetch, getToken } from '../core/state.js';
import { COIN_SVG } from '../ui-helpers/coin-icon.js';
import { DIAMOND_SVG } from './diamonds.js';
import { RUBY_SVG } from './rubies.js';
import { showConfirm } from '../ui-helpers/confirm.js';

const currencies = {
  diamond: { plural: 'diamonds', label: 'Diamonds', icon: DIAMOND_SVG, balance: 'diamondsBalance', sold: 'diamondsExchanged', bought: 'diamondsBought' },
  ruby: { plural: 'rubies', label: 'Rubies', icon: RUBY_SVG, balance: 'rubiesBalance', sold: 'rubiesExchanged', bought: 'rubiesBought' },
};
const directions = ['sell', 'buy'];
let _profile = null, _generation = 0, _confirmation = 0, _busy = false, _hooks = {}, _currency = 'diamond', _closeConfirmation = null;
// Keep each interrupted trade's request ID across direction and currency changes.
const _pending = new Map();
const el = name => document.getElementById('exchange-shop-' + name);
const field = (direction, name) => el(direction + '-' + name);
const current = () => currencies[_currency];
const rateFor = (currency, direction) => _profile?.[currency + (direction === 'buy' ? 'BuyRate' : 'ExchangeRate')] || 0;
function amount(direction) {
  const value = field(direction, 'amount').value;
  return /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : 0;
}
function maximumFor(direction) {
  if (!_profile) return 0;
  if (direction === 'sell') return Math.max(0, _profile[current().balance] || 0);
  const rate = rateFor(_currency, direction);
  return rate > 0 ? Math.min(Math.max(0, _profile[_currency + 'PurchaseStock'] || 0), Math.max(0, Math.floor((_profile.coinsBalance || 0) / rate))) : 0;
}
function message(text, error = false) {
  el('message').textContent = text;
  el('message').classList.toggle('exchange-shop-message--error', error);
}
function resetAmounts() {
  for (const direction of directions) field(direction, 'amount').value = maximumFor(direction) > 0 ? '1' : '';
}
function render() {
  const c = current(), ready = Number.isSafeInteger(_profile?.[c.balance]);
  const balance = ready ? _profile[c.balance] : 0, stock = Math.max(0, _profile?.[_currency + 'PurchaseStock'] || 0);
  el('modal').dataset.currency = _currency;
  for (const [key, config] of Object.entries(currencies)) {
    const tab = el(key + '-tab'), selected = key === _currency;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    tab.disabled = _busy || !ready;
    tab.hidden = !!_profile && !Number.isSafeInteger(_profile[config.balance]);
  }
  el('form').setAttribute('aria-labelledby', 'exchange-shop-' + _currency + '-tab');
  el('stock').innerHTML = `(${c.label} available for purchase: <span class="exchange-shop-stock-value">${stock.toLocaleString()}</span>)`;
  el('balance').innerHTML = `<span class="shop-modal-balance exchange-shop-${c.plural}">${c.icon} ${balance.toLocaleString()}</span><span class="shop-modal-balance">${COIN_SVG} ${Number(_profile?.coinsBalance || 0).toLocaleString()}</span>`;
  const sold = Number(_profile?.[c.sold] || 0), bought = Number(_profile?.[c.bought] || 0);
  el('total').textContent = `${(sold + bought).toLocaleString()} exchanged`;
  el('total').dataset.tooltip = `${sold.toLocaleString()} sold · ${bought.toLocaleString()} bought`;
  for (const direction of directions) {
    const rate = rateFor(_currency, direction), maximum = maximumFor(direction), quantity = amount(direction), gold = quantity * rate;
    const valid = ready && quantity > 0 && quantity <= maximum && rate > 0 && Number.isSafeInteger(gold);
    field(direction, 'form').setAttribute('aria-busy', String(_busy));
    field(direction, 'amount').max = String(maximum);
    field(direction, 'amount').disabled = !ready || _busy || maximum < 1;
    field(direction, 'max').disabled = !ready || _busy || maximum < 1;
    field(direction, 'dec').disabled = !ready || _busy || maximum < 1 || quantity <= 1;
    field(direction, 'inc').disabled = !ready || _busy || maximum < 1 || quantity >= maximum;
    field(direction, 'dec').setAttribute('aria-label', `${direction === 'buy' ? 'Buy' : 'Sell'} fewer ${c.plural}`);
    field(direction, 'inc').setAttribute('aria-label', `${direction === 'buy' ? 'Buy' : 'Sell'} more ${c.plural}`);
    field(direction, 'rate').innerHTML = `1 ${c.icon} = ${rate.toLocaleString()} ${COIN_SVG}`;
    field(direction, 'receive').innerHTML = `${direction === 'buy' ? 'Costs' : 'Receive'} ${COIN_SVG} ${(valid ? gold : 0).toLocaleString()}`;
    field(direction, 'submit').disabled = _busy || !valid;
    field(direction, 'submit').textContent = direction === 'buy' ? 'Buy' : 'Sell';
  }
}
function closeConfirmation() {
  _confirmation++;
  _closeConfirmation?.();
  _closeConfirmation = null;
}
export function closeBlackMarket() {
  _generation++;
  _profile = null;
  _pending.clear();
  closeConfirmation();
  el('modal-overlay')?.classList.remove('active');
}
function selectCurrency(currency) {
  if (_busy || !_profile || !Number.isSafeInteger(_profile[currencies[currency].balance])) return;
  closeConfirmation(); _generation++; _currency = currency;
  resetAmounts(); message(''); render();
}
export async function openBlackMarket(currency = 'diamond') {
  const token = getToken();
  if (!token || _busy || !currencies[currency]) return;
  const generation = ++_generation;
  closeConfirmation();
  _currency = currency; _profile = null; _pending.clear();
  el('modal-overlay').classList.add('active');
  resetAmounts(); message('Loading…'); render();
  try {
    const response = await apiFetch('/api/profile');
    if (!response.ok) throw Error('Unable to load Black Market.');
    const data = await response.json();
    if (getToken() !== token || generation !== _generation) return;
    if (!Number.isSafeInteger(data[current().balance])) { closeBlackMarket(); return; }
    _profile = data; _hooks.onRewardSnapshot?.(data);
    resetAmounts(); message(''); render();
    const focus = maximumFor('sell') > 0 ? 'sell' : maximumFor('buy') > 0 ? 'buy' : null;
    if (focus) field(focus, 'amount').focus();
  } catch (_) {
    if (getToken() === token && generation === _generation) message('Unable to load Black Market.', true);
  }
}
export function openDiamondExchangeShop() { return openBlackMarket('diamond'); }
export function openRubyExchangeShop() { return openBlackMarket('ruby'); }
function submit(event, direction) {
  event.preventDefault();
  if (_busy || !_profile || field(direction, 'submit').disabled) return;
  const currency = _currency, c = current(), quantity = amount(direction), token = getToken(), generation = _generation;
  const rate = rateFor(currency, direction), gold = quantity * rate;
  if (!quantity || quantity > maximumFor(direction) || !rate || !Number.isSafeInteger(gold)) return;
  const unit = quantity === 1 ? currency : c.plural;
  closeConfirmation();
  const confirmation = _confirmation;
  _closeConfirmation = showConfirm(direction === 'buy'
    ? `Spend ${gold.toLocaleString()} GC to buy ${quantity.toLocaleString()} ${unit}?`
    : `Sell ${quantity.toLocaleString()} ${unit} for ${gold.toLocaleString()} GC?`, () => {
    if (confirmation !== _confirmation || getToken() !== token || generation !== _generation || currency !== _currency || amount(direction) !== quantity) return;
    _confirmation++; _closeConfirmation = null;
    return performExchange(quantity, rate, token, generation, direction, currency);
  }, { confirmLabel: direction === 'buy' ? 'Confirm Buy' : 'Confirm Sell', danger: false, win: true });
}
async function performExchange(quantity, rate, token, generation, direction, currency) {
  if (_busy) return;
  const key = currency + ':' + direction, prior = _pending.get(key);
  if (!prior || prior.amount !== quantity || prior.expectedRate !== rate) {
    const requestId = crypto.randomUUID?.() || Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join('');
    _pending.set(key, { amount: quantity, expectedRate: rate, requestId, direction });
  }
  const request = _pending.get(key);
  _busy = true; message(''); render();
  try {
    const response = await apiFetch('/api/shop/exchange-' + currencies[currency].plural, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request),
    });
    const data = await response.json();
    if (getToken() !== token) return;
    if (response.ok) _hooks.onRewardSnapshot?.(data);
    else if (data.profile) _hooks.onRewardSnapshot?.(data.profile);
    if (generation !== _generation) return;
    if (!response.ok) {
      if (data.profile) { _profile = data.profile; _pending.delete(key); }
      message(data.error || 'Exchange failed. Please try again.', true); return;
    }
    _profile = data; _pending.delete(key);
    field(direction, 'amount').value = maximumFor(direction) > 0 ? '1' : '';
    const unit = data.exchanged === 1 ? currency : currencies[currency].plural;
    message(data.direction === 'buy'
      ? `Bought ${data.exchanged.toLocaleString()} ${unit} for ${data.goldSpent.toLocaleString()} GC.`
      : `Sold ${data.exchanged.toLocaleString()} ${unit} for ${data.goldReceived.toLocaleString()} GC.`);
  } catch (_) {
    if (getToken() === token && generation === _generation) message('Connection interrupted. Retry to check this exchange.', true);
  } finally {
    _busy = false;
    if (generation === _generation) render();
  }
}
export function initBlackMarket(hooks = {}) {
  _hooks = hooks;
  document.getElementById('diamonds-display')?.addEventListener('click', openDiamondExchangeShop);
  document.getElementById('rubies-display')?.addEventListener('click', openRubyExchangeShop);
  for (const currency of Object.keys(currencies)) {
    const tab = el(currency + '-tab');
    tab?.addEventListener('click', () => selectCurrency(currency));
    tab?.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || _busy || !_profile) return;
      const target = event.key === 'Home' ? 'ruby' : event.key === 'End' ? 'diamond' : currency === 'diamond' ? 'ruby' : 'diamond';
      if (el(target + '-tab').hidden || el(target + '-tab').disabled) return;
      event.preventDefault(); selectCurrency(target); el(target + '-tab').focus();
    });
  }
  el('close')?.addEventListener('click', closeBlackMarket);
  for (const direction of directions) {
    field(direction, 'form')?.addEventListener('submit', event => submit(event, direction));
    field(direction, 'amount')?.addEventListener('input', () => { closeConfirmation(); message(''); render(); });
    field(direction, 'max')?.addEventListener('click', () => {
      if (!_profile || _busy || field(direction, 'max').disabled) return;
      closeConfirmation(); field(direction, 'amount').value = String(maximumFor(direction)); message(''); render();
    });
    for (const [name, delta] of [['dec', -1], ['inc', 1]]) field(direction, name)?.addEventListener('click', () => {
      if (!_profile || _busy || field(direction, name).disabled) return;
      closeConfirmation(); field(direction, 'amount').value = String(Math.max(1, Math.min(maximumFor(direction), (amount(direction) || 0) + delta)));
      message(''); render();
    });
  }
  el('modal-overlay')?.addEventListener('click', event => {
    if (event.target === event.currentTarget && _hooks.getMousedownOverlay?.() === event.currentTarget) closeBlackMarket();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && el('modal-overlay')?.classList.contains('active')) closeBlackMarket();
  });
}

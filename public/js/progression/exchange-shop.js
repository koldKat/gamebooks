import { apiFetch, getToken } from '../core/state.js';
import { COIN_SVG } from '../ui-helpers/coin-icon.js';
import { DIAMOND_SVG } from './diamonds.js';
import { RUBY_SVG } from './rubies.js';
import { showConfirm } from '../ui-helpers/confirm.js';

const currencies = {
  diamond: { plural: 'diamonds', label: 'Diamonds', icon: DIAMOND_SVG, balance: 'diamondsBalance', sold: 'diamondsExchanged', bought: 'diamondsBought', note: 'Buy price: twice your level. Sell rate: your level + upgrades.' },
  ruby: { plural: 'rubies', label: 'Rubies', icon: RUBY_SVG, balance: 'rubiesBalance', sold: 'rubiesExchanged', bought: 'rubiesBought', note: 'Buy and sell rubies at the same rate.' },
};
let _profile = null, _generation = 0, _busy = false, _hooks = {}, _direction = 'sell', _currency = 'diamond', _closeConfirmation = null;
// Keep an interrupted trade's request ID when visiting the other currency tab.
const _pending = new Map();
const el = name => document.getElementById('exchange-shop-' + name);
const current = () => currencies[_currency];
const rateFor = (currency, direction) => _profile?.[currency + (direction === 'buy' ? 'BuyRate' : 'ExchangeRate')] || 0;

function amount() {
  const value = el('amount').value;
  return /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : 0;
}
function message(text, error = false) {
  el('message').textContent = text;
  el('message').classList.toggle('exchange-shop-message--error', error);
}
function render() {
  const c = current(), ready = Number.isSafeInteger(_profile?.[c.balance]);
  const balance = ready ? _profile[c.balance] : 0, buying = _direction === 'buy';
  const rate = rateFor(_currency, _direction), stock = Math.max(0, _profile?.[_currency + 'PurchaseStock'] || 0);
  const maximum = buying ? (rate > 0 ? Math.min(stock, Math.max(0, Math.floor((_profile?.coinsBalance || 0) / rate))) : 0) : balance;
  el('modal').dataset.currency = _currency;
  for (const [key, config] of Object.entries(currencies)) {
    const tab = el(key + '-tab'), selected = key === _currency;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    tab.disabled = _busy || !ready;
    tab.hidden = !!_profile && !Number.isSafeInteger(_profile[config.balance]);
  }
  el('form').setAttribute('aria-labelledby', 'exchange-shop-' + _currency + '-tab');
  el('stock').hidden = !buying;
  el('stock').innerHTML = `(${c.label} available for purchase: <span class="exchange-shop-stock-value">${stock.toLocaleString()}</span>)`;
  el('balance').innerHTML = `<span class="shop-modal-balance exchange-shop-${c.plural}">${c.icon} ${balance.toLocaleString()}</span><span class="shop-modal-balance">${COIN_SVG} ${Number(_profile?.coinsBalance || 0).toLocaleString()}</span>`;
  const sold = Number(_profile?.[c.sold] || 0), bought = Number(_profile?.[c.bought] || 0);
  el('total').textContent = `${(sold + bought).toLocaleString()} exchanged`;
  el('total').dataset.tooltip = `${sold.toLocaleString()} sold · ${bought.toLocaleString()} bought`;
  el('amount-label').textContent = `${c.label} to ${buying ? 'buy' : 'sell'}`;
  el('dec').setAttribute('aria-label', `Fewer ${c.plural}`);
  el('inc').setAttribute('aria-label', `More ${c.plural}`);
  el('tip').textContent = buying ? `${c.label} are added to your balance immediately.` : 'Gold coins are added to your balance immediately.';
  el('note').textContent = c.note;
  el('sell').textContent = `Sell ${c.plural}`; el('buy').textContent = `Buy ${c.plural}`;
  el('sell').setAttribute('aria-pressed', String(!buying)); el('buy').setAttribute('aria-pressed', String(buying));
  el('sell').disabled = _busy; el('buy').disabled = _busy;
  el('amount').max = String(maximum);
  el('amount').disabled = !ready || _busy || maximum < 1;
  el('max').disabled = !ready || _busy || maximum < 1;
  el('dec').disabled = !ready || _busy || maximum < 1 || amount() <= 1;
  el('inc').disabled = !ready || _busy || maximum < 1 || amount() >= maximum;
  el('rate').innerHTML = `1 ${c.icon} = ${rate.toLocaleString()} ${COIN_SVG}`;
  const quantity = amount(), gold = quantity * rate;
  const valid = ready && quantity > 0 && quantity <= maximum && rate > 0 && Number.isSafeInteger(gold);
  el('receive').innerHTML = buying
    ? `You’ll receive ${c.icon} ${(valid ? quantity : 0).toLocaleString()} for ${COIN_SVG} ${(valid ? gold : 0).toLocaleString()}`
    : `You’ll receive ${COIN_SVG} ${(valid ? gold : 0).toLocaleString()}`;
  el('submit').disabled = _busy || !valid;
  el('submit').textContent = _busy ? 'Exchanging…' : `${buying ? 'Buy' : 'Sell'} ${c.plural}`;
}
function closeConfirmation() {
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
  closeConfirmation();
  _generation++;
  _currency = currency; _direction = 'sell';
  el('amount').value = _profile[current().balance] > 0 ? '1' : '';
  message(''); render();
}
export async function openBlackMarket(currency = 'diamond') {
  const token = getToken();
  if (!token || _busy || !currencies[currency]) return;
  const generation = ++_generation;
  closeConfirmation();
  _currency = currency; _profile = null; _pending.clear(); _direction = 'sell';
  el('modal-overlay').classList.add('active');
  el('amount').value = '';
  message('Loading…'); render();
  try {
    const response = await apiFetch('/api/profile');
    if (!response.ok) throw Error('Unable to load Black Market.');
    const data = await response.json();
    if (getToken() !== token || generation !== _generation) return;
    if (!Number.isSafeInteger(data[current().balance])) { closeBlackMarket(); return; }
    _profile = data;
    _hooks.onRewardSnapshot?.(data);
    const balance = data[current().balance];
    el('amount').value = balance > 0 ? '1' : '';
    message(balance > 0 ? '' : `No ${current().plural} available to exchange.`); render();
    if (balance > 0) el('amount').focus();
  } catch (_) {
    if (getToken() === token && generation === _generation) message('Unable to load Black Market.', true);
  }
}
export function openDiamondExchangeShop() { return openBlackMarket('diamond'); }
export function openRubyExchangeShop() { return openBlackMarket('ruby'); }

function submit(event) {
  event.preventDefault();
  if (_busy || !_profile || el('submit').disabled) return;
  const currency = _currency, c = current(), quantity = amount(), token = getToken(), generation = _generation;
  const rate = rateFor(currency, _direction);
  const maximum = _direction === 'buy' ? Math.min(_profile[currency + 'PurchaseStock'] || 0, Math.floor(_profile.coinsBalance / rate)) : _profile[c.balance];
  if (!quantity || quantity > maximum || !rate) return;
  const direction = _direction, gold = quantity * rate, unit = quantity === 1 ? currency : c.plural;
  closeConfirmation();
  _closeConfirmation = showConfirm(direction === 'buy'
    ? `Spend ${gold.toLocaleString()} GC to buy ${quantity.toLocaleString()} ${unit}?`
    : `Sell ${quantity.toLocaleString()} ${unit} for ${gold.toLocaleString()} GC?`, () => {
    _closeConfirmation = null;
    if (getToken() !== token || generation !== _generation || currency !== _currency || direction !== _direction || amount() !== quantity) return;
    return performExchange(quantity, rate, token, generation, direction, currency);
  }, { confirmLabel: direction === 'buy' ? 'Confirm Buy' : 'Confirm Sell', danger: false, win: true });
}
async function performExchange(quantity, rate, token, generation, direction, currency) {
  if (_busy) return;
  const prior = _pending.get(currency);
  if (!prior || prior.amount !== quantity || prior.expectedRate !== rate || prior.direction !== direction) {
    const requestId = crypto.randomUUID?.() || Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join('');
    _pending.set(currency, { amount: quantity, expectedRate: rate, requestId, direction });
  }
  const request = _pending.get(currency);
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
      if (data.profile) { _profile = data.profile; _pending.delete(currency); }
      message(data.error || 'Exchange failed. Please try again.', true);
      return;
    }
    _profile = data; _pending.delete(currency);
    el('amount').value = '1';
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
      const target = event.key === 'Home' ? 'diamond' : event.key === 'End' ? 'ruby' : currency === 'diamond' ? 'ruby' : 'diamond';
      if (el(target + '-tab').hidden || el(target + '-tab').disabled) return;
      event.preventDefault(); selectCurrency(target); el(target + '-tab').focus();
    });
  }
  el('close')?.addEventListener('click', closeBlackMarket);
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
    if (!_busy && _profile) { closeConfirmation(); _direction = direction; _pending.delete(_currency); el('amount').value = '1'; message(''); render(); }
  });
  el('modal-overlay')?.addEventListener('click', event => {
    if (event.target === event.currentTarget && _hooks.getMousedownOverlay?.() === event.currentTarget) closeBlackMarket();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && el('modal-overlay')?.classList.contains('active')) closeBlackMarket();
  });
}

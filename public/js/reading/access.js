import { apiFetch, getToken } from '../core/state.js';
import { t } from '../i18n.js';
import { COIN_SVG } from '../ui-helpers/coin-icon.js';
import { formatFrontmatter } from './frontmatter.js';

const gates = new WeakMap();
let balanceEventsInstalled = false;
function installBalanceEvents() {
  if (balanceEventsInstalled) return;
  balanceEventsInstalled = true;
  const visit = callback => {
    for (const mount of document.querySelectorAll('.reading-gate')) {
      const gate = gates.get(mount);
      if (gate?.current()) callback(gate);
    }
  };
  window.addEventListener('coins-balance-changed', event => {
    visit(gate => { if (event.detail?.token === getToken()) gate.setBalance(event.detail.balance); });
  });
  window.addEventListener('focus', () => visit(gate => { gate.refresh().catch(() => {}); }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') visit(gate => { gate.refresh().catch(() => {}); });
  });
}

// No access cache: account changes and purchases in other tabs must be authoritative.
export async function showReadingGate(mount, bookId, { isCurrent, onUnlock, onError }) {
  const token = getToken();
  const current = () => token === getToken() && isCurrent();
  const res = await apiFetch(`/api/books/${bookId}/reading-access`);
  if (!res.ok) throw new Error('Reading access unavailable');
  const access = await res.json();
  if (!current()) return true;
  if (!access.locked) { gates.delete(mount); mount.classList.remove('reading-gate'); return false; }
  mount.replaceChildren();
  mount.classList.add('reading-gate');
  const prose = document.createElement('div');
  prose.className = 'reading-gate-prose';
  if (Number(bookId) === 263) prose.className += ' reading-gate-prose--263';
  for (const [heading, text] of [[t('reading_access.intro'), access.introText], [t('reading_access.rules'), access.rulesText]]) {
    if (!text) continue;
    const title = document.createElement('h2');
    title.textContent = heading;
    const content = document.createElement('div');
    content.className = 'reading-frontmatter';
    if (!formatFrontmatter(content, bookId, text, document)) content.textContent = text;
    prose.append(title, content);
  }
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'reading-unlock-button';
  const label = document.createElement('span');
  label.textContent = t('reading_access.unlock', { cost: access.cost });
  const coin = document.createElement('span');
  coin.innerHTML = COIN_SVG;
  button.append(label, coin);
  button.setAttribute('aria-label', `${label.textContent} GC`);
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.className = 'reading-unlock-status';
  const footer = document.createElement('div');
  footer.className = 'reading-gate-footer';
  const confirmation = document.createElement('div');
  confirmation.className = 'reading-unlock-confirmation';
  confirmation.hidden = true;
  const message = document.createElement('p');
  message.className = 'reading-confirm-message';
  message.textContent = t('reading_access.confirm', { name: access.name });
  const actions = document.createElement('div');
  actions.className = 'reading-confirm-actions';
  const accept = document.createElement('button');
  accept.type = 'button';
  accept.className = 'reading-unlock-button reading-confirm-accept';
  const acceptLabel = document.createElement('span');
  acceptLabel.textContent = t('reading_access.confirm_action', { cost: access.cost });
  const acceptCoin = document.createElement('span');
  acceptCoin.innerHTML = COIN_SVG;
  accept.append(acceptLabel, acceptCoin);
  accept.setAttribute('aria-label', `${acceptLabel.textContent} GC`);
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'reading-confirm-cancel';
  cancel.textContent = t('btn.cancel');
  actions.append(cancel, accept);
  confirmation.append(message, actions);
  footer.append(button, confirmation, status);
  mount.append(prose, footer);
  let purchasing = false;
  let affordable = access.cost === 0 || access.canAfford === true;
  let balanceVersion = 0;
  let refreshing = null;
  const updateButtons = () => {
    button.disabled = purchasing || !affordable;
    accept.disabled = purchasing || !affordable;
    cancel.disabled = purchasing;
    if (!purchasing) status.textContent = affordable ? '' : t('reading_access.insufficient');
  };
  const setBalance = balance => {
    if (!Number.isFinite(balance)) return;
    ++balanceVersion;
    affordable = access.cost === 0 || balance >= access.cost;
    updateButtons();
  };
  const refresh = () => {
    if (refreshing) return refreshing;
    const version = balanceVersion;
    refreshing = (async () => {
      const response = await apiFetch(`/api/books/${bookId}/reading-access`);
      if (!response.ok) throw new Error('Balance unavailable');
      const latest = await response.json();
      if (!current() || gates.get(mount) !== gate) return;
      if (version === balanceVersion) setBalance(latest.balance);
    })().finally(() => { refreshing = null; });
    return refreshing;
  };
  const gate = { current, setBalance, refresh };
  gates.set(mount, gate);
  installBalanceEvents();
  updateButtons();
  const purchase = async () => {
    if (purchasing || !affordable || confirmation.hidden || !current()) return;
    purchasing = true;
    button.disabled = true;
    accept.disabled = true;
    cancel.disabled = true;
    status.textContent = t('reading_access.unlocking');
    try {
      if (access.cost > 0) {
        await refresh();
        if (!current()) return;
        if (!affordable) { purchasing = false; updateButtons(); return; }
      }
      const result = await apiFetch(`/api/books/${bookId}/reading-access`, { method: 'POST' });
      if (!result.ok) {
        const error = await result.json();
        if (!current()) return;
        if (error.error === 'insufficient_coins') {
          affordable = false;
          purchasing = false;
          updateButtons();
          return;
        }
        throw new Error('Book unlock failed');
      }
      if (!current()) return;
      mount.classList.remove('reading-gate');
      gates.delete(mount);
      await onUnlock();
    } catch (error) {
      if (!current()) return;
      mount.classList.add('reading-gate');
      status.textContent = t('auth.network_error');
      purchasing = false;
      updateButtons();
      if (affordable) status.textContent = t('auth.network_error');
      onError?.(error);
    }
  };
  button.addEventListener('click', () => {
    if (button.disabled || !current()) return;
    button.hidden = true;
    confirmation.hidden = false;
    status.textContent = '';
    cancel.focus();
  });
  accept.addEventListener('click', purchase);
  cancel.addEventListener('click', () => {
    if (purchasing || !current()) return;
    confirmation.hidden = true;
    button.hidden = false;
    updateButtons();
    button.focus();
  });
  mount.scrollTop = 0;
  return true;
}

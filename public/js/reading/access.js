import { apiFetch, getToken } from '../core/state.js';
import { t } from '../i18n.js';
import { openReadingUnlock } from './unlock-dialog.js';

const gates = new WeakMap();
export function closeReadingGate(mount) { gates.get(mount)?.close(); }
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
export async function showReadingGate(mount, bookId, { isCurrent, onUnlock, onError, onStartSection, onCancel }) {
  const token = getToken();
  const current = () => token === getToken() && isCurrent();
  const res = await apiFetch(`/api/books/${bookId}/reading-access`);
  if (!res.ok) throw new Error('Reading access unavailable');
  const access = await res.json();
  if (!current()) return true;
  onStartSection?.(access.startSection ?? 1);
  if (!access.locked) { gates.delete(mount); mount.classList.remove('reading-gate'); return false; }
  mount.classList.add('reading-gate');
  let purchasing = false;
  let affordable = access.cost === 0 || access.canAfford === true;
  let balanceVersion = 0;
  let refreshing = null;
  let dialog = null;
  const updateButtons = () => {
    dialog?.update({ cost: access.cost, canAfford: affordable, busy: purchasing, error: '' });
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
      if (!latest.locked) {
        dialog?.close();
        gates.delete(mount);
        mount.classList.remove('reading-gate');
        await onUnlock();
        return;
      }
      access.cost = latest.cost;
      if (version === balanceVersion) setBalance(latest.balance);
    })().finally(() => { refreshing = null; });
    return refreshing;
  };
  const close = () => { dialog?.close(); gates.delete(mount); mount.classList.remove('reading-gate'); };
  const gate = { current, setBalance, refresh, close };
  gates.set(mount, gate);
  installBalanceEvents();
  updateButtons();
  const purchase = async expectedCost => {
    if (purchasing || !affordable || !current() || gates.get(mount) !== gate) return;
    purchasing = true;
    updateButtons();
    try {
      if (access.cost > 0) {
        await refresh();
        if (!current() || gates.get(mount) !== gate) return;
        if (!affordable) { purchasing = false; updateButtons(); return; }
        if (access.cost !== expectedCost) { purchasing = false; updateButtons(); requestPurchase(); return; }
      }
      const result = await apiFetch(`/api/books/${bookId}/reading-access`, {
        method: 'POST', body: JSON.stringify({ expectedCost }),
      });
      if (!result.ok) {
        const error = await result.json();
        if (!current()) return;
        if (error.error === 'insufficient_coins') {
          affordable = false;
          purchasing = false;
          updateButtons();
          return;
        }
        if (error.error === 'cost_changed') {
          purchasing = false;
          await refresh();
          updateButtons();
          if (gates.get(mount) === gate) requestPurchase();
          return;
        }
        throw new Error('Book unlock failed');
      }
      if (!current()) return;
      mount.classList.remove('reading-gate');
      dialog?.close();
      gates.delete(mount);
      await onUnlock();
    } catch (error) {
      if (!current()) return;
      mount.classList.add('reading-gate');
      purchasing = false;
      updateButtons();
      dialog?.update({ error: t('auth.network_error') });
      onError?.(error);
    }
  };
  const requestPurchase = () => {
    if (purchasing || !current()) return;
    dialog?.close();
    dialog = openReadingUnlock({ ...access, canAfford: affordable }, { onConfirm: purchase, isCurrent: current, onCancel: () => { gates.delete(mount); mount.classList.remove('reading-gate'); onCancel?.(); } });
  };
  requestPurchase();
  return true;
}

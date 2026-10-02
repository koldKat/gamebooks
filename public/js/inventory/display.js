// display.js - Internal inventory module; use ../inventory.js externally.

import { inventoryRuntime } from './runtime.js';
import { state, currentPlaythrough, viewingPt } from '../core/state.js';
import { t } from '../i18n.js';
import { _inv } from './model.js';
import { _ensureInvItems, _byId } from './cache.js';
import { _invLineHtml } from './markup.js';

export async function renderInventoryDisplay(extraItems = [], isCurrent = () => true) {
  const el = document.getElementById('inv-display');
  if (!el) return;
  const revision = ++inventoryRuntime._displayRevision;
  const bookState = state, pt = currentPlaythrough() || viewingPt;
  await _ensureInvItems();
  // A newer render, hidden feature or changed run supersedes this async paint.
  if (revision !== inventoryRuntime._displayRevision || bookState !== state ||
      pt !== (currentPlaythrough() || viewingPt) || !isCurrent()) return;
  const inv = _inv().filter(s => s.visible);
  const lines = inv.map(({ itemId, note, qty, label }) => {
    const item = _byId(itemId);
    if (!item) return '';
    return _invLineHtml(item, label?.trim() || item.name, note, qty, t('inv.badge.item'), 'item');
  }).filter(Boolean);
  const extraLines = extraItems.map(({ item, label, note, qty, slotLabel }) => {
    if (!item) return '';
    return _invLineHtml(item, label?.trim() || item.name, note, qty, slotLabel || t('inv.badge.equipped'), 'equipped');
  }).filter(Boolean);
  el.innerHTML = [...lines, ...extraLines].join('');
}

export function setExtraDisplayItemsProvider(fn) { inventoryRuntime._extraDisplayItemsProvider = fn; }

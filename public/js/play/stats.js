// stats.js - Internal play-screen module; use ../play.js externally.

import { state, isTerminal, allDiscoveredSections, mappedCount } from '../state.js';
import { t } from '../i18n.js';
import { playContext } from './context.js';

export function updateStats() {
  const discovered       = allDiscoveredSections();
  const normalDiscovered = [...discovered].filter(s => !isTerminal(s)).length;
  const rawTotal         = state.totalSections || 0;
  const total            = playContext._discoverableLimit || rawTotal;
  const mapped           = mappedCount();

  function pct(n) {
    if (!total) return '';
    const p = n >= total ? 100 : Math.min(99, Math.floor(n / total * 100));
    return ` (${p}%)`;
  }

  const titleEl = document.getElementById('book-title');
  titleEl.textContent      = state.bookName || t('books.untitled');
  titleEl.dataset.tooltip  = state.bookName || t('books.untitled');
  document.getElementById('mapped-count').textContent     = mapped;
  document.getElementById('total-count').textContent      = total + pct(mapped);
  document.getElementById('discovered-count').textContent = normalDiscovered;
  const discTotalEl = document.getElementById('discovered-total');
  if (discTotalEl) discTotalEl.textContent = total + pct(normalDiscovered);
  document.getElementById('pt-total').textContent = state.playthroughs.length;
  const deaths   = state.playthroughs.filter(p => p.completed && (p.result === 'death' || p.result === 'battle')).length;
  const wins     = state.playthroughs.filter(p => p.completed && p.result === 'success').length;
  const outcomes = document.getElementById('pt-outcomes');
  if (outcomes) {
    outcomes.innerHTML = (deaths || wins)
      ? ` (<span class="pt-won">${wins} won</span> / <span class="pt-lost">${deaths} lost</span>)`
      : '';
  }

  // Progress bars
  const mappedBar = document.getElementById('mapped-bar');
  if (mappedBar) mappedBar.style.width = total > 0 ? `${Math.min(100, mapped / total * 100)}%` : '0%';
  const discBar = document.getElementById('discovered-bar');
  if (discBar) discBar.style.width = total > 0 ? `${Math.min(100, normalDiscovered / total * 100)}%` : '0%';
  const splitWrap = document.getElementById('pt-split-wrap');
  const winsBar   = document.getElementById('pt-wins-bar');
  const lossBar   = document.getElementById('pt-losses-bar');
  if (splitWrap && winsBar && lossBar) {
    const finished = wins + deaths;
    if (finished > 0) {
      splitWrap.style.display = '';
      winsBar.style.width   = `${wins   / finished * 100}%`;
      lossBar.style.width   = `${deaths / finished * 100}%`;
    } else {
      splitWrap.style.display = 'none';
    }
  }

  // Missing: only shown when mapped == discovered (all found sections are fully mapped)
  const notFoundRow  = document.getElementById('not-found-row');
  const countEl      = document.getElementById('not-found-count');
  const notFoundTotal = document.getElementById('not-found-total');
  if (!notFoundRow || !countEl) return;
  if (total > 0 && mapped === normalDiscovered) {
    const missing = [];
    for (let i = 1; i <= total; i++) {
      if (!discovered.has(i)) missing.push(i);
    }
    const labelEl = document.getElementById('missing-label');
    if (missing.length) {
      notFoundRow.style.display    = '';
      countEl.textContent          = missing.length;
      if (notFoundTotal) notFoundTotal.textContent = total + pct(missing.length);
      if (labelEl) labelEl.dataset.tooltip = missing.join(', ');
    } else {
      notFoundRow.style.display = 'none';
    }
  } else {
    notFoundRow.style.display = 'none';
  }
}

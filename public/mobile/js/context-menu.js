// Mobile node context menu with reader lifecycle hooks passed in to avoid an import cycle.

import { state, saveState, currentPlaythrough, currentSection, parseSecId } from '../../js/core/state.js';
import { canReach } from '../../js/graph.js';
import { refreshGraph } from './graph-view.js';
import { t } from '../../js/i18n.js';
import { openNoteModal } from './note-modal.js';

// Preserve nodes with remaining metadata when pruning cleared entries.
export function pruneDiscovered(id) {
  const n = state.graph[id];
  if (!n?.discovered) return;
  const hasMetadata = n.note || n.priority || n.battle || n.color || n.portals || n.showNote || n.manual;
  if (!hasMetadata && (!n.choices || n.choices.length === 0)) delete state.graph[id];
}

function setPriority(id, value, hooks) {
  if (!state.graph[id]) state.graph[id] = { choices: [], discovered: true };
  if (value === 'normal') delete state.graph[id].priority;
  else                    state.graph[id].priority = value;
  pruneDiscovered(id);
  saveState();
  // Check rewards after priority changes; the server awards only the first tag.
  hooks.checkXpReward();
  refreshGraph(currentSection());
}

function toggleBattle(id, hooks) {
  if (!state.graph[id]) state.graph[id] = { choices: [], discovered: true };
  if (state.graph[id].battle) delete state.graph[id].battle;
  else                        state.graph[id].battle = true;
  pruneDiscovered(id);
  saveState();
  hooks.checkXpReward();
  refreshGraph(currentSection());
}

export function hideNodeContextMenu() {
  document.getElementById('m-ctx-menu')?.classList.remove('active');
}

let _lastHoldAt = 0;

// Re-clampable independent of the open call: a submenu expanding after the
// menu was already positioned can grow it past the bottom edge again.
let _ctxAnchor = { x: 0, y: 0 };
function clampContextMenu(x, y) {
  const menu = document.getElementById('m-ctx-menu');
  if (!menu) return;
  if (x !== undefined) _ctxAnchor = { x, y };
  const rect = menu.getBoundingClientRect();
  const left = Math.min(_ctxAnchor.x, window.innerWidth - rect.width - 8);
  const top  = Math.min(_ctxAnchor.y, window.innerHeight - rect.height - 8);
  menu.style.left = `${Math.max(8, left)}px`;
  menu.style.top  = `${Math.max(8, top)}px`;
}

// Hooks are stable reader functions, safe to capture in the one-time DOM setup.
export function openNodeContextMenu(id, x, y, hooks) {
  _lastHoldAt = Date.now();
  let menu = document.getElementById('m-ctx-menu');
  if (!menu) {
    menu = document.createElement('div');
    menu.id = 'm-ctx-menu';
    menu.className = 'm-ctx-menu';
    menu.innerHTML = `
      <button id="m-ctx-note-btn" class="m-ctx-btn">${t('ctx.note')}</button>
      <div class="m-ctx-submenu-wrap">
        <button class="m-ctx-btn m-ctx-trigger" data-submenu="m-ctx-priority-panel">${t('ctx.priority')}</button>
        <div class="m-ctx-submenu-panel" id="m-ctx-priority-panel">
          <button class="m-ctx-btn" data-priority="high">${t('ctx.priority.high')}</button>
          <button class="m-ctx-btn" data-priority="normal">${t('ctx.priority.normal')}</button>
          <button class="m-ctx-btn" data-priority="low">${t('ctx.priority.low')}</button>
        </div>
      </div>
      <button id="m-ctx-ft-btn" class="m-ctx-btn">${t('ctx.fasttravel')}</button>
      <button id="m-ctx-battle-btn" class="m-ctx-btn">${t('ctx.battle')}</button>`;
    document.body.appendChild(menu);

    // Ignore the trailing synthetic click after a long-press so it cannot immediately close the menu.
    document.addEventListener('click', e => {
      if (Date.now() - _lastHoldAt < 400) return;
      if (menu.classList.contains('active') && !menu.contains(e.target)) hideNodeContextMenu();
    });

    menu.querySelectorAll('.m-ctx-trigger').forEach(btn => {
      btn.addEventListener('click', () => {
        const panel = document.getElementById(btn.dataset.submenu);
        const wasOpen = panel.classList.contains('open');
        menu.querySelectorAll('.m-ctx-submenu-panel').forEach(p => p.classList.remove('open'));
        if (!wasOpen) panel.classList.add('open');
        // Re-clamp after expanding a submenu changes its height.
        clampContextMenu();
      });
    });
    document.getElementById('m-ctx-note-btn').addEventListener('click', () => {
      const id2 = menu.dataset.nodeId;
      hideNodeContextMenu();
      if (id2) openNoteModal(parseSecId(id2) ?? id2, hooks);
    });
    document.getElementById('m-ctx-battle-btn').addEventListener('click', () => {
      const id2 = menu.dataset.nodeId;
      hideNodeContextMenu();
      if (id2) toggleBattle(parseSecId(id2) ?? id2, hooks);
    });
    document.getElementById('m-ctx-priority-panel').querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        const id2 = menu.dataset.nodeId;
        hideNodeContextMenu();
        if (id2) setPriority(parseSecId(id2) ?? id2, btn.dataset.priority, hooks);
      });
    });
    // Context-menu travel uses the shortest route; the toolbar dialog offers all modes.
    document.getElementById('m-ctx-ft-btn').addEventListener('click', () => {
      const id2 = menu.dataset.nodeId;
      hideNodeContextMenu();
      if (id2) hooks.doFastTravel('shortest', parseSecId(id2) ?? id2);
    });
  }

  menu.dataset.nodeId = String(id);
  menu.querySelectorAll('.m-ctx-submenu-panel').forEach(p => p.classList.remove('open'));

  const pt = currentPlaythrough();
  const ftLeft = pt ? (hooks.maxFastTravels() - (pt.fastTravelsUsed || 0)) : 0;
  const from = currentSection();
  const showJump = !!pt && !pt.completed && ftLeft > 0 && !!state.graph[id] && canReach(from, id);
  document.getElementById('m-ctx-ft-btn').style.display = showJump ? '' : 'none';

  menu.classList.add('active');
  menu.style.left = '0px';
  menu.style.top  = '0px';
  clampContextMenu(x, y);
}

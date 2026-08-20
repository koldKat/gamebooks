// context-menu.js - Mobile's long-press node context menu: Edit note,
// Priority (high/normal/low), Fast Travel (one-tap shortest route, no
// submenu), Toggle battle. Same 4 actions as desktop's right-click
// #node-ctx-menu, minus the edit operations mobile deliberately doesn't
// expose (see reader.js's own header comment - reading-only). Extracted
// out of reader.js as a self-contained UI widget, per CLAUDE.md's module-
// placement rule ("new modal/panel/widget -> new module from day one").
//
// checkXpReward/maxFastTravels/doFastTravel are reader.js's own playthrough-
// lifecycle logic, not context-menu concerns - passed in per call via a
// `hooks` object (not imported directly) so this file has no dependency on
// reader.js at all, avoiding a reader.js <-> context-menu.js import cycle
// (reader.js is the one importing this file, not the other way around).

import { state, saveState, currentPlaythrough, currentSection, parseSecId } from '../../js/state.js?v=1417';
import { canReach } from '../../js/graph.js?v=1417';
import { refreshGraph } from './graph-view.js?v=1417';
import { t } from '../../js/i18n.js?v=1417';
import { openNoteModal } from './note-modal.js?v=1417';

// Same "worth keeping" check as boot.js's own _pruneDiscovered/play.js's
// _cleanupOrphanedTargets/graph.js's orphan-pruning pass - every place that
// clears a piece of node metadata needs this same check, or a node with
// nothing else on it (e.g. a manually-added node, or one whose only
// content was the metadata just cleared) silently vanishes instead of
// staying on the map. Exported - note-modal.js's own save handler needs it
// too, for the exact same reason.
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
  // set_priority XP (server/db/xp.js) only fires the first time a node
  // gains a priority tag, but the check itself is cheap either way - same
  // reasoning as every other hooks.checkXpReward() call site.
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

// hooks: { checkXpReward, maxFastTravels, doFastTravel } - all reader.js's
// own functions, passed fresh each call but always the same stable
// references, so capturing them in the one-time DOM-build closures below is
// safe even though that block only runs on the very first call.
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

    // Some mobile browsers still fire a trailing synthetic click on the
    // canvas right after the long-press's own contextmenu event, not just
    // one or the other - without this window, that trailing click would
    // hit this same listener and immediately close the menu that same
    // gesture just opened, reading as the long-press having done nothing.
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
        // Expanding a submenu grows the menu's own height after it was
        // already clamped against the collapsed size - re-clamp now or a
        // menu opened near the bottom edge overflows off-screen the moment
        // its submenu opens.
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
    // Unlike the toolbar's own Fast Travel dialog (which still offers all
    // 4 modes plus manual section entry), the context menu's version is
    // meant to be a one-tap shortcut - it always takes the shortest route
    // to the tapped node, no submenu.
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

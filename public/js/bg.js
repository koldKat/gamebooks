// bg.js - Graph background preference, bg/node context menus

import { apiFetch, isDemoMode, currentBookId, state } from './state.js?v=13';
import { t } from './i18n.js?v=64';

let _hooks = {};
export function setBgHooks(h) { _hooks = h || {}; }

// ── State ─────────────────────────────────────────────────────────────────────
let currentBookCover = null;
let _bgHidden        = false;
let _bgPosY          = 50;
let _bgInMove        = false;

export function setCurrentBookCover(url) { currentBookCover = url; }
export function getCurrentBookCover()    { return currentBookCover; }
export function isBgInMove()             { return _bgInMove; }

export function resetBgState(hidden, posY) {
  _bgHidden = !!hidden;
  _bgPosY   = posY ?? 50;
  _bgInMove = false;
  _applyBgPref();
}

export function cancelBgMove() {
  _bgInMove = false;
  document.getElementById('bg-move-overlay').style.display = 'none';
  document.getElementById('graph-container').style.cursor  = '';
}

// ── Background preference ─────────────────────────────────────────────────────
function _applyBgPref() {
  if (window.innerWidth <= 768) return;
  const ms = document.getElementById('main-screen');
  if (!ms) return;
  if (_bgHidden || !currentBookCover) {
    ms.style.backgroundImage = '';
    ms.style.backgroundColor = '#0f172a';
  } else {
    ms.style.backgroundImage =
      `linear-gradient(rgba(15,23,42,0.92), rgba(15,23,42,0.92)), url(${currentBookCover})`;
    ms.style.backgroundPositionY = `${_bgPosY}%`;
    ms.style.backgroundColor = '';
  }
  _updateSidebarBookInfo();
}

async function _saveBgPref() {
  if (!currentBookId || isDemoMode) return;
  await apiFetch(`/api/books/${currentBookId}/bg`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hidden: _bgHidden, pos_y: _bgPosY }),
  });
}

export function _updateSidebarBookInfo() {
  const img = document.getElementById('sidebar-cover-img');
  if (!img) return;
  img.src = (_bgHidden && currentBookCover) ? currentBookCover : '';
}

// ── Toggle/nudge operations (called from DOMContentLoaded handlers) ────────────
export function toggleBgHidden() {
  _bgHidden = !_bgHidden;
  _hideBgCtxMenu();
  _applyBgPref();
  _saveBgPref();
}

export function nudgeBgPosY(movementY) {
  _bgPosY = Math.max(0, Math.min(100, _bgPosY + movementY * 0.15));
  _applyBgPref();
}

// ── Context menus ─────────────────────────────────────────────────────────────
export function hideCtxMenu() {
  document.getElementById('node-ctx-menu').style.display = 'none';
  _hooks.clearCtxNodeId?.();
}

export function _hideBgCtxMenu() {
  document.getElementById('bg-ctx-menu').style.display = 'none';
}

export function _positionMenu(menu, x, y) {
  menu.style.left    = `${x}px`;
  menu.style.top     = `${y}px`;
  menu.style.display = 'block';
  const pad = 4;
  if (x + menu.offsetWidth  > window.innerWidth)  menu.style.left = `${window.innerWidth  - menu.offsetWidth  - pad}px`;
  if (y + menu.offsetHeight > window.innerHeight) menu.style.top  = `${window.innerHeight - menu.offsetHeight - pad}px`;
}

// Submenus open right/below by default; flip if they'd overflow the viewport.
export function _setupCtxSubmenuFlip() {
  document.querySelectorAll('.ctx-submenu-wrap').forEach(wrap => {
    const panel = wrap.querySelector('.ctx-submenu-panel');
    if (!panel) return;
    wrap.addEventListener('mouseenter', () => {
      panel.classList.remove('ctx-submenu-flip-x', 'ctx-submenu-flip-y');
      panel.style.visibility = 'hidden';
      panel.style.display = 'block';
      const wrapRect  = wrap.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      if (wrapRect.right + panelRect.width  > window.innerWidth)  panel.classList.add('ctx-submenu-flip-x');
      if (wrapRect.top   + panelRect.height > window.innerHeight) panel.classList.add('ctx-submenu-flip-y');
      panel.style.display = '';
      panel.style.visibility = '';
    });
  });
}

function _updateConnectorMenu() {
  const cur = state.connectorStyle || 'curvedCW';
  document.querySelectorAll('.ctx-connector-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.connector === cur);
  });
}

function _updateGridMenu() {
  document.getElementById('bg-ctx-grid-btn').classList.toggle('active', !!state.showGrid);
  document.getElementById('bg-ctx-snap-btn').classList.toggle('active', !!state.snapToGrid);
  document.getElementById('bg-ctx-fog-btn').classList.toggle('active', !!state.fogOfGrid);
}

// Background-cover items (toggle/move) only make sense when the book has a
// cover; the grid/connector items don't depend on a cover, so the menu still
// opens (with those items hidden) for books without one.
export function _showBgCtxMenu(x, y) {
  const menu = document.getElementById('bg-ctx-menu');
  const hasCover = !!currentBookCover;
  document.getElementById('bg-ctx-toggle-btn').style.display = hasCover ? '' : 'none';
  document.getElementById('bg-ctx-toggle-btn').textContent = _bgHidden ? t('bg.show_background') : t('bg.hide_background');
  document.getElementById('bg-ctx-move-btn').style.display = (hasCover && !_bgHidden) ? '' : 'none';
  _updateConnectorMenu();
  _updateGridMenu();
  _positionMenu(menu, x, y);
}

export function _enterBgMoveMode() {
  _bgInMove = true;
  document.getElementById('bg-move-overlay').style.display = 'block';
  document.getElementById('graph-container').style.cursor  = 'ns-resize';
}

export function _exitBgMoveMode() {
  _bgInMove = false;
  document.getElementById('bg-move-overlay').style.display = 'none';
  document.getElementById('graph-container').style.cursor  = '';
  _saveBgPref();
}

export function _updateColorSwatches(nodeId) {
  const cur = state.graph[nodeId]?.color ?? null;
  const isPreset = Array.from(document.querySelectorAll('.ctx-color-swatch')).some(s => s.dataset.color === cur);
  document.querySelectorAll('.ctx-color-swatch').forEach(s => {
    s.classList.toggle('active', s.dataset.color === cur);
  });
  const customInput = document.getElementById('ctx-color-custom');
  if (customInput) {
    customInput.value = cur && !isPreset ? cur : '#ffffff';
    customInput.classList.toggle('active', !!cur && !isPreset);
  }
}

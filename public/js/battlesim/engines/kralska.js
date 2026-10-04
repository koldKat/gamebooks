// Shared opposed-roll battle engine for the "Кралска кръв" comic-game serial
// (books 481, 491, 486). Both sides roll 1d6 + Сила; the lower total loses 1
// Издръжливост (ties cost nothing); fight continues until either side's
// Издръжливост reaches 0.

import { currentPlaythrough, saveState, apiFetch, currentBookId } from '../../core/state.js';
import { showAlert } from '../../ui-helpers/confirm.js';
import { getPlayBtnRow } from '../../play/charsheet.js';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../../core/util.js';
import { t } from '../../i18n.js';

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

function _roll1d6() { return 1 + Math.floor(Math.random() * 6); }

// One exchange: both roll 1d6 + Сила; lower total loses 1 Издръжливост; tie loses nothing.
export function resolveRound(playerSila, enemySila) {
  const playerRoll = _roll1d6();
  const enemyRoll = _roll1d6();
  const playerTotal = playerSila + playerRoll;
  const enemyTotal = enemySila + enemyRoll;
  if (playerTotal > enemyTotal) return { playerRoll, enemyRoll, playerTotal, enemyTotal, outcome: 'player', playerLoss: 0, enemyLoss: 1 };
  if (playerTotal < enemyTotal) return { playerRoll, enemyRoll, playerTotal, enemyTotal, outcome: 'enemy', playerLoss: 1, enemyLoss: 0 };
  return { playerRoll, enemyRoll, playerTotal, enemyTotal, outcome: 'tie', playerLoss: 0, enemyLoss: 0 };
}

// Factory: build a complete per-book simulator object. idPrefix/stateKey/i18nPrefix
// and the starting Сила/Издръжливост are the only things that differ between books.
export function createKralskaSim({ bookId, idPrefix, stateKey, i18nPrefix, startSila, startIzd }) {
  const ID = idPrefix;                 // e.g. 'sim481'
  const K  = i18nPrefix;               // e.g. 'battlesim481'
  const tk = (suffix, params) => t(`${K}.${suffix}`, params);

  function _data() {
    const pt = currentPlaythrough();
    if (!pt) return null;
    if (!pt[stateKey]) {
      pt[stateKey] = {
        player: { sila: startSila, izd: startIzd },
        enemy: { name: '', sila: 0, izd: 0, curIzd: 0, hasStats: false },
        log: [],
        history: [],
      };
    }
    const d = pt[stateKey];
    if (!d.player) d.player = { sila: startSila, izd: startIzd };
    if (typeof d.player.sila !== 'number') d.player.sila = startSila;
    if (typeof d.player.izd !== 'number') d.player.izd = startIzd;
    if (!d.enemy) d.enemy = { name: '', sila: 0, izd: 0, curIzd: 0, hasStats: false };
    if (typeof d.enemy.curIzd !== 'number') d.enemy.curIzd = d.enemy.izd;
    if (!d.log) d.log = [];
    if (!d.history) d.history = [];
    return d;
  }

  function _enemyName(d) { return d.enemy.name.trim() || tk('ui.enemy'); }
  function _enemyNameSafe(d) { return escapeHtml(_enemyName(d)); }

  function _appendLog(d, line) {
    d.log.push(line);
    if (d.log.length > 300) d.log.shift();
  }

  function _recordOutcome(d, outcome) {
    d.history.push({ enemy: _enemyName(d), outcome, ts: Date.now() });
  }

  function _over(d) {
    return d.player.izd <= 0 || d.enemy.curIzd <= 0;
  }
  function _ready(d) {
    return d.enemy.hasStats;
  }

  function _finishWin(d) {
    _appendLog(d, `${SVG_TROPHY} ${tk('log.win_footer')}`);
    _recordOutcome(d, 'win');
  }
  function _finishLoss(d) {
    _appendLog(d, `${SVG_SKULL} ${tk('log.loss_footer')}`);
    _recordOutcome(d, 'loss');
  }

  // Resolves one round in place on `d`, appending the log line and recording the outcome if over.
  function _stepRound(d) {
    const r = resolveRound(d.player.sila, d.enemy.sila);
    d.player.izd = Math.max(0, d.player.izd - r.playerLoss);
    d.enemy.curIzd = Math.max(0, d.enemy.curIzd - r.enemyLoss);

    if (r.outcome === 'player') {
      _appendLog(d, tk('log.round_win', {
        name: _enemyNameSafe(d), proll: r.playerRoll, ptotal: r.playerTotal, eroll: r.enemyRoll, etotal: r.enemyTotal, izd: d.enemy.curIzd,
      }));
    } else if (r.outcome === 'enemy') {
      _appendLog(d, tk('log.round_lose', {
        name: _enemyNameSafe(d), proll: r.playerRoll, ptotal: r.playerTotal, eroll: r.enemyRoll, etotal: r.enemyTotal, izd: d.player.izd,
      }));
    } else {
      _appendLog(d, tk('log.round_tie', {
        name: _enemyNameSafe(d), proll: r.playerRoll, ptotal: r.playerTotal, eroll: r.enemyRoll, etotal: r.enemyTotal,
      }));
    }

    if (d.enemy.curIzd <= 0) _finishWin(d);
    else if (d.player.izd <= 0) _finishLoss(d);
  }

  function _runRound() {
    const d = _data();
    if (!d || !_ready(d) || _over(d)) return;
    _stepRound(d);
    saveState();
    _renderAll();
  }

  function _runToEnd() {
    const d = _data();
    if (!d || !_ready(d) || _over(d)) return;
    let guard = 0;
    while (!_over(d) && guard < 1000) { _stepRound(d); guard++; }
    saveState();
    _renderAll();
  }

  function _resetBattle() {
    const d = _data();
    if (!d) return;
    d.enemy.curIzd = d.enemy.izd;
    if (d.log.length) _appendLog(d, tk('log.reset_sep'));
    _appendLog(d, tk('log.reset'));
    saveState();
    _renderAll();
  }

  // ── Render ───────────────────────────────────────────────────────────────

  function _setVal(id, v) { const el = document.getElementById(id); if (el) el.value = v; }

  function _renderStatus() {
    const d = _data();
    const el = document.getElementById(`${ID}-status`);
    if (!d || !el) return;
    if (!d.enemy.hasStats) el.innerHTML = tk('status.pick');
    else if (d.player.izd <= 0) el.innerHTML = `${SVG_SKULL} ${tk('status.defeat')}`;
    else if (d.enemy.curIzd <= 0) el.innerHTML = `${SVG_TROPHY} ${tk('status.victory')}`;
    else el.innerHTML = tk('status.fighting', { enemy: _enemyNameSafe(d), eizd: d.enemy.curIzd });
    const strikeBtn = document.getElementById(`${ID}-strike`);
    if (strikeBtn) strikeBtn.disabled = !_ready(d) || _over(d);
    const endBtn = document.getElementById(`${ID}-to-end`);
    if (endBtn) endBtn.disabled = !_ready(d) || _over(d);
  }

  function _renderInputs() {
    const d = _data();
    if (!d) return;
    _setVal(`${ID}-player-sila`, d.player.sila);
    _setVal(`${ID}-player-izd`, d.player.izd);
    _setVal(`${ID}-e-sila`, d.enemy.sila);
    _setVal(`${ID}-e-izd`, d.enemy.curIzd);
    const pick = document.getElementById(`${ID}-enemy-pick`);
    if (pick && document.activeElement !== pick) pick.value = d.enemy.name;
    _renderStatus();
  }

  function _renderLog() {
    const d = _data();
    const el = document.getElementById(`${ID}-log`);
    if (!el || !d) return;
    el.innerHTML = d.log.slice().reverse().join('<br>');
  }

  function _renderHistory() {
    const d = _data();
    const sumEl = document.getElementById(`${ID}-history-summary`);
    const listEl = document.getElementById(`${ID}-history-list`);
    if (!d || !sumEl || !listEl) return;
    sumEl.textContent = tk('history.summary', { n: d.history.length });
    if (!d.history.length) {
      listEl.innerHTML = `<div class="bsim-history-empty">${tk('history.empty')}</div>`;
      return;
    }
    listEl.innerHTML = d.history.slice().reverse().map(h => {
      const icon = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
      const result = h.outcome === 'win' ? tk('history.won') : tk('history.lost');
      const date = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
      return `<div class="bsim-history-row">
        <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
        <span class="bsim-history-meta">${date}</span>
      </div>`;
    }).join('');
  }

  function _renderAll() { _renderInputs(); _renderLog(); _renderHistory(); }

  function render() {
    const overlay = document.getElementById(`${ID}-overlay`);
    if (!overlay || !overlay.classList.contains('active')) return;
    if (!_data()) { _close(); return; }
    _renderAll();
  }

  function _open() {
    if (!_data()) { showAlert(t('battlesim.no_active_playthrough')); return; }
    _renderAll();
    document.getElementById(`${ID}-overlay`).classList.add('active');
  }

  function _close() {
    document.getElementById(`${ID}-overlay`)?.classList.remove('active');
  }

  function setVisible(visible) {
    const btn = document.getElementById(`${ID}-btn`);
    if (btn) btn.style.display = visible ? '' : 'none';
    if (!visible) _close();
  }

  // ── Enemy autocomplete (book_enemies) ──────────────────────────────────────

  let _enemyList = null;
  async function _loadEnemyList() {
    if (_enemyList) return _enemyList;
    try {
      const res = await apiFetch(`/api/books/${currentBookId}/enemies`);
      _enemyList = res.ok ? await res.json() : [];
    } catch (_) { _enemyList = []; }
    return _enemyList;
  }

  function _applyEnemy(d, enemy) {
    d.enemy.name = enemy.name;
    d.enemy.sila = enemy.attack || 0;
    d.enemy.izd = enemy.hp || 0;
    d.enemy.curIzd = d.enemy.izd;
    d.enemy.hasStats = enemy.attack != null && enemy.hp != null;
    d.player.izd = d.player.izd > 0 ? d.player.izd : startIzd;
  }

  function _setupEnemyAutocomplete() {
    const input = document.getElementById(`${ID}-enemy-pick`);
    const dropdown = document.getElementById(`${ID}-enemy-pick-dropdown`);
    let matches = [];
    let activeIdx = -1;

    function closeDropdown() {
      dropdown.classList.remove('open');
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
    }
    function renderList(q) {
      const list = _enemyList || [];
      const ql = q.trim().toLowerCase();
      matches = ql ? list.filter(e => e.name.toLowerCase().includes(ql)) : list;
      if (!matches.length) { closeDropdown(); return; }
      dropdown.innerHTML = matches.map((e, i) => {
        const sila = e.attack == null ? '?' : e.attack;
        const izd = e.hp == null ? '?' : e.hp;
        return `<li role="option" id="${ID}-enemy-pick-opt-${i}" data-idx="${i}">${escapeHtml(e.name)}<span class="ac-sub">${tk('ui.sila')}:${sila} ${tk('ui.izd')}:${izd}</span></li>`;
      }).join('');
      activeIdx = -1;
      dropdown.classList.add('open');
      input.setAttribute('aria-expanded', 'true');
      input.removeAttribute('aria-activedescendant');
    }
    function select(enemy) {
      const d = _data();
      if (!d || !enemy) return;
      input.value = enemy.name;
      _applyEnemy(d, enemy);
      closeDropdown();
      saveState();
      _renderAll();
    }
    dropdown.addEventListener('mousedown', e => {
      const li = e.target.closest('li');
      if (!li) return;
      select(matches[+li.dataset.idx]);
      e.preventDefault();
    });
    input.addEventListener('focus', async () => { input.removeAttribute('readonly'); await _loadEnemyList(); renderList(input.value); });
    input.addEventListener('input', async () => { await _loadEnemyList(); renderList(input.value); });
    input.addEventListener('blur', () => setTimeout(closeDropdown, 150));
    input.addEventListener('keydown', e => {
      const items = dropdown.querySelectorAll('li');
      if (!items.length) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); activeIdx = Math.min(activeIdx + 1, items.length - 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); activeIdx = Math.max(activeIdx - 1, 0); }
      else if (e.key === 'Enter' && activeIdx >= 0) { e.preventDefault(); select(matches[activeIdx]); return; }
      else if (e.key === 'Escape') { closeDropdown(); return; }
      else return;
      items.forEach((li, i) => { li.classList.toggle('ac-active', i === activeIdx); li.setAttribute('aria-selected', String(i === activeIdx)); });
      if (activeIdx >= 0) input.setAttribute('aria-activedescendant', items[activeIdx].id);
      else input.removeAttribute('aria-activedescendant');
      items[activeIdx]?.scrollIntoView({ block: 'nearest' });
    });
  }

  // ── Init ─────────────────────────────────────────────────────────────────

  function _numField(label, id) {
    return `
      <div class="inv-edit-row">
        <span class="inv-edit-label bsim-stat-label">${label}</span>
        <div class="inv-qty-wrap">
          <button class="inv-qty-btn" data-id="${id}" data-delta="-1">−</button>
          <input id="${id}" class="inv-edit-input inv-qty-input" type="text" inputmode="numeric">
          <button class="inv-qty-btn" data-id="${id}" data-delta="1">+</button>
        </div>
      </div>`;
  }

  function init() {
    const overlay = document.createElement('div');
    overlay.id = `${ID}-overlay`;
    overlay.className = 'inv-overlay';
    overlay.innerHTML = `
      <div class="inv-modal bsim-modal">
        <div class="inv-modal-hdr">
          <span class="inv-modal-title">${tk('ui.title')}</span>
          <button id="${ID}-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
        </div>
        <div class="bsim-body">
          <div class="bsim-col bsim-col-left">
            <div class="bsim-side">
              <div class="bsim-side-title">${tk('ui.you')}</div>
              ${_numField(tk('ui.sila'), `${ID}-player-sila`)}
              ${_numField(tk('ui.izd'), `${ID}-player-izd`)}
            </div>
            <div class="bsim-side">
              <div class="bsim-side-title">${tk('ui.enemy')}</div>
              <div class="inv-edit-row">
                <span class="inv-edit-label bsim-stat-label">${tk('ui.pick')}</span>
                <div class="autocomplete-wrap bsim-enemy-ac">
                  <input id="${ID}-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="${ID}-enemy-pick-dropdown">
                  <ul id="${ID}-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
                </div>
              </div>
              ${_numField(tk('ui.sila'), `${ID}-e-sila`)}
              ${_numField(tk('ui.izd'), `${ID}-e-izd`)}
            </div>
            <div id="${ID}-status" class="bsim-status"></div>
            <div class="inv-modal-ftr bsim-action-grid">
              <button id="${ID}-strike" class="inv-add-btn bsim-action-primary">${tk('btn.strike')}</button>
              <button id="${ID}-to-end" class="inv-add-btn">${tk('btn.to_end')}</button>
              <button id="${ID}-reset" class="inv-add-btn">${tk('btn.reset')}</button>
            </div>
          </div>
          <div class="bsim-col bsim-col-right">
            <details class="bsim-history" open>
              <summary id="${ID}-history-summary">${tk('history.summary', { n: 0 })}</summary>
              <div id="${ID}-history-list" class="bsim-history-list"></div>
            </details>
            <div id="${ID}-log" class="bsim-log"></div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const btn = document.createElement('button');
    btn.id = `${ID}-btn`;
    btn.innerHTML = shortcutLabel(t('battlesim.title'));
    btn.style.display = 'none';
    getPlayBtnRow().appendChild(btn);

    btn.addEventListener('click', _open);
    document.getElementById(`${ID}-close`).addEventListener('click', _close);
    let _mdOnOverlay = false;
    overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
    overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) _close(); });
    registerPanelShortcut('KeyS', {
      getButton: () => btn,
      getOverlay: () => overlay,
      otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== `${ID}-overlay`),
      open: _open,
      close: _close,
    });

    document.getElementById(`${ID}-strike`).addEventListener('click', _runRound);
    document.getElementById(`${ID}-to-end`).addEventListener('click', _runToEnd);
    document.getElementById(`${ID}-reset`).addEventListener('click', _resetBattle);

    const FIELD_MAP = {
      [`${ID}-player-sila`]: ['player', 'sila'],
      [`${ID}-player-izd`]:  ['player', 'izd'],
      [`${ID}-e-sila`]:      ['enemy', 'sila'],
      [`${ID}-e-izd`]:       ['enemy', 'curIzd'],
    };
    function _applyField(id, val) {
      const d = _data();
      if (!d) return;
      const map = FIELD_MAP[id];
      if (!map) return;
      val = Math.max(0, val);
      if (map[0] === 'enemy') d.enemy.hasStats = true;
      d[map[0]][map[1]] = val;
      saveState();
      _renderInputs();
    }
    overlay.querySelectorAll('.inv-qty-input').forEach(input => {
      if (!FIELD_MAP[input.id]) return;
      input.addEventListener('input', () => {
        const raw = String(input.value).replace(/[^0-9]/g, '');
        if (raw !== input.value) input.value = raw;
        _applyField(input.id, Number(raw) || 0);
      });
    });
    overlay.querySelectorAll('.inv-qty-btn').forEach(btnEl => {
      btnEl.addEventListener('click', () => {
        const input = document.getElementById(btnEl.dataset.id);
        if (!input || !FIELD_MAP[btnEl.dataset.id]) return;
        const next = Math.max(0, (Number(input.value) || 0) + Number(btnEl.dataset.delta));
        _applyField(btnEl.dataset.id, next);
      });
    });

    _setupEnemyAutocomplete();
  }

  return { init, render, setVisible };
}

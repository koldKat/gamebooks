// ── Battle Simulator (Мутирала плът, book 781) ──────────────────────────────
// Self-contained module. Imports from state.js, charsheet.js and util.js.
// Visibility is gated (book 781 only) by the caller in boot.js via
// setSim781Visible().
// To remove: delete this file, remove its import line and initSim781()/
// setSim781Visible() calls from boot.js, remove 'sim781' from
// SIM_HISTORY_KEYS in server/db/xp.js, remove 'sim781-overlay' from
// ALL_PANEL_OVERLAY_IDS in util.js and the #sim781-btn selectors in
// battlesim.css.
//
// This is a single-protagonist zombie-apocalypse book with a freeform
// point-buy "Дневник на Приключението" journal (Сила/Физика, Психика,
// Стрелба, Наблюдателност, Медицина, Живот - no canonical build, the
// reader distributes points at difficulty-dependent totals), so - same
// precedent as books 760/772 - the sim lets the reader type in their OWN
// current journal numbers rather than hardcoding a fixed protagonist.
//
// Combat rule, documented on the book's own "Правила за игра"/"Битки" page
// (see book_frontmatter.rules_text for book_id=781):
//   Each round: player attacks first with a chosen weapon (1d6 + fixed
//   bonus + relevant stat), reducing enemy Живот; then the enemy strikes
//   back for its fixed Щети, reducing player Живот. Repeats until either
//   side's Живот reaches 0. Alternative to attacking: "defensive tactic"
//   - reduce the enemy's Щети this round by the player's Физика, but deal
//   no damage that round.
//   Weapons (Щети = 1d6 + X + relevant stat):
//     кози крак        1d6+2+Физика   (melee, unlimited)
//     брадва           1d6+4+Физика   (melee, unlimited)
//     моторна резачка   1d6+16+Физика  (melee, unlimited)
//     пистолет          1d6+4+Стрелба  (firearm, 2 rounds)
//     пушка помпа        1d6+14+Стрелба (firearm, 5 rounds)
//
// Full enemy roster (verified via a complete read of all 100 sections this
// session; a "momiche" mutant girl (§6/7/18/21/24/28/29) is a narrative
// instant-death trap if attacked - no real stat-based fight - so it is
// correctly excluded from the roster):
//   Мутирал доберман (§59/62)       Щети 8  Живот 16
//   Д-р Стоев (§55/61)              Щети 6  Живот 22 (19 on the alternate
//                                            sneak-punch entry at §61 -
//                                            editable, see note below)
//   Д-р Ленова (§72 onward)         Щети 19 Живот 38 (several pre-fight
//                                            narrative modifiers reduce her
//                                            Щети before the loop starts -
//                                            editable, see note below)
//   Медицинска сестра-мутант (§70)  Щети 8  Живот 16 (also has pre-fight
//                                            modifiers - editable)
//   Продавач-мутант (§98)           Щети 10 Живот 22
// Enemy Щети/Живот fields are left freely editable (same as the player's
// own stats) so the reader can apply whichever of the book's narrative
// pre-combat modifiers actually happened in their playthrough (Психика
// reduction, bat companion, sedatives, vaccine syringe, gunfire before the
// fight, etc.) rather than the sim silently guessing which branch they
// took - matching this app's "sim is convenience, not enforcement"
// precedent.
//
// All state lives in pt.sim781, per-user/per-book via currentPlaythrough().

import { currentPlaythrough, saveState } from '../state.js';
import { showAlert } from '../confirm.js';
import { getPlayBtnRow } from '../charsheet.js';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../util.js';
import { t } from '../i18n.js';

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

const WEAPONS = [
  { id: 'crowbar',  name: 'Кози крак',      bonus: 2,  stat: 'physique', ammoMax: null },
  { id: 'axe',      name: 'Брадва',         bonus: 4,  stat: 'physique', ammoMax: null },
  { id: 'chainsaw', name: 'Моторна резачка', bonus: 16, stat: 'physique', ammoMax: null },
  { id: 'pistol',   name: 'Пистолет',       bonus: 4,  stat: 'shooting', ammoMax: 2 },
  { id: 'shotgun',  name: 'Пушка помпа',    bonus: 14, stat: 'shooting', ammoMax: 5 },
];

const ROSTER = [
  { id: 'doberman', name: 'Мутирал доберман',        dmg: 8,  life: 16 },
  { id: 'stoev',     name: 'Д-р Стоев',               dmg: 6,  life: 22 },
  { id: 'lenova',    name: 'Д-р Ленова',              dmg: 19, life: 38 },
  { id: 'nurse',     name: 'Медицинска сестра-мутант', dmg: 8,  life: 16 },
  { id: 'vendor',    name: 'Продавач-мутант',          dmg: 10, life: 22 },
];

function _weapon(id) { return WEAPONS.find(w => w.id === id) || WEAPONS[0]; }
function _enemy(id) { return ROSTER.find(e => e.id === id) || ROSTER[0]; }

function _defaultAmmo() {
  const a = {};
  WEAPONS.forEach(w => { if (w.ammoMax != null) a[w.id] = w.ammoMax; });
  return a;
}

function _data() {
  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim781) {
    pt.sim781 = {
      enemyId: 'doberman',
      weaponId: 'crowbar',
      player: { life: 40, physique: 1, shooting: 1 },
      enemy: { dmg: 8, life: 16 },
      ammo: _defaultAmmo(),
      started: false,
      log: [],
      history: [],
    };
  }
  const d = pt.sim781;
  if (!d.enemyId) d.enemyId = 'doberman';
  if (!d.weaponId) d.weaponId = 'crowbar';
  if (!d.player) d.player = { life: 40, physique: 1, shooting: 1 };
  if (typeof d.player.life !== 'number') d.player.life = 40;
  if (typeof d.player.physique !== 'number') d.player.physique = 1;
  if (typeof d.player.shooting !== 'number') d.player.shooting = 1;
  if (!d.enemy) d.enemy = { ..._enemy(d.enemyId) };
  if (!d.ammo) d.ammo = _defaultAmmo();
  WEAPONS.forEach(w => { if (w.ammoMax != null && typeof d.ammo[w.id] !== 'number') d.ammo[w.id] = w.ammoMax; });
  if (d.started === undefined) d.started = false;
  if (!d.log) d.log = [];
  if (!d.history) d.history = [];
  return d;
}

function _roll1d6() { return 1 + Math.floor(Math.random() * 6); }

function _appendLog(d, line) {
  d.log.push(line);
  if (d.log.length > 200) d.log.shift();
}

function _enemyName(d) { return _enemy(d.enemyId).name; }

function _playerWon(d) { return d.enemy.life <= 0; }
function _playerLost(d) { return d.player.life <= 0; }
function _battleOver(d) { return _playerWon(d) || _playerLost(d); }

function _recordOutcome(d, outcome) {
  d.history.push({ enemy: _enemyName(d), outcome, ts: Date.now() });
}

// ── Combat ───────────────────────────────────────────────────────────────

function _enemyStrike(d) {
  const dmg = Math.max(0, d.enemy.dmg);
  d.player.life = Math.max(0, d.player.life - dmg);
  _appendLog(d, t('battlesim781.log.enemy_hit', { name: _enemyName(d), dmg, life: d.player.life }));
}

function _attack(weaponId) {
  const d = _data();
  if (!d || _battleOver(d)) return;
  const w = _weapon(weaponId);
  if (w.ammoMax != null && d.ammo[w.id] <= 0) return;
  d.started = true;
  d.weaponId = w.id;
  if (w.ammoMax != null) d.ammo[w.id] -= 1;

  const roll = _roll1d6();
  const stat = w.stat === 'physique' ? d.player.physique : d.player.shooting;
  const dmg = roll + w.bonus + stat;
  d.enemy.life = Math.max(0, d.enemy.life - dmg);
  _appendLog(d, t('battlesim781.log.player_attack', { weapon: w.name, roll, dmg, name: _enemyName(d), life: d.enemy.life }));

  if (!_battleOver(d)) _enemyStrike(d);

  _finishRound(d);
}

function _defend() {
  const d = _data();
  if (!d || _battleOver(d)) return;
  d.started = true;
  const reduction = Math.max(0, d.player.physique);
  const dmg = Math.max(0, d.enemy.dmg - reduction);
  d.player.life = Math.max(0, d.player.life - dmg);
  _appendLog(d, t('battlesim781.log.defend', { name: _enemyName(d), reduction, dmg, life: d.player.life }));
  _finishRound(d);
}

function _finishRound(d) {
  if (_playerWon(d)) {
    _appendLog(d, t('battlesim781.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyName(d) }));
    _recordOutcome(d, 'win');
  } else if (_playerLost(d)) {
    _appendLog(d, t('battlesim781.log.fallen', { skull: SVG_SKULL, enemy: _enemyName(d) }));
    _recordOutcome(d, 'loss');
  }
  saveState();
  _renderAll();
}

function _resetBattle() {
  const d = _data();
  if (!d) return;
  d.enemy = { ..._enemy(d.enemyId) };
  d.ammo = _defaultAmmo();
  d.started = false;
  if (d.log.length) _appendLog(d, t('battlesim781.log.reset_sep'));
  _appendLog(d, t('battlesim781.log.reset', { enemy: _enemyName(d) }));
  saveState();
  _renderAll();
}

function _pickEnemy(id) {
  const d = _data();
  if (!d) return;
  d.enemyId = id;
  _resetBattle();
}

// ── Render ───────────────────────────────────────────────────────────────

function _renderStatus() {
  const d  = _data();
  const el = document.getElementById('sim781-status');
  if (!d || !el) return;
  if (_playerLost(d))      el.innerHTML = t('battlesim781.status.fallen', { skull: SVG_SKULL });
  else if (_playerWon(d))  el.innerHTML = t('battlesim781.status.victory', { trophy: SVG_TROPHY });
  else                     el.innerHTML = '';
  const over = _battleOver(d);
  document.getElementById('sim781-defend').disabled = over;
  WEAPONS.forEach(w => {
    const btn = document.getElementById(`sim781-atk-${w.id}`);
    if (!btn) return;
    const outOfAmmo = w.ammoMax != null && d.ammo[w.id] <= 0;
    btn.disabled = over || outOfAmmo;
    btn.textContent = w.ammoMax != null
      ? t('battlesim781.btn.attack_ammo', { weapon: w.name, ammo: d.ammo[w.id] })
      : t('battlesim781.btn.attack', { weapon: w.name });
  });
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim781-history-summary');
  const listEl = document.getElementById('sim781-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim781.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim781.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim781.history.won') : t('battlesim781.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${t('battlesim781.history.you')} ${t('battlesim781.history.vs')} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">${date}</span>
    </div>`;
  }).join('');
}

function _renderLog() {
  const d  = _data();
  const el = document.getElementById('sim781-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _enemyOptions(selectedId) {
  return ROSTER.map(e => `<option value="${e.id}" ${e.id === selectedId ? 'selected' : ''}>${escapeHtml(e.name)}</option>`).join('');
}

function _renderInputs() {
  const d = _data();
  if (!d) return;

  document.getElementById('sim781-enemy-pick').innerHTML = _enemyOptions(d.enemyId);

  document.getElementById('sim781-player-life').value      = d.player.life;
  document.getElementById('sim781-player-physique').value  = d.player.physique;
  document.getElementById('sim781-player-shooting').value  = d.player.shooting;

  document.getElementById('sim781-enemy-dmg').value  = d.enemy.dmg;
  document.getElementById('sim781-enemy-life').value = d.enemy.life;

  _renderStatus();
}

function _renderAll() {
  _renderInputs();
  _renderLog();
  _renderHistory();
}

export function renderSim781() {
  const overlay = document.getElementById('sim781-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim781(); return; }
  _renderAll();
}

function openSim781() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim781-overlay').classList.add('active');
}

function closeSim781() {
  document.getElementById('sim781-overlay')?.classList.remove('active');
}

export function setSim781Visible(visible) {
  const btn = document.getElementById('sim781-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim781();
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

export function initSim781() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim781-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim781.ui.title')}</span>
        <button id="sim781-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim781.ui.you')}</div>
            ${_numField(t('battlesim781.ui.life'), 'sim781-player-life')}
            ${_numField(t('battlesim781.ui.physique'), 'sim781-player-physique')}
            ${_numField(t('battlesim781.ui.shooting'), 'sim781-player-shooting')}
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim781.ui.enemy')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim781.ui.pick')}</span>
              <select id="sim781-enemy-pick" class="inv-edit-input"></select>
            </div>
            ${_numField(t('battlesim781.ui.dmg'), 'sim781-enemy-dmg')}
            ${_numField(t('battlesim781.ui.life'), 'sim781-enemy-life')}
          </div>
          <div id="sim781-status" class="bsim-status"></div>
          <div class="inv-modal-ftr bsim-action-grid">
            ${WEAPONS.map(w => `<button id="sim781-atk-${w.id}" class="inv-add-btn bsim-action-primary">${t('battlesim781.btn.attack', { weapon: w.name })}</button>`).join('')}
            <button id="sim781-defend" class="inv-add-btn">${t('battlesim781.btn.defend')}</button>
          </div>
          <div class="inv-modal-ftr">
            <button id="sim781-reset" class="inv-add-btn">${t('battlesim781.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary id="sim781-history-summary">${t('battlesim781.history.summary', { n: 0 })}</summary>
            <div id="sim781-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim781-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim781-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim781);
  document.getElementById('sim781-close').addEventListener('click', closeSim781);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim781(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim781-overlay'),
    open:  openSim781,
    close: closeSim781,
  });

  document.getElementById('sim781-enemy-pick').addEventListener('change', e => _pickEnemy(e.target.value));
  WEAPONS.forEach(w => {
    document.getElementById(`sim781-atk-${w.id}`).addEventListener('click', () => _attack(w.id));
  });
  document.getElementById('sim781-defend').addEventListener('click', _defend);
  document.getElementById('sim781-reset').addEventListener('click', _resetBattle);

  overlay.querySelectorAll('.inv-qty-btn').forEach(btnEl => {
    btnEl.addEventListener('click', () => {
      const d = _data();
      if (!d) return;
      const id    = btnEl.dataset.id;
      const delta = Number(btnEl.dataset.delta);
      const input = document.getElementById(id);
      const val   = Math.max(0, (parseInt(input.value, 10) || 0) + delta);
      input.value = val;
      if (id === 'sim781-player-life')     d.player.life = val;
      else if (id === 'sim781-player-physique') d.player.physique = val;
      else if (id === 'sim781-player-shooting') d.player.shooting = val;
      else if (id === 'sim781-enemy-dmg')       d.enemy.dmg = val;
      else if (id === 'sim781-enemy-life')      d.enemy.life = val;
      saveState();
      _renderStatus();
    });
  });

  overlay.querySelectorAll('.inv-qty-input').forEach(input => {
    input.addEventListener('change', () => {
      const d = _data();
      if (!d) return;
      const val = Math.max(0, parseInt(input.value, 10) || 0);
      input.value = val;
      const id = input.id;
      if (id === 'sim781-player-life')     d.player.life = val;
      else if (id === 'sim781-player-physique') d.player.physique = val;
      else if (id === 'sim781-player-shooting') d.player.shooting = val;
      else if (id === 'sim781-enemy-dmg')       d.enemy.dmg = val;
      else if (id === 'sim781-enemy-life')      d.enemy.life = val;
      saveState();
      _renderStatus();
    });
  });
}

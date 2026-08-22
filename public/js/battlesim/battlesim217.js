// ── Battle Simulator (Trial of Champions, book 217) ─────────────────────────
// Self-contained module. Imports from state.js, charsheet.js and util.js.
// Visibility is gated (book 217 only) by the caller in boot.js via
// setSim217Visible().
// To remove: delete this file, remove its import line and initSim217()/
// setSim217Visible() calls from boot.js, remove 'sim217' from
// SIM_HISTORY_KEYS in server/db/xp.js, and remove the .bsim-* CSS (shared
// with the other battlesim*.js files, so only remove it if all are gone).
//
// Standard Fighting Fantasy SKILL/STAMINA/LUCK system, same core numbers,
// Test Your Luck table and score ceilings as every other FF sim in this app -
// SKILL 1d6+6, STAMINA 2d6+12, LUCK 1d6+6. Provisions are NOT modeled - this
// book's own rules text is explicit that, unlike other FF books, it starts
// with none at all, and STAMINA is regained "in various ways" with no single
// numeric rule to build a consumable around.
//
// attackModifier/enemyWoundDamage/winAfterHits kept as generic hand-applied
// knobs (matching every other FF sim's precedent) for one-off cases like the
// Liche Queen's "-3 SKILL during this combat" (§80) or a magic weapon's +1/+2
// SKILL bonus (only one ever applies at once per the rule text). No
// pairedFight/sideEnemy mechanic - every multi-enemy encounter in this book
// (2 Orcs §139/§192, 5 Rats §146, 2 Vampire Bats §186, 4 Xoroa Warriors §259)
// is explicitly fought one at a time in the text, not simultaneously, so
// re-pick the next roster enemy after defeating the current one. No
// enemyStaminaFloor cases found either - every fight in this book runs to 0.
//
// book_enemies.attack holds SKILL, .hp holds STAMINA, .defense unused. 45
// rows read from all 400 sections; two same-name/same-stat pairs (Giant
// Centipede §154/§270, Slave §73/§349) share the exact same "if you win"
// destination and are merged into one row each; other same-named encounters
// (Bone Devil, Chaos Champion, Bloodworm) go to different destinations or
// have different stats and are kept as separate rows.
//
// All state lives in pt.sim217, per-user/per-book via currentPlaythrough().

import { currentPlaythrough, saveState, apiFetch, currentBookId } from '../state.js?v=1464';
import { showAlert } from '../confirm.js?v=1464';
import { getPlayBtnRow } from '../charsheet.js?v=1464';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../util.js?v=1464';
import { t } from '../i18n.js?v=1464';

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

function _data() {
  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim217) {
    pt.sim217 = {
      player: {
        skill: 0, skillInitial: 0,
        stamina: 0, staminaInitial: 0,
        luck: 0, luckInitial: 0,
        attackModifier: 0,
        enemyWoundDamage: 2,
        winAfterHits: 0,
        hitsLandedThisFight: 0,
      },
      enemy: { name: '', skill: 0, stamina: 0, staminaMax: 0 },
      rolled: false,
      pendingLuckQueue: [],
      roundsThisBattle: 0,
      log: [],
      history: [],
    };
  }
  const d = pt.sim217;
  if (d.rolled === undefined) d.rolled = false;
  if (!Array.isArray(d.pendingLuckQueue)) d.pendingLuckQueue = [];
  if (d.roundsThisBattle === undefined) d.roundsThisBattle = 0;
  if (!d.history) d.history = [];
  if (d.player.attackModifier === undefined) d.player.attackModifier = 0;
  if (d.player.enemyWoundDamage === undefined) d.player.enemyWoundDamage = 2;
  if (d.player.winAfterHits === undefined) d.player.winAfterHits = 0;
  if (d.player.hitsLandedThisFight === undefined) d.player.hitsLandedThisFight = 0;
  return d;
}

function _notReady(d) { return !d.rolled; }

function _roll2d6() { return 2 + Math.floor(Math.random() * 6) + Math.floor(Math.random() * 6); }

function _appendLog(d, line) {
  d.log.push(line);
  if (d.log.length > 200) d.log.shift();
}

function _enemyName(d) { return d.enemy.name.trim() || t('battlesim.default_enemy'); }
function _enemyNameSafe(d) { return escapeHtml(_enemyName(d)); }

function _effectiveSkill(d) { return d.player.skill; }

function _resetEncounterKnobs(d) {
  d.player.attackModifier = 0;
  d.player.enemyWoundDamage = 2;
  d.player.winAfterHits = 0;
  d.player.hitsLandedThisFight = 0;
}

// Uncapped lifetime log - the admin dashboard aggregates battle counts
// app-wide from this array, so per-user history needs to be a true lifetime
// total, not a rolling window.
function _recordOutcome(d, outcome) {
  d.history.push({
    enemy: _enemyName(d), outcome,
    playerStamina: d.player.stamina, playerStaminaMax: d.player.staminaInitial,
    ts: Date.now(),
  });
}

// ── Combat ───────────────────────────────────────────────────────────────────

function _runRound() {
  const d = _data();
  if (!d || _notReady(d) || d.player.stamina <= 0 || d.enemy.stamina <= 0 || d.pendingLuckQueue.length) return;
  d.roundsThisBattle++;

  const woundDmg = Math.max(1, d.player.enemyWoundDamage || 2);

  const playerAS = _roll2d6() + _effectiveSkill(d) + (d.player.attackModifier || 0);
  const enemyAS  = _roll2d6() + d.enemy.skill;
  _appendLog(d, t('battlesim217.log.round', { round: d.roundsThisBattle, playerAS, enemy: _enemyNameSafe(d), enemyAS }));

  if (playerAS === enemyAS) {
    _appendLog(d, t('battlesim217.log.both_avoided'));
  } else if (playerAS > enemyAS) {
    d.enemy.stamina = Math.max(0, d.enemy.stamina - 2);
    d.player.hitsLandedThisFight++;
    _appendLog(d, t('battlesim217.log.you_wound', { enemy: _enemyNameSafe(d), n: 2, stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    if (d.player.winAfterHits > 0 && d.player.hitsLandedThisFight >= d.player.winAfterHits && d.enemy.stamina > 0) {
      d.enemy.stamina = 0;
      _appendLog(d, t('battlesim217.log.press_advantage'));
    }
    if (d.enemy.stamina > 0) d.pendingLuckQueue.push({ kind: 'player-hit' });
  } else {
    d.player.stamina = Math.max(0, d.player.stamina - woundDmg);
    _appendLog(d, t('battlesim217.log.enemy_wounds', { enemy: _enemyNameSafe(d), n: woundDmg, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    if (d.player.stamina > 0) d.pendingLuckQueue.push({ kind: 'enemy-hit' });
  }

  if (d.enemy.stamina <= 0) {
    _appendLog(d, t('battlesim217.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
  } else if (d.player.stamina <= 0) {
    _appendLog(d, t('battlesim217.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
    d.pendingLuckQueue = [];
  }

  saveState();
  _renderAll();
}

// Test Your Luck after a hit lands: costs 1 LUCK regardless of outcome. Same
// Lucky/Unlucky table as every other FF sim in this app.
function _testLuck() {
  const d = _data();
  if (!d || !d.pendingLuckQueue.length || d.player.luck <= 0) return;
  const event = d.pendingLuckQueue.shift();
  const roll  = _roll2d6();
  const lucky = roll <= d.player.luck;
  d.player.luck = Math.max(0, d.player.luck - 1);
  if (event.kind === 'player-hit') {
    if (lucky) {
      d.enemy.stamina = Math.max(0, d.enemy.stamina - 2);
      _appendLog(d, t('battlesim217.log.luck_player_hit_lucky', { roll, enemy: _enemyNameSafe(d), stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    } else {
      d.enemy.stamina = Math.min(d.enemy.staminaMax, d.enemy.stamina + 1);
      _appendLog(d, t('battlesim217.log.luck_player_hit_unlucky', { roll, enemy: _enemyNameSafe(d), stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    }
    if (d.enemy.stamina <= 0) { _appendLog(d, t('battlesim217.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) })); _recordOutcome(d, 'win'); }
  } else {
    const source = _enemyNameSafe(d);
    if (lucky) {
      d.player.stamina = Math.min(d.player.staminaInitial, d.player.stamina + 1);
      _appendLog(d, t('battlesim217.log.luck_hit_lucky', { roll, source, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    } else {
      d.player.stamina = Math.max(0, d.player.stamina - 1);
      _appendLog(d, t('battlesim217.log.luck_hit_unlucky', { roll, source, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    }
    if (d.player.stamina <= 0) {
      _appendLog(d, t('battlesim217.log.fallen', { skull: SVG_SKULL }));
      _recordOutcome(d, 'loss');
      d.pendingLuckQueue = [];
    }
  }
  saveState();
  _renderAll();
}

function _skipLuck() {
  const d = _data();
  if (!d || !d.pendingLuckQueue.length) return;
  d.pendingLuckQueue.shift();
  saveState();
  _renderAll();
}

function _resetBattle() {
  const d = _data();
  if (!d) return;
  d.enemy.stamina = d.enemy.staminaMax;
  d.player.stamina = d.player.staminaInitial;
  d.roundsThisBattle = 0;
  d.player.hitsLandedThisFight = 0;
  d.pendingLuckQueue = [];
  if (d.log.length) _appendLog(d, t('battlesim217.log.reset_sep'));
  _appendLog(d, t('battlesim217.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}

// ── Render ────────────────────────────────────────────────────────────────

function _renderStatus() {
  const d  = _data();
  const el = document.getElementById('sim217-status');
  if (!d || !el) return;
  const notReady = _notReady(d);
  const hasEnemy = d.enemy.staminaMax > 0;
  if (notReady)                                    el.innerHTML = t('battlesim217.status.not_ready');
  else if (d.player.stamina <= 0)                   el.innerHTML = t('battlesim217.status.fallen', { skull: SVG_SKULL });
  else if (hasEnemy && d.enemy.stamina <= 0)         el.innerHTML = t('battlesim217.status.victory', { trophy: SVG_TROPHY });
  else                                               el.innerHTML = '';
  const over = notReady || d.player.stamina <= 0 || (hasEnemy && d.enemy.stamina <= 0);
  document.getElementById('sim217-round').disabled = over || !!d.pendingLuckQueue.length;
  document.getElementById('sim217-luck-yes').disabled = notReady || !d.pendingLuckQueue.length || d.player.luck <= 0;
  document.getElementById('sim217-luck-no').disabled  = notReady || !d.pendingLuckQueue.length;
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim217-history-summary');
  const listEl = document.getElementById('sim217-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim217.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim217.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim217.history.won') : t('battlesim217.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">STAMINA ${h.playerStamina}/${h.playerStaminaMax} · ${date}</span>
    </div>`;
  }).join('');
}

function _renderLog() {
  const d  = _data();
  const el = document.getElementById('sim217-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderInputs() {
  const d = _data();
  if (!d) return;

  document.getElementById('sim217-player-skill').value      = d.player.skill;
  document.getElementById('sim217-player-skillmax').value   = d.player.skillInitial;
  document.getElementById('sim217-player-stamina').value    = Math.min(d.player.stamina, d.player.staminaInitial);
  document.getElementById('sim217-player-staminamax').value = d.player.staminaInitial;
  document.getElementById('sim217-player-luck').value       = d.player.luck;
  document.getElementById('sim217-player-luckmax').value    = d.player.luckInitial;
  document.getElementById('sim217-player-atkmod').value     = d.player.attackModifier;

  const rollBtn = document.getElementById('sim217-roll');
  rollBtn.disabled = d.rolled;
  rollBtn.textContent = d.rolled ? t('battlesim217.btn.rolled') : t('battlesim217.btn.roll');

  document.getElementById('sim217-enemy-pick').value    = d.enemy.name;
  document.getElementById('sim217-enemy-skill').value   = d.enemy.skill;
  document.getElementById('sim217-enemy-stamina').value    = Math.min(d.enemy.stamina, d.enemy.staminaMax);
  document.getElementById('sim217-enemy-staminamax').value = d.enemy.staminaMax;
  document.getElementById('sim217-enemy-wounddmg').value   = d.player.enemyWoundDamage;
  document.getElementById('sim217-enemy-winhits').value    = d.player.winAfterHits;

  const pendingEl = document.getElementById('sim217-luck-prompt');
  pendingEl.style.display = d.pendingLuckQueue.length ? '' : 'none';

  _renderStatus();
}

function _renderAll() {
  _renderInputs();
  _renderLog();
  _renderHistory();
}

export function renderSim217() {
  const overlay = document.getElementById('sim217-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim217(); return; }
  _renderAll();
}

function openSim217() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim217-overlay').classList.add('active');
}

function closeSim217() {
  document.getElementById('sim217-overlay')?.classList.remove('active');
}

export function setSim217Visible(visible) {
  const btn = document.getElementById('sim217-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim217();
}

// ── Enemy autocomplete (fed by book_enemies, seeded per book_id) ───────────

let _enemyList = null;
async function _loadEnemyList() {
  if (_enemyList) return _enemyList;
  try {
    const res = await apiFetch(`/api/books/${currentBookId}/enemies`);
    _enemyList = res.ok ? await res.json() : [];
  } catch (_) {
    _enemyList = [];
  }
  return _enemyList;
}

function _setupEnemyAutocomplete(inputId, dropdownId, onSelect) {
  const input    = document.getElementById(inputId);
  const dropdown = document.getElementById(dropdownId);
  let matches   = [];
  let activeIdx = -1;

  function closeDropdown() {
    dropdown.classList.remove('open');
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }

  function render(q) {
    const list = _enemyList || [];
    const ql = q.trim().toLowerCase();
    matches = ql ? list.filter(e => e.name.toLowerCase().includes(ql)) : list;
    if (!matches.length) { closeDropdown(); return; }
    dropdown.innerHTML = matches.map((e, i) =>
      `<li role="option" id="${dropdownId}-opt-${i}" data-idx="${i}">${escapeHtml(e.name)}<span class="ac-sub">SKILL:${e.attack ?? '?'} STAMINA:${e.hp ?? '?'}</span></li>`
    ).join('');
    activeIdx = -1;
    dropdown.classList.add('open');
    input.setAttribute('aria-expanded', 'true');
    input.removeAttribute('aria-activedescendant');
  }

  function select(enemy) {
    if (!enemy) return;
    input.value = enemy.name;
    onSelect(enemy);
    closeDropdown();
  }

  dropdown.addEventListener('mousedown', e => {
    const li = e.target.closest('li');
    if (!li) return;
    select(matches[+li.dataset.idx]);
    e.preventDefault();
  });

  input.addEventListener('focus', async () => { input.removeAttribute('readonly'); await _loadEnemyList(); render(input.value); });
  input.addEventListener('input', async () => { await _loadEnemyList(); render(input.value); });
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

// ── Init ──────────────────────────────────────────────────────────────────────

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

export function initSim217() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim217-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim217.ui.title')}</span>
        <button id="sim217-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim217.ui.you')}</div>
            <div class="inv-edit-row bsim-life-roll-row">
              <button id="sim217-roll" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim217.btn.roll')}</button>
            </div>
            ${_numField(t('battlesim217.ui.skill'), 'sim217-player-skill')}
            ${_numField(t('battlesim217.ui.skill_initial'), 'sim217-player-skillmax')}
            ${_numField(t('battlesim217.ui.stamina'), 'sim217-player-stamina')}
            ${_numField(t('battlesim217.ui.stamina_initial'), 'sim217-player-staminamax')}
            ${_numField(t('battlesim217.ui.luck'), 'sim217-player-luck')}
            ${_numField(t('battlesim217.ui.luck_initial'), 'sim217-player-luckmax')}
            ${_numField(t('battlesim217.ui.atkmod'), 'sim217-player-atkmod')}
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim217.ui.enemy')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim217.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim217-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim217-enemy-pick-dropdown">
                <ul id="sim217-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim217.ui.skill'), 'sim217-enemy-skill')}
            ${_numField(t('battlesim217.ui.stamina'), 'sim217-enemy-stamina')}
            ${_numField(t('battlesim217.ui.stamina_max'), 'sim217-enemy-staminamax')}
            ${_numField(t('battlesim217.ui.wound_dmg'), 'sim217-enemy-wounddmg')}
            ${_numField(t('battlesim217.ui.win_after_hits'), 'sim217-enemy-winhits')}
          </div>
          <div id="sim217-status" class="bsim-status"></div>
          <div id="sim217-luck-prompt" class="inv-edit-row bsim-heal-row" style="display:none">
            <span class="inv-edit-label bsim-stat-label">${t('battlesim217.btn.luck_prompt')}</span>
            <button id="sim217-luck-yes" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim217.btn.luck_yes')}</button>
            <button id="sim217-luck-no" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim217.btn.luck_no')}</button>
          </div>
          <div class="inv-modal-ftr">
            <button id="sim217-round" class="inv-add-btn bsim-action-primary">${t('battlesim217.btn.round')}</button>
            <button id="sim217-reset" class="inv-add-btn">${t('battlesim217.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history">
            <summary id="sim217-history-summary">${t('battlesim217.history.summary', { n: 0 })}</summary>
            <div id="sim217-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim217-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim217-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim217);
  document.getElementById('sim217-close').addEventListener('click', closeSim217);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim217(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim217-overlay'),
    open:  openSim217,
    close: closeSim217,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim217();
  });

  document.getElementById('sim217-round').addEventListener('click', _runRound);
  document.getElementById('sim217-reset').addEventListener('click', _resetBattle);
  document.getElementById('sim217-luck-yes').addEventListener('click', _testLuck);
  document.getElementById('sim217-luck-no').addEventListener('click', _skipLuck);

  document.getElementById('sim217-roll').addEventListener('click', () => {
    const d = _data();
    if (!d || d.rolled) return;
    d.player.skillInitial   = 1 + Math.floor(Math.random() * 6) + 6;
    d.player.staminaInitial = _roll2d6() + 12;
    d.player.luckInitial    = 1 + Math.floor(Math.random() * 6) + 6;
    d.player.skill   = d.player.skillInitial;
    d.player.stamina = d.player.staminaInitial;
    d.player.luck    = d.player.luckInitial;
    d.rolled = true;
    _appendLog(d, t('battlesim217.log.rolled', { skill: d.player.skillInitial, stamina: d.player.staminaInitial, luck: d.player.luckInitial }));
    saveState();
    _renderAll();
  });

  document.getElementById('sim217-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });

  // Plain numeric steppers
  const FIELD_MAP = {
    'sim217-player-skill':      ['player', 'skill'],
    'sim217-player-skillmax':   ['player', 'skillInitial'],
    'sim217-player-stamina':    ['player', 'stamina'],
    'sim217-player-staminamax': ['player', 'staminaInitial'],
    'sim217-player-luck':       ['player', 'luck'],
    'sim217-player-luckmax':    ['player', 'luckInitial'],
    'sim217-player-atkmod':     ['player', 'attackModifier'],
    'sim217-enemy-skill':       ['enemy', 'skill'],
    'sim217-enemy-stamina':        ['enemy', 'stamina'],
    'sim217-enemy-staminamax':     ['enemy', 'staminaMax'],
    'sim217-enemy-wounddmg':       ['player', 'enemyWoundDamage'],
    'sim217-enemy-winhits':        ['player', 'winAfterHits'],
  };
  function _applyField(id, val) {
    const d = _data();
    if (!d) return;
    const map = FIELD_MAP[id];
    if (!map) return;
    // Attack modifier is the one field allowed to go negative (bare-handed/
    // disarmed/fatigue penalties are always a subtraction) - every other
    // field stays clamped to 0 or above.
    val = id === 'sim217-player-atkmod' ? Number(val) : Math.max(0, val);
    if (id === 'sim217-player-skill') val = Math.min(val, d.player.skillInitial);
    if (id === 'sim217-player-stamina') val = Math.min(val, d.player.staminaInitial);
    if (id === 'sim217-player-luck') val = Math.min(val, d.player.luckInitial);
    if (id === 'sim217-enemy-stamina') val = Math.min(val, d.enemy.staminaMax);
    d[map[0]][map[1]] = val;
    if (id === 'sim217-player-skillmax') d.player.skill = Math.min(d.player.skill, val);
    if (id === 'sim217-player-staminamax') d.player.stamina = Math.min(d.player.stamina, val);
    if (id === 'sim217-player-luckmax') d.player.luck = Math.min(d.player.luck, val);
    if (id === 'sim217-enemy-staminamax') d.enemy.stamina = Math.min(d.enemy.stamina, val);
    saveState();
    _renderInputs();
  }
  overlay.querySelectorAll('.inv-qty-input[id^="sim217-"]').forEach(input => {
    if (!FIELD_MAP[input.id]) return;
    const allowNegative = input.id === 'sim217-player-atkmod';
    input.addEventListener('input', () => {
      const raw = String(input.value).replace(allowNegative ? /[^0-9-]/g : /[^0-9]/g, '');
      if (raw !== input.value) input.value = raw;
      _applyField(input.id, Number(raw) || 0);
    });
  });
  overlay.querySelectorAll('.inv-qty-btn[data-id^="sim217-"]').forEach(btnEl => {
    btnEl.addEventListener('click', () => {
      const input = document.getElementById(btnEl.dataset.id);
      if (!input || !FIELD_MAP[btnEl.dataset.id]) return;
      const allowNegative = btnEl.dataset.id === 'sim217-player-atkmod';
      const next = (allowNegative ? Math.max(-99, Number(input.value) || 0) : Math.max(0, Number(input.value) || 0)) + Number(btnEl.dataset.delta);
      _applyField(btnEl.dataset.id, next);
    });
  });

  _setupEnemyAutocomplete('sim217-enemy-pick', 'sim217-enemy-pick-dropdown', enemy => {
    const d = _data();
    if (!d) return;
    d.enemy.name = enemy.name;
    if (enemy.attack != null) d.enemy.skill = enemy.attack;
    if (enemy.hp != null)     { d.enemy.stamina = enemy.hp; d.enemy.staminaMax = enemy.hp; }
    d.roundsThisBattle = 0;
    d.pendingLuckQueue = [];
    _resetEncounterKnobs(d);
    saveState();
    _renderAll();
  });
}

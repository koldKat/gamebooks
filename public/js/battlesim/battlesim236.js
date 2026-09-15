// ── Battle Simulator (Dead of Night, book 236) ───────────────────────────────
// Self-contained module. Imports from state.js, charsheet.js and util.js.
// Visibility is gated (book 236 only) by the caller in boot.js via
// setSim236Visible().
// To remove: delete this file, remove its import line and initSim236()/
// setSim236Visible() calls from boot.js, remove 'sim236' from
// SIM_HISTORY_KEYS in server/db/xp.js, remove 'sim236-overlay' from
// ALL_PANEL_OVERLAY_IDS in util.js and the #sim236-btn selectors in
// battlesim.css.
//
// Standard Fighting Fantasy SKILL/STAMINA/LUCK system (same core numbers and
// Test Your Luck table as books 186/198/200/201/202): SKILL 1d6+6, STAMINA
// 2d6+12, LUCK 1d6+6, normal wound 2 STAMINA, Attack Strength = 2d6+SKILL.
// This book also tracks EVIL (narrative-only, never rolled against in
// combat - not modeled here, same as this book's own non-combat Test Your
// Luck calls).
//
// Book-specific knobs, all confirmed against the full 400-section read:
// - attackModifier: plain +/- Attack Strength knob, covering the several
//   "defending a narrow opening" (+1, sec.156) and "fight bare-handed" (-1,
//   sec.221) one-off cases.
// - thickArmour: the Armoured Ogre (sec.53) inflicts damage as normal but
//   only TAKES 1 STAMINA of damage per landed hit instead of 2 (2 if Lucky,
//   0 if Unlucky) - its armour is explicitly "very thick". One-fight toggle.
// - demonSlayingSword: the sword given at sec.348 adds 4 to SKILL in any
//   fight against Demons, "even if that takes your SKILL to over 12" - a
//   persistent item, not reset between fights, so it lives outside
//   _resetEncounterKnobs().
// - myurrFight: the final battle (sec.398) is SKILL 14/STAMINA 25 with two
//   book-specific rules bundled into one toggle - Myurr attacks twice per
//   round (modeled as a second, unwoundable enemy Attack Strength roll each
//   round, same shape as the "paired fight" mechanic other book sims use
//   for simultaneous attackers), and only a magical weapon (the Demon-
//   Slaying sword) can wound him at all - a normal weapon "neither gives
//   nor receives" damage on a won round. Deliberately NOT modeled: Myurr's
//   Holy-Water-throw and item-destroy alternate actions (sec.398 lists six
//   named objects, one of which conceals his banishing gem) - these are
//   one-off narrative choices with their own paragraph-specific results,
//   not a repeatable dice mechanic, so the sim only covers the standard
//   "fight as normal" branch as instructed by the book's own combat text.
// - heroismPotion: found at sec.78, a single-dose item usable at the start
//   of any one battle - restores 2 STAMINA immediately and adds 2 to SKILL
//   for the duration of that fight only.
//
// All state lives in pt.sim236, per-user/per-book via currentPlaythrough().

import { currentPlaythrough, saveState, apiFetch, currentBookId } from '../state.js';
import { showAlert } from '../confirm.js';
import { getPlayBtnRow } from '../charsheet.js';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../util.js';
import { t } from '../i18n.js';

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

function _data() {
  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim236) {
    pt.sim236 = {
      player: {
        skill: 0, skillInitial: 0,
        stamina: 0, staminaInitial: 0,
        luck: 0, luckInitial: 0,
        attackModifier: 0,
        thickArmour: false,
        demonSlayingSword: false,
        myurrFight: false,
        heroismUsedThisFight: false,
      },
      enemy: { name: '', skill: 0, stamina: 0, staminaMax: 0 },
      rolled: false,
      pendingLuckQueue: [],
      roundsThisBattle: 0,
      log: [],
      history: [],
    };
  }
  const d = pt.sim236;
  if (d.rolled === undefined) d.rolled = false;
  if (!Array.isArray(d.pendingLuckQueue)) d.pendingLuckQueue = [];
  if (d.roundsThisBattle === undefined) d.roundsThisBattle = 0;
  if (!d.history) d.history = [];
  if (d.player.attackModifier === undefined) d.player.attackModifier = 0;
  if (d.player.thickArmour === undefined) d.player.thickArmour = false;
  if (d.player.demonSlayingSword === undefined) d.player.demonSlayingSword = false;
  if (d.player.myurrFight === undefined) d.player.myurrFight = false;
  if (d.player.heroismUsedThisFight === undefined) d.player.heroismUsedThisFight = false;
  return d;
}

function _notReady(d) { return !d.rolled; }

function _roll2d6() { return 2 + Math.floor(Math.random() * 6) + Math.floor(Math.random() * 6); }
function _roll1d6() { return 1 + Math.floor(Math.random() * 6); }

function _appendLog(d, line) {
  d.log.push(line);
  if (d.log.length > 200) d.log.shift();
}

function _enemyName(d) { return d.enemy.name.trim() || t('battlesim.default_enemy'); }
function _enemyNameSafe(d) { return escapeHtml(_enemyName(d)); }

function _effectiveSkill(d) {
  let skill = d.player.skill;
  if (d.player.demonSlayingSword) skill += 4;
  return skill;
}

function _resetEncounterKnobs(d) {
  d.player.attackModifier = 0;
  d.player.thickArmour = false;
  d.player.myurrFight = false;
  d.player.heroismUsedThisFight = false;
}

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

  const playerAS = _roll2d6() + _effectiveSkill(d) + (d.player.attackModifier || 0);
  const enemyAS  = _roll2d6() + d.enemy.skill;
  _appendLog(d, t('battlesim236.log.round', { round: d.roundsThisBattle, playerAS, enemy: _enemyNameSafe(d), enemyAS }));
  if (playerAS === enemyAS) {
    _appendLog(d, t('battlesim236.log.both_avoided'));
  } else if (playerAS > enemyAS) {
    // Myurr can only be wounded by a magical weapon (the Demon-Slaying sword).
    if (d.player.myurrFight && !d.player.demonSlayingSword) {
      _appendLog(d, t('battlesim236.log.no_effect', { enemy: _enemyNameSafe(d) }));
    } else {
      const dmg = d.player.thickArmour ? 1 : 2;
      d.enemy.stamina = Math.max(0, d.enemy.stamina - dmg);
      _appendLog(d, t('battlesim236.log.you_wound', { enemy: _enemyNameSafe(d), n: dmg, stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
      if (d.enemy.stamina > 0) d.pendingLuckQueue.push({ kind: 'player-hit' });
    }
  } else {
    d.player.stamina = Math.max(0, d.player.stamina - 2);
    _appendLog(d, t('battlesim236.log.enemy_wounds', { enemy: _enemyNameSafe(d), n: 2, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    if (d.player.stamina > 0) d.pendingLuckQueue.push({ kind: 'enemy-hit' });
  }

  // Myurr's four arms let him attack twice per round; only the player's own
  // single attack (handled above) can ever wound him back.
  if (d.player.myurrFight && d.player.stamina > 0 && d.enemy.stamina > 0) {
    const playerAS2 = _roll2d6() + _effectiveSkill(d) + (d.player.attackModifier || 0);
    const enemyAS2  = _roll2d6() + d.enemy.skill;
    _appendLog(d, t('battlesim236.log.myurr_second', { playerAS: playerAS2, enemyAS: enemyAS2 }));
    if (enemyAS2 > playerAS2) {
      d.player.stamina = Math.max(0, d.player.stamina - 2);
      _appendLog(d, t('battlesim236.log.enemy_wounds', { enemy: _enemyNameSafe(d), n: 2, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
      if (d.player.stamina > 0) d.pendingLuckQueue.push({ kind: 'enemy-hit' });
    } else {
      _appendLog(d, t('battlesim236.log.both_avoided'));
    }
  }

  if (d.enemy.stamina <= 0) {
    _appendLog(d, t('battlesim236.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
  } else if (d.player.stamina <= 0) {
    _appendLog(d, t('battlesim236.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
    d.pendingLuckQueue = [];
  }

  saveState();
  _renderAll();
}

// Test Your Luck after a hit lands: costs 1 LUCK regardless of outcome.
function _testLuck() {
  const d = _data();
  if (!d || !d.pendingLuckQueue.length || d.player.luck <= 0) return;
  const event = d.pendingLuckQueue.shift();
  const roll  = _roll2d6();
  const lucky = roll <= d.player.luck;
  d.player.luck = Math.max(0, d.player.luck - 1);
  if (event.kind === 'player-hit') {
    const bonus = d.player.thickArmour ? 1 : 2;
    if (lucky) {
      d.enemy.stamina = Math.max(0, d.enemy.stamina - bonus);
      _appendLog(d, t('battlesim236.log.luck_player_hit_lucky', { roll, enemy: _enemyNameSafe(d), stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    } else {
      d.enemy.stamina = Math.min(d.enemy.staminaMax, d.enemy.stamina + 1);
      _appendLog(d, t('battlesim236.log.luck_player_hit_unlucky', { roll, enemy: _enemyNameSafe(d), stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    }
    if (d.enemy.stamina <= 0) { _appendLog(d, t('battlesim236.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) })); _recordOutcome(d, 'win'); }
  } else {
    if (lucky) {
      d.player.stamina = Math.min(d.player.staminaInitial, d.player.stamina + 1);
      _appendLog(d, t('battlesim236.log.luck_hit_lucky', { roll, enemy: _enemyNameSafe(d), stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    } else {
      d.player.stamina = Math.max(0, d.player.stamina - 1);
      _appendLog(d, t('battlesim236.log.luck_hit_unlucky', { roll, enemy: _enemyNameSafe(d), stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    }
    if (d.player.stamina <= 0) {
      _appendLog(d, t('battlesim236.log.fallen', { skull: SVG_SKULL }));
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
  d.pendingLuckQueue = [];
  if (d.log.length) _appendLog(d, t('battlesim236.log.reset_sep'));
  _appendLog(d, t('battlesim236.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}

// ── Heroism Potion (sec.78) ─────────────────────────────────────────────────

function _useHeroism() {
  const d = _data();
  if (!d || _notReady(d) || d.player.heroismUsedThisFight) return;
  if (d.roundsThisBattle > 0 && d.player.stamina > 0 && d.enemy.stamina > 0) {
    showAlert(t('battlesim236.alert.heroism_midfight'));
    return;
  }
  d.player.heroismUsedThisFight = true;
  d.player.stamina = Math.min(d.player.staminaInitial, d.player.stamina + 2);
  d.player.skill += 2;
  _appendLog(d, t('battlesim236.log.heroism', { stamina: d.player.stamina, staminaMax: d.player.staminaInitial, skill: d.player.skill }));
  saveState();
  _renderAll();
}

// ── Render ────────────────────────────────────────────────────────────────

function _renderStatus() {
  const d  = _data();
  const el = document.getElementById('sim236-status');
  if (!d || !el) return;
  const notReady = _notReady(d);
  const hasEnemy = d.enemy.staminaMax > 0;
  if (notReady)                                    el.innerHTML = t('battlesim236.status.not_ready');
  else if (d.player.stamina <= 0)                   el.innerHTML = t('battlesim236.status.fallen', { skull: SVG_SKULL });
  else if (hasEnemy && d.enemy.stamina <= 0)         el.innerHTML = t('battlesim236.status.victory', { trophy: SVG_TROPHY });
  else                                               el.innerHTML = '';
  const over = notReady || d.player.stamina <= 0 || (hasEnemy && d.enemy.stamina <= 0);
  document.getElementById('sim236-round').disabled = over || !!d.pendingLuckQueue.length;
  document.getElementById('sim236-luck-yes').disabled = notReady || !d.pendingLuckQueue.length || d.player.luck <= 0;
  document.getElementById('sim236-luck-no').disabled  = notReady || !d.pendingLuckQueue.length;
  document.getElementById('sim236-heroism').disabled =
    notReady || d.player.heroismUsedThisFight ||
    (d.roundsThisBattle > 0 && d.player.stamina > 0 && d.enemy.stamina > 0);
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim236-history-summary');
  const listEl = document.getElementById('sim236-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim236.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim236.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim236.history.won') : t('battlesim236.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">STAMINA ${h.playerStamina}/${h.playerStaminaMax} · ${date}</span>
    </div>`;
  }).join('');
}

function _renderLog() {
  const d  = _data();
  const el = document.getElementById('sim236-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderInputs() {
  const d = _data();
  if (!d) return;

  document.getElementById('sim236-player-skill').value      = d.player.skill;
  document.getElementById('sim236-player-skillmax').value   = d.player.skillInitial;
  document.getElementById('sim236-player-stamina').value    = Math.min(d.player.stamina, d.player.staminaInitial);
  document.getElementById('sim236-player-staminamax').value = d.player.staminaInitial;
  document.getElementById('sim236-player-luck').value       = d.player.luck;
  document.getElementById('sim236-player-luckmax').value    = d.player.luckInitial;
  document.getElementById('sim236-player-atkmod').value     = d.player.attackModifier;

  const rollBtn = document.getElementById('sim236-roll');
  rollBtn.disabled = d.rolled;
  rollBtn.textContent = d.rolled ? t('battlesim236.btn.rolled') : t('battlesim236.btn.roll');

  document.getElementById('sim236-item-sword').checked = d.player.demonSlayingSword;
  document.getElementById('sim236-item-armour').checked = d.player.thickArmour;
  document.getElementById('sim236-item-myurr').checked = d.player.myurrFight;
  document.getElementById('sim236-heroism').disabled =
    _notReady(d) || d.player.heroismUsedThisFight ||
    (d.roundsThisBattle > 0 && d.player.stamina > 0 && d.enemy.stamina > 0);
  document.getElementById('sim236-heroism-used').textContent =
    d.player.heroismUsedThisFight ? t('battlesim236.ui.heroism_used') : '';

  document.getElementById('sim236-enemy-pick').value    = d.enemy.name;
  document.getElementById('sim236-enemy-skill').value   = d.enemy.skill;
  document.getElementById('sim236-enemy-stamina').value    = Math.min(d.enemy.stamina, d.enemy.staminaMax);
  document.getElementById('sim236-enemy-staminamax').value = d.enemy.staminaMax;

  const pendingEl = document.getElementById('sim236-luck-prompt');
  pendingEl.style.display = d.pendingLuckQueue.length ? '' : 'none';

  _renderStatus();
}

function _renderAll() {
  _renderInputs();
  _renderLog();
  _renderHistory();
}

export function renderSim236() {
  const overlay = document.getElementById('sim236-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim236(); return; }
  _renderAll();
}

function openSim236() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim236-overlay').classList.add('active');
}

function closeSim236() {
  document.getElementById('sim236-overlay')?.classList.remove('active');
}

export function setSim236Visible(visible) {
  const btn = document.getElementById('sim236-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim236();
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

export function initSim236() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim236-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim.title')}</span>
        <button id="sim236-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim236.ui.you')}</div>
            <div class="inv-edit-row bsim-life-roll-row">
              <button id="sim236-roll" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim236.btn.roll')}</button>
            </div>
            ${_numField(t('battlesim236.ui.skill'), 'sim236-player-skill')}
            ${_numField(t('battlesim236.ui.skill_initial'), 'sim236-player-skillmax')}
            ${_numField(t('battlesim236.ui.stamina'), 'sim236-player-stamina')}
            ${_numField(t('battlesim236.ui.stamina_initial'), 'sim236-player-staminamax')}
            ${_numField(t('battlesim236.ui.luck'), 'sim236-player-luck')}
            ${_numField(t('battlesim236.ui.luck_initial'), 'sim236-player-luckmax')}
            ${_numField(t('battlesim236.ui.atkmod'), 'sim236-player-atkmod')}
            <div class="inv-edit-row bsim-ae-row">
              <span id="sim236-heroism-used" class="bsim-ae-display"></span>
              <button id="sim236-heroism" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim236.btn.heroism')}</button>
            </div>
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim236.ui.enemy')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim236.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim236-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim236-enemy-pick-dropdown">
                <ul id="sim236-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim236.ui.skill'), 'sim236-enemy-skill')}
            ${_numField(t('battlesim236.ui.stamina'), 'sim236-enemy-stamina')}
            ${_numField(t('battlesim236.ui.stamina_max'), 'sim236-enemy-staminamax')}
            <div class="inv-edit-row">
              <label class="inv-edit-check-label"><input type="checkbox" id="sim236-item-sword" class="inv-edit-check"> ${t('battlesim236.ui.item_sword')}</label>
            </div>
            <div class="inv-edit-row">
              <label class="inv-edit-check-label"><input type="checkbox" id="sim236-item-armour" class="inv-edit-check"> ${t('battlesim236.ui.item_armour')}</label>
            </div>
            <div class="inv-edit-row">
              <label class="inv-edit-check-label"><input type="checkbox" id="sim236-item-myurr" class="inv-edit-check"> ${t('battlesim236.ui.item_myurr')}</label>
            </div>
          </div>
          <div id="sim236-status" class="bsim-status"></div>
          <div id="sim236-luck-prompt" class="inv-edit-row bsim-heal-row" style="display:none">
            <span class="inv-edit-label bsim-stat-label">${t('battlesim236.btn.luck_prompt')}</span>
            <button id="sim236-luck-yes" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim236.btn.luck_yes')}</button>
            <button id="sim236-luck-no" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim236.btn.luck_no')}</button>
          </div>
          <div class="inv-modal-ftr">
            <button id="sim236-round" class="inv-add-btn bsim-action-primary">${t('battlesim236.btn.round')}</button>
            <button id="sim236-reset" class="inv-add-btn">${t('battlesim236.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history">
            <summary id="sim236-history-summary">${t('battlesim236.history.summary', { n: 0 })}</summary>
            <div id="sim236-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim236-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim236-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim236);
  document.getElementById('sim236-close').addEventListener('click', closeSim236);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim236(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim236-overlay'),
    open:  openSim236,
    close: closeSim236,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim236();
  });

  document.getElementById('sim236-round').addEventListener('click', _runRound);
  document.getElementById('sim236-reset').addEventListener('click', _resetBattle);
  document.getElementById('sim236-luck-yes').addEventListener('click', _testLuck);
  document.getElementById('sim236-luck-no').addEventListener('click', _skipLuck);
  document.getElementById('sim236-heroism').addEventListener('click', _useHeroism);

  document.getElementById('sim236-roll').addEventListener('click', () => {
    const d = _data();
    if (!d || d.rolled) return;
    d.player.skillInitial   = _roll1d6() + 6;
    d.player.staminaInitial = _roll2d6() + 12;
    d.player.luckInitial    = _roll1d6() + 6;
    d.player.skill   = d.player.skillInitial;
    d.player.stamina = d.player.staminaInitial;
    d.player.luck    = d.player.luckInitial;
    d.rolled = true;
    _appendLog(d, t('battlesim236.log.rolled', { skill: d.player.skillInitial, stamina: d.player.staminaInitial, luck: d.player.luckInitial }));
    saveState();
    _renderAll();
  });

  document.getElementById('sim236-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });

  const ITEM_CHECKBOX_MAP = {
    'sim236-item-sword':  'demonSlayingSword',
    'sim236-item-armour': 'thickArmour',
    'sim236-item-myurr':  'myurrFight',
  };
  overlay.querySelectorAll('#sim236-item-sword, #sim236-item-armour, #sim236-item-myurr').forEach(cb => {
    cb.addEventListener('change', e => {
      const d = _data();
      if (!d) return;
      const key = ITEM_CHECKBOX_MAP[e.target.id];
      if (!key) return;
      d.player[key] = e.target.checked;
      saveState();
      _renderInputs();
    });
  });

  // Plain numeric steppers
  const FIELD_MAP = {
    'sim236-player-skill':      ['player', 'skill'],
    'sim236-player-skillmax':   ['player', 'skillInitial'],
    'sim236-player-stamina':    ['player', 'stamina'],
    'sim236-player-staminamax': ['player', 'staminaInitial'],
    'sim236-player-luck':       ['player', 'luck'],
    'sim236-player-luckmax':    ['player', 'luckInitial'],
    'sim236-player-atkmod':     ['player', 'attackModifier'],
    'sim236-enemy-skill':       ['enemy', 'skill'],
    'sim236-enemy-stamina':     ['enemy', 'stamina'],
    'sim236-enemy-staminamax':  ['enemy', 'staminaMax'],
  };
  function _applyField(id, val) {
    const d = _data();
    if (!d) return;
    const map = FIELD_MAP[id];
    if (!map) return;
    val = id === 'sim236-player-atkmod' ? Number(val) : Math.max(0, val);
    if (id === 'sim236-player-skill') val = Math.min(val, d.player.skillInitial);
    if (id === 'sim236-player-stamina') val = Math.min(val, d.player.staminaInitial);
    if (id === 'sim236-player-luck') val = Math.min(val, d.player.luckInitial);
    if (id === 'sim236-enemy-stamina') val = Math.min(val, d.enemy.staminaMax);
    d[map[0]][map[1]] = val;
    if (id === 'sim236-player-skillmax') d.player.skill = Math.min(d.player.skill, val);
    if (id === 'sim236-player-staminamax') d.player.stamina = Math.min(d.player.stamina, val);
    if (id === 'sim236-player-luckmax') d.player.luck = Math.min(d.player.luck, val);
    if (id === 'sim236-enemy-staminamax') d.enemy.stamina = Math.min(d.enemy.stamina, val);
    saveState();
    _renderInputs();
  }
  overlay.querySelectorAll('.inv-qty-input[id^="sim236-"]').forEach(input => {
    if (!FIELD_MAP[input.id]) return;
    const allowNegative = input.id === 'sim236-player-atkmod';
    input.addEventListener('input', () => {
      const raw = String(input.value).replace(allowNegative ? /[^0-9-]/g : /[^0-9]/g, '');
      if (raw !== input.value) input.value = raw;
      _applyField(input.id, Number(raw) || 0);
    });
  });
  overlay.querySelectorAll('.inv-qty-btn[data-id^="sim236-"]').forEach(btnEl => {
    btnEl.addEventListener('click', () => {
      const input = document.getElementById(btnEl.dataset.id);
      if (!input || !FIELD_MAP[btnEl.dataset.id]) return;
      const allowNegative = btnEl.dataset.id === 'sim236-player-atkmod';
      const next = (allowNegative ? Math.max(-99, Number(input.value) || 0) : Math.max(0, Number(input.value) || 0)) + Number(btnEl.dataset.delta);
      _applyField(btnEl.dataset.id, next);
    });
  });

  _setupEnemyAutocomplete('sim236-enemy-pick', 'sim236-enemy-pick-dropdown', enemy => {
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

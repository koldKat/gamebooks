// ── Battle Simulator (Appointment with F.E.A.R., book 213) ──────────────────
// Self-contained module. Imports from state.js, play.js, charsheet.js and util.js.
// Visibility is gated (book 213 only) by the caller in boot.js via
// setSim213Visible().
// To remove: delete this file, remove its import line and initSim213()/
// setSim213Visible() calls from boot.js, and remove the .bsim-* CSS (shared
// with every other battlesimN.js in this folder, so only remove it if all
// of them are gone).
//
// Standard Fighting Fantasy SKILL/STAMINA/LUCK core (2d6+SKILL Attack
// Strength rolls, 2-STAMINA wounds, Test Your Luck damage modifiers) -
// reused verbatim, same as every other sim here. This book has no
// Potions/Provisions system at all (not in its rules), so unlike
// battlesim201/202 there's none of that machinery.
//
// Two things unique to this book, both per explicit instruction:
//
// 1. Surrender vs. kill. The rules: an enemy reduced to exactly 0 STAMINA in
//    one blow is automatically killed (-1 Hero Point, no choice offered -
//    you never gave them the chance to yield). An enemy reduced to 1 or 2
//    STAMINA instead surrenders - the fight pauses (pendingSurrender) and
//    offers a real choice: Capture (win, no penalty) or keep attacking
//    (clears the pause, next hit that lands on 0 triggers the automatic
//    kill/-1 HP case above). Hero Points themselves are otherwise a plain
//    running counter (d.player.heroPoints) the player awards by hand for
//    narrative "+N Hero Points" text, same "apply narrative effects by
//    hand" precedent as every other sim's pre-battle one-off losses.
//
// 2. Super Powers. Four are chosen once at the start of an adventure and
//    stay fixed for that run (d.player.superPower) - not modeled as a
//    branching character-class system (no sim in this app models chargen
//    class selection), just the two with a real *combat* mechanic:
//    - Super Strength: fixes Initial SKILL to 13 at roll time instead of
//      rolling 1d6+6 for it (STAMINA/LUCK still roll normally).
//    - Energy Blast: a pre-fight-only (roundsThisBattle===0) "Attempt"
//      button, -2 STAMINA, 2d6 vs current SKILL - hit is an instant win
//      (a stun, not a kill - no Hero Point effect), miss just proceeds to
//      a normal fight having already paid the STAMINA cost.
//    Psi-Powers' only combat-relevant effect is a flat -2 STAMINA per use
//    (situational, not fight-specific) - modeled as a plain anytime-usable
//    button, same "cannot use mid-fight" guard as Energy Blast/Provisions
//    elsewhere. ETS has no described combat mechanic at all (gadgets are
//    narrative/utility) - nothing to model.
//
// Per-encounter special rules found in the roster (Radiation Dogs' d6 hit-
// effect table, the Serpent's poisonous bite, the Ice Queen's SKILL-freeze,
// Sidney Knox's mind-battle using a temporary 6-point "mental STAMINA" pool
// instead of the player's real one, three fights that force a non-combat
// story branch after a fixed round count regardless of outcome, and the
// unarmed Titanium Cyborg encounter that's unwinnable by design) are noted
// directly in that enemy's book_enemies name rather than built as bespoke
// mechanics - same "apply narrative one-offs by hand" precedent book202's
// header documents. attackModifier already covers the one fight (§437,
// -2 Attack Strength for the whole struggle) that needs an ongoing combat
// number, not just a one-off note.
//
// All state lives in pt.sim213, per-user/per-book via currentPlaythrough().

import { currentPlaythrough, saveState, apiFetch, currentBookId } from '../state.js?v=1462';
import { showAlert } from '../confirm.js?v=1462';
import { getPlayBtnRow } from '../charsheet.js?v=1462';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../util.js?v=1462';
import { t } from '../i18n.js?v=1462';

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

const SUPER_POWERS = [
  ['strength',   'battlesim213.power.strength'],
  ['psi',        'battlesim213.power.psi'],
  ['ets',        'battlesim213.power.ets'],
  ['energyblast','battlesim213.power.energyblast'],
];

const HERO_POINT_PENALTY = 1;
const SUPER_POWER_STAMINA_COST = 2;

function _data() {
  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim213) {
    pt.sim213 = {
      player: {
        skill: 0, skillInitial: 0,
        stamina: 0, staminaInitial: 0,
        luck: 0, luckInitial: 0,
        heroPoints: 0,
        superPower: 'strength',
        attackModifier: 0,
        enemyWoundDamage: 2,
        forceLossAfterRounds: 0,
      },
      enemy: { name: '', skill: 0, stamina: 0, staminaMax: 0 },
      rolled: false,
      pendingLuckQueue: [],
      pendingSurrender: false,
      roundsThisBattle: 0,
      log: [],
      history: [],
    };
  }
  const d = pt.sim213;
  if (d.rolled === undefined) d.rolled = false;
  if (!Array.isArray(d.pendingLuckQueue)) d.pendingLuckQueue = [];
  if (d.pendingSurrender === undefined) d.pendingSurrender = false;
  if (d.roundsThisBattle === undefined) d.roundsThisBattle = 0;
  if (!d.history) d.history = [];
  if (d.player.heroPoints === undefined) d.player.heroPoints = 0;
  if (d.player.superPower === undefined) d.player.superPower = 'strength';
  if (d.player.attackModifier === undefined) d.player.attackModifier = 0;
  if (d.player.enemyWoundDamage === undefined) d.player.enemyWoundDamage = 2;
  if (d.player.forceLossAfterRounds === undefined) d.player.forceLossAfterRounds = 0;
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

function _resetEncounterKnobs(d) {
  d.player.attackModifier = 0;
  d.player.enemyWoundDamage = 2;
  d.player.forceLossAfterRounds = 0;
}

// Uncapped, true lifetime total (matches every other sim's history - the
// admin dashboard aggregates battle counts app-wide from this array).
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
  if (!d || _notReady(d) || d.player.stamina <= 0 || d.enemy.stamina <= 0 || d.pendingLuckQueue.length || d.pendingSurrender) return;
  d.roundsThisBattle++;

  const woundDmg = Math.max(1, d.player.enemyWoundDamage || 2);
  const playerAS = _roll2d6() + d.player.skill + (d.player.attackModifier || 0);
  const enemyAS  = _roll2d6() + d.enemy.skill;
  _appendLog(d, t('battlesim213.log.round', { round: d.roundsThisBattle, playerAS, enemy: _enemyNameSafe(d), enemyAS }));

  if (playerAS === enemyAS) {
    _appendLog(d, t('battlesim213.log.both_avoided'));
  } else if (playerAS > enemyAS) {
    d.enemy.stamina = Math.max(0, d.enemy.stamina - 2);
    _appendLog(d, t('battlesim213.log.you_wound', { enemy: _enemyNameSafe(d), stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    if (d.enemy.stamina > 0) d.pendingLuckQueue.push({ kind: 'player-hit' });
  } else {
    d.player.stamina = Math.max(0, d.player.stamina - woundDmg);
    _appendLog(d, t('battlesim213.log.enemy_wounds', { enemy: _enemyNameSafe(d), dmg: woundDmg, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    if (d.player.stamina > 0) d.pendingLuckQueue.push({ kind: 'enemy-hit' });
  }

  _resolveRoundEnd(d);
  saveState();
  _renderAll();
}

// Shared end-of-round check (also called after a Luck test resolves the
// same round's pending hit) - surrender/kill/loss/round-limit outcomes all
// funnel through here so they're consistent regardless of whether the
// deciding hit came from a plain wound or a Luck-modified one.
function _resolveRoundEnd(d) {
  if (d.pendingLuckQueue.length) return; // wait for the Luck test to resolve first

  if (d.enemy.stamina <= 0) {
    // Reduced straight to 0 without ever pausing in the 1-2 surrender
    // window - the rules treat that as a kill, no choice was ever offered.
    _appendLog(d, t('battlesim213.log.killed_outright', { enemy: _enemyNameSafe(d), n: HERO_POINT_PENALTY }));
    d.player.heroPoints -= HERO_POINT_PENALTY;
    _appendLog(d, t('battlesim213.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
    return;
  }
  if (d.enemy.stamina > 0 && d.enemy.stamina <= 2) {
    d.pendingSurrender = true;
    _appendLog(d, t('battlesim213.log.surrenders', { enemy: _enemyNameSafe(d), stamina: d.enemy.stamina }));
    return;
  }
  if (d.player.stamina <= 0) {
    _appendLog(d, t('battlesim213.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
    return;
  }
  // === not >= - a reminder every single round after the threshold (the
  // fight is deliberately left clickable past it, informational only, see
  // header) would spam the log for as long as the player keeps rolling.
  if (d.player.forceLossAfterRounds > 0 && d.roundsThisBattle === d.player.forceLossAfterRounds) {
    _appendLog(d, t('battlesim213.log.round_limit'));
  }
}

function _captureEnemy() {
  const d = _data();
  if (!d || !d.pendingSurrender) return;
  d.pendingSurrender = false;
  // Must actually zero this out, not just leave it at the 1-2 it surrendered
  // at - every "is this fight over" check (the Round button's disabled
  // state, the victory banner) looks for enemy.stamina <= 0. Left at 1-2,
  // none of those checks would fire and Round would stay clickable against
  // an enemy already supposedly in custody.
  d.enemy.stamina = 0;
  _appendLog(d, t('battlesim213.log.captured', { enemy: _enemyNameSafe(d) }));
  _appendLog(d, t('battlesim213.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
  _recordOutcome(d, 'win');
  saveState();
  _renderAll();
}

function _finishEnemy() {
  const d = _data();
  if (!d || !d.pendingSurrender) return;
  d.pendingSurrender = false;
  d.enemy.stamina = 0;
  d.player.heroPoints -= HERO_POINT_PENALTY;
  _appendLog(d, t('battlesim213.log.finished_off', { enemy: _enemyNameSafe(d), n: HERO_POINT_PENALTY }));
  _appendLog(d, t('battlesim213.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
  _recordOutcome(d, 'win');
  saveState();
  _renderAll();
}

function _continueAttacking() {
  const d = _data();
  if (!d || !d.pendingSurrender) return;
  d.pendingSurrender = false;
  _appendLog(d, t('battlesim213.log.kept_attacking'));
  saveState();
  _renderAll();
}

// Test Your Luck after a hit lands: costs 1 LUCK regardless of outcome.
// Same table every sim in this app uses.
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
      _appendLog(d, t('battlesim213.log.luck_player_hit_lucky', { roll, enemy: _enemyNameSafe(d), stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    } else {
      d.enemy.stamina = Math.min(d.enemy.staminaMax, d.enemy.stamina + 1);
      _appendLog(d, t('battlesim213.log.luck_player_hit_unlucky', { roll, enemy: _enemyNameSafe(d), stamina: d.enemy.stamina, staminaMax: d.enemy.staminaMax }));
    }
  } else {
    if (lucky) {
      d.player.stamina = Math.min(d.player.staminaInitial, d.player.stamina + 1);
      _appendLog(d, t('battlesim213.log.luck_enemy_hit_lucky', { roll, enemy: _enemyNameSafe(d), stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    } else {
      d.player.stamina = Math.max(0, d.player.stamina - 1);
      _appendLog(d, t('battlesim213.log.luck_enemy_hit_unlucky', { roll, enemy: _enemyNameSafe(d), stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
    }
  }
  _resolveRoundEnd(d);
  saveState();
  _renderAll();
}

function _skipLuck() {
  const d = _data();
  if (!d || !d.pendingLuckQueue.length) return;
  d.pendingLuckQueue.shift();
  _resolveRoundEnd(d);
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
  d.pendingSurrender = false;
  if (d.log.length) _appendLog(d, t('battlesim213.log.reset_sep'));
  _appendLog(d, t('battlesim213.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}

// ── Super Powers ─────────────────────────────────────────────────────────────

function _usePsiPower() {
  const d = _data();
  if (!d || _notReady(d)) return;
  if (d.roundsThisBattle > 0 && d.player.stamina > 0 && d.enemy.stamina > 0) {
    showAlert(t('battlesim213.alert.psi_midfight'));
    return;
  }
  d.player.stamina = Math.max(0, d.player.stamina - SUPER_POWER_STAMINA_COST);
  _appendLog(d, t('battlesim213.log.psi_use', { n: SUPER_POWER_STAMINA_COST, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
  saveState();
  _renderAll();
}

function _attemptEnergyBlast() {
  const d = _data();
  if (!d || _notReady(d) || d.roundsThisBattle > 0) return;
  if (!d.enemy.staminaMax) { showAlert(t('battlesim213.alert.pick_enemy')); return; }
  d.player.stamina = Math.max(0, d.player.stamina - SUPER_POWER_STAMINA_COST);
  const roll = _roll2d6();
  const hit  = roll <= d.player.skill;
  _appendLog(d, t('battlesim213.log.eblast_roll', { n: SUPER_POWER_STAMINA_COST, roll, skill: d.player.skill, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
  if (hit) {
    d.enemy.stamina = 0;
    _appendLog(d, t('battlesim213.log.eblast_hit', { enemy: _enemyNameSafe(d) }));
    _appendLog(d, t('battlesim213.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
  } else {
    _appendLog(d, t('battlesim213.log.eblast_miss'));
  }
  saveState();
  _renderAll();
}

// ── Render ────────────────────────────────────────────────────────────────

function _renderStatus() {
  const d  = _data();
  const el = document.getElementById('sim213-status');
  if (!d || !el) return;
  const notReady = _notReady(d);
  const hasEnemy = d.enemy.staminaMax > 0;
  if (notReady)                              el.innerHTML = t('battlesim213.status.not_ready');
  else if (d.player.stamina <= 0)            el.innerHTML = t('battlesim213.status.fallen', { skull: SVG_SKULL });
  else if (hasEnemy && d.enemy.stamina <= 0 && !d.pendingSurrender) el.innerHTML = t('battlesim213.status.victory', { trophy: SVG_TROPHY });
  else                                        el.innerHTML = '';
  const over = notReady || d.player.stamina <= 0 || (hasEnemy && d.enemy.stamina <= 0 && !d.pendingSurrender);
  document.getElementById('sim213-round').disabled = over || !!d.pendingLuckQueue.length || d.pendingSurrender;
  document.getElementById('sim213-luck-yes').disabled = notReady || !d.pendingLuckQueue.length || d.player.luck <= 0;
  document.getElementById('sim213-luck-no').disabled  = notReady || !d.pendingLuckQueue.length;
  document.getElementById('sim213-psi-use').disabled =
    notReady || (d.roundsThisBattle > 0 && d.player.stamina > 0 && d.enemy.stamina > 0);
  document.getElementById('sim213-eblast-use').disabled =
    notReady || d.roundsThisBattle > 0 || !hasEnemy;
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim213-history-summary');
  const listEl = document.getElementById('sim213-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim213.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim213.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim213.history.won') : t('battlesim213.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">STAMINA ${h.playerStamina}/${h.playerStaminaMax} · ${date}</span>
    </div>`;
  }).join('');
}

function _renderLog() {
  const d  = _data();
  const el = document.getElementById('sim213-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderInputs() {
  const d = _data();
  if (!d) return;

  document.getElementById('sim213-player-skill').value      = d.player.skill;
  document.getElementById('sim213-player-skillmax').value   = d.player.skillInitial;
  document.getElementById('sim213-player-stamina').value    = Math.min(d.player.stamina, d.player.staminaInitial);
  document.getElementById('sim213-player-staminamax').value = d.player.staminaInitial;
  document.getElementById('sim213-player-luck').value       = d.player.luck;
  document.getElementById('sim213-player-luckmax').value    = d.player.luckInitial;
  document.getElementById('sim213-player-atkmod').value     = d.player.attackModifier;
  document.getElementById('sim213-player-hero').value       = d.player.heroPoints;

  const rollBtn = document.getElementById('sim213-roll');
  rollBtn.disabled = d.rolled;
  rollBtn.textContent = d.rolled ? t('battlesim213.btn.rolled') : t('battlesim213.btn.roll');

  const powerSel = document.getElementById('sim213-power');
  powerSel.value = d.player.superPower;
  powerSel.disabled = d.rolled;
  document.getElementById('sim213-psi-row').style.display    = d.player.superPower === 'psi'         ? '' : 'none';
  document.getElementById('sim213-eblast-row').style.display = d.player.superPower === 'energyblast'  ? '' : 'none';

  document.getElementById('sim213-enemy-pick').value       = d.enemy.name;
  document.getElementById('sim213-enemy-skill').value      = d.enemy.skill;
  document.getElementById('sim213-enemy-stamina').value    = Math.min(d.enemy.stamina, d.enemy.staminaMax);
  document.getElementById('sim213-enemy-staminamax').value = d.enemy.staminaMax;
  document.getElementById('sim213-enemy-wounddmg').value   = d.player.enemyWoundDamage;
  document.getElementById('sim213-enemy-roundlimit').value = d.player.forceLossAfterRounds;

  const pendingLuckEl = document.getElementById('sim213-luck-prompt');
  pendingLuckEl.style.display = d.pendingLuckQueue.length ? '' : 'none';
  const pendingSurrEl = document.getElementById('sim213-surrender-prompt');
  pendingSurrEl.style.display = d.pendingSurrender ? '' : 'none';

  _renderStatus();
}

function _renderAll() {
  _renderInputs();
  _renderLog();
  _renderHistory();
}

export function renderSim213() {
  const overlay = document.getElementById('sim213-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim213(); return; }
  _renderAll();
}

function openSim213() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim213-overlay').classList.add('active');
}

function closeSim213() {
  document.getElementById('sim213-overlay')?.classList.remove('active');
}

export function setSim213Visible(visible) {
  const btn = document.getElementById('sim213-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim213();
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

export function initSim213() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim213-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim.title')}</span>
        <button id="sim213-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim213.ui.you')}</div>
            <div class="inv-edit-row bsim-life-roll-row">
              <button id="sim213-roll" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim213.btn.roll')}</button>
            </div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim213.ui.super_power')}</span>
              <select id="sim213-power" class="inv-edit-input bsim-select">
                ${SUPER_POWERS.map(p => `<option value="${p[0]}">${escapeHtml(t(p[1]))}</option>`).join('')}
              </select>
            </div>
            ${_numField(t('battlesim213.ui.skill'), 'sim213-player-skill')}
            ${_numField(t('battlesim213.ui.skill_initial'), 'sim213-player-skillmax')}
            ${_numField(t('battlesim213.ui.stamina'), 'sim213-player-stamina')}
            ${_numField(t('battlesim213.ui.stamina_initial'), 'sim213-player-staminamax')}
            ${_numField(t('battlesim213.ui.luck'), 'sim213-player-luck')}
            ${_numField(t('battlesim213.ui.luck_initial'), 'sim213-player-luckmax')}
            ${_numField(t('battlesim213.ui.atkmod'), 'sim213-player-atkmod')}
            ${_numField(t('battlesim213.ui.hero_points'), 'sim213-player-hero')}
            <div id="sim213-psi-row" class="inv-edit-row bsim-ae-row" style="display:none">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim213.ui.psi_power')}</span>
              <button id="sim213-psi-use" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim213.btn.psi_use', { n: SUPER_POWER_STAMINA_COST, stamina: t('battlesim213.ui.stamina') })}</button>
            </div>
            <div id="sim213-eblast-row" class="inv-edit-row bsim-ae-row" style="display:none">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim213.ui.energy_blast')}</span>
              <button id="sim213-eblast-use" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim213.btn.eblast_attempt', { n: SUPER_POWER_STAMINA_COST, stamina: t('battlesim213.ui.stamina') })}</button>
            </div>
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim213.ui.enemy')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim213.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim213-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim213-enemy-pick-dropdown">
                <ul id="sim213-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim213.ui.skill'), 'sim213-enemy-skill')}
            ${_numField(t('battlesim213.ui.stamina'), 'sim213-enemy-stamina')}
            ${_numField(t('battlesim213.ui.stamina_max'), 'sim213-enemy-staminamax')}
            ${_numField(t('battlesim213.ui.wound_dmg'), 'sim213-enemy-wounddmg')}
            ${_numField(t('battlesim213.ui.round_limit'), 'sim213-enemy-roundlimit')}
          </div>
          <div id="sim213-status" class="bsim-status"></div>
          <div id="sim213-luck-prompt" class="inv-edit-row bsim-heal-row" style="display:none">
            <span class="inv-edit-label bsim-stat-label">${t('battlesim213.btn.luck_prompt')}</span>
            <button id="sim213-luck-yes" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim213.btn.luck_yes')}</button>
            <button id="sim213-luck-no" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim213.btn.luck_no')}</button>
          </div>
          <div id="sim213-surrender-prompt" class="inv-edit-row bsim-heal-row" style="display:none">
            <span class="inv-edit-label bsim-stat-label">${t('battlesim213.ui.enemy_surrenders')}</span>
            <button id="sim213-capture" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim213.btn.capture')}</button>
            <button id="sim213-finish" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim213.btn.finish', { n: HERO_POINT_PENALTY })}</button>
            <button id="sim213-continue" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim213.btn.continue')}</button>
          </div>
          <div class="inv-modal-ftr">
            <button id="sim213-round" class="inv-add-btn bsim-action-primary">${t('battlesim213.btn.round')}</button>
            <button id="sim213-reset" class="inv-add-btn">${t('battlesim213.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history">
            <summary id="sim213-history-summary">${t('battlesim213.history.summary', { n: 0 })}</summary>
            <div id="sim213-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim213-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim213-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim213);
  document.getElementById('sim213-close').addEventListener('click', closeSim213);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim213(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim213-overlay'),
    open:  openSim213,
    close: closeSim213,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim213();
  });

  document.getElementById('sim213-round').addEventListener('click', _runRound);
  document.getElementById('sim213-reset').addEventListener('click', _resetBattle);
  document.getElementById('sim213-luck-yes').addEventListener('click', _testLuck);
  document.getElementById('sim213-luck-no').addEventListener('click', _skipLuck);
  document.getElementById('sim213-capture').addEventListener('click', _captureEnemy);
  document.getElementById('sim213-finish').addEventListener('click', _finishEnemy);
  document.getElementById('sim213-continue').addEventListener('click', _continueAttacking);
  document.getElementById('sim213-psi-use').addEventListener('click', _usePsiPower);
  document.getElementById('sim213-eblast-use').addEventListener('click', _attemptEnergyBlast);

  document.getElementById('sim213-roll').addEventListener('click', () => {
    const d = _data();
    if (!d || d.rolled) return;
    d.player.skillInitial   = d.player.superPower === 'strength' ? 13 : (_roll1d6() + 6);
    d.player.staminaInitial = _roll2d6() + 12;
    d.player.luckInitial    = _roll1d6() + 6;
    d.player.skill   = d.player.skillInitial;
    d.player.stamina = d.player.staminaInitial;
    d.player.luck    = d.player.luckInitial;
    d.rolled = true;
    _appendLog(d, t('battlesim213.log.rolled', { skill: d.player.skillInitial, stamina: d.player.staminaInitial, luck: d.player.luckInitial }));
    saveState();
    _renderAll();
  });

  document.getElementById('sim213-power').addEventListener('change', e => {
    const d = _data();
    if (!d || d.rolled) return;
    d.player.superPower = e.target.value;
    saveState();
    _renderInputs();
  });

  document.getElementById('sim213-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });

  // Plain numeric steppers
  const FIELD_MAP = {
    'sim213-player-skill':      ['player', 'skill'],
    'sim213-player-skillmax':   ['player', 'skillInitial'],
    'sim213-player-stamina':    ['player', 'stamina'],
    'sim213-player-staminamax': ['player', 'staminaInitial'],
    'sim213-player-luck':       ['player', 'luck'],
    'sim213-player-luckmax':    ['player', 'luckInitial'],
    'sim213-player-atkmod':     ['player', 'attackModifier'],
    'sim213-player-hero':       ['player', 'heroPoints'],
    'sim213-enemy-skill':       ['enemy', 'skill'],
    'sim213-enemy-stamina':     ['enemy', 'stamina'],
    'sim213-enemy-staminamax':  ['enemy', 'staminaMax'],
    'sim213-enemy-wounddmg':    ['player', 'enemyWoundDamage'],
    'sim213-enemy-roundlimit':  ['player', 'forceLossAfterRounds'],
  };
  // Attack modifier and Hero Points are the two fields allowed to go
  // negative (a fight-long Attack Strength penalty, and Hero Points lost
  // for a kill, both need to go below 0) - every other field stays
  // clamped to 0 or above.
  const NEGATIVE_OK = new Set(['sim213-player-atkmod', 'sim213-player-hero']);
  function _applyField(id, val) {
    const d = _data();
    if (!d) return;
    const map = FIELD_MAP[id];
    if (!map) return;
    val = NEGATIVE_OK.has(id) ? Number(val) : Math.max(0, val);
    if (id === 'sim213-player-skill') val = Math.min(val, d.player.skillInitial);
    if (id === 'sim213-player-stamina') val = Math.min(val, d.player.staminaInitial);
    if (id === 'sim213-player-luck') val = Math.min(val, d.player.luckInitial);
    if (id === 'sim213-enemy-stamina') val = Math.min(val, d.enemy.staminaMax);
    d[map[0]][map[1]] = val;
    if (id === 'sim213-player-skillmax') d.player.skill = Math.min(d.player.skill, val);
    if (id === 'sim213-player-staminamax') d.player.stamina = Math.min(d.player.stamina, val);
    if (id === 'sim213-player-luckmax') d.player.luck = Math.min(d.player.luck, val);
    if (id === 'sim213-enemy-staminamax') d.enemy.stamina = Math.min(d.enemy.stamina, val);
    saveState();
    _renderInputs();
  }
  overlay.querySelectorAll('.inv-qty-input[id^="sim213-"]').forEach(input => {
    if (!FIELD_MAP[input.id]) return;
    const allowNegative = NEGATIVE_OK.has(input.id);
    input.addEventListener('input', () => {
      const raw = String(input.value).replace(allowNegative ? /[^0-9-]/g : /[^0-9]/g, '');
      if (raw !== input.value) input.value = raw;
      _applyField(input.id, Number(raw) || 0);
    });
  });
  overlay.querySelectorAll('.inv-qty-btn[data-id^="sim213-"]').forEach(btnEl => {
    btnEl.addEventListener('click', () => {
      const input = document.getElementById(btnEl.dataset.id);
      if (!input || !FIELD_MAP[btnEl.dataset.id]) return;
      const allowNegative = NEGATIVE_OK.has(btnEl.dataset.id);
      const next = (allowNegative ? Math.max(-99, Number(input.value) || 0) : Math.max(0, Number(input.value) || 0)) + Number(btnEl.dataset.delta);
      _applyField(btnEl.dataset.id, next);
    });
  });

  _setupEnemyAutocomplete('sim213-enemy-pick', 'sim213-enemy-pick-dropdown', enemy => {
    const d = _data();
    if (!d) return;
    d.enemy.name = enemy.name;
    if (enemy.attack != null) d.enemy.skill = enemy.attack;
    if (enemy.hp != null)     { d.enemy.stamina = enemy.hp; d.enemy.staminaMax = enemy.hp; }
    d.roundsThisBattle = 0;
    d.pendingLuckQueue = [];
    d.pendingSurrender = false;
    _resetEncounterKnobs(d);
    saveState();
    _renderAll();
  });
}

// ── Battle Simulator (Властелин! / The Overlord, book 376, Way of the Tiger 3) ──
// Self-contained module. Imports from state.js, charsheet.js and util.js.
// Visibility is gated (book 376 only) by the caller in boot.js via
// setSim376Visible().
// To remove: delete this file, remove its import line and initSim376()/
// setSim376Visible() calls from boot.js, remove 'sim376' from
// SIM_HISTORY_KEYS in server/db/xp.js, and remove the .bsim-* CSS (shared
// with the other battlesim*.js files, so only remove it if all are gone).
//
// Same series-wide combat system as books 370/375 (three independent
// technique scores - удар с ръка/Hand, удар с крак/Kick, хвърляне/Throw,
// plus Shuriken-jutsu as a separate ranged option with its own 5-count
// resource). This book (book 3) also prints no rules recap of its own -
// opens directly into story at §1, same as book 375 - confirmed identical
// mechanic from this book's own ~20 in-story stat blocks ("[NAME] Защита
// срещу [техника] «[име]»: N Издръжливост: N Щети: N зар[+N]"), matching
// books 370/375's format exactly.
//
// Full enemy roster (10 rows, read from all 20 stat-block-bearing sections
// of 420 total):
//   - Върховен жрец на сенките (§6/18/30, three branches of one fight):
//     End 15, Def Hand(«ухапване на кобра»)=7, Kick(«двузъба мълния»)=7,
//     Throw(«тигрови зъби»)=7, dmg 1d+1.
//   - Първи/Втори телохранител (§50/66/114, twin bodyguards fought
//     simultaneously, same shape as book 375's Battle Dogs - if both are
//     alive the player's Defense drops to 6 and only one enemy attack can
//     be blocked per round; if only one remains, Defense rises to 8):
//     First - End 9, Def Hand=6/Kick=7/Throw=5, dmg 1d+2.
//     Second - End 8, Def Hand=7/Kick=6/Throw=6, dmg 1d+2.
//   - Нинджа страж (§52/64/76, three branches of one fight): End 13,
//     Def Hand(«ухапване на кобра»)=8, Kick(«крилат кон»)=8,
//     Throw(«драконова опашка»)=7, dmg 1d+1.
//   - Жрец на Немезида (§104/116/128): End 11, Def Hand(«тигрова лапа»)=8,
//     Kick(«тигров скок»)=7, dmg 1d+1. Throw is NOT a normal attack option
//     against this enemy - §128 is a scripted magical interrupt (the throw
//     attempt always fails, costing a flat 2 Издръжливост, no roll of any
//     kind) rather than a Defense-gated hit/miss. Left at Def Throw=0
//     (unused field, matching how other sims leave inapplicable technique
//     fields at their default) with this quirk documented here instead of
//     modeled numerically.
//   - Нинджа с кусаригама (§268, one Kick branch only): End 14,
//     Def Kick(«двузъба мълния»)=8, dmg 1d+1. The Throw option («тигрови
//     зъби», §280) is a scripted instant win with no roll at all (the enemy
//     dies outright from the throw), not a normal Defense-gated attack -
//     same reasoning as the Nemesis Priest's Throw quirk above, left
//     unmodeled rather than forced into the roll-based shape.
//   - Рогат циклоп (§250/262, →§298): End 19, Def Kick(«тигров скок»)=7,
//     Hand(«железен юмрук»)=6, dmg 2 dice.
//   - Рогат циклоп (втора среща) (§322/334, →§70 - same displayed name,
//     a second distinct encounter later in the story with a different
//     damage formula and a different-named Kick move, so kept as its own
//     book_enemies row rather than merged): End 19, Def Kick(«двузъба
//     мълния»)=7, Hand(«железен юмрук»)=6, dmg 1d+3.
//   - Дяволско чудовище (§314/324/338, three branches of one fight): End 14,
//     Def Kick(«двузъба мълния»)=8, Throw(«водовъртеж»)=6,
//     Hand(саблен удар «тигрова лапа»)=7, dmg 1d+3.
//   - Оживял скелет (§354, one Kick branch only, rules text says "Повтори
//     горната битка" - repeat the battle above - so no other technique is
//     ever offered): End 10, Def Kick(«крилат кон»)=6, dmg 1d+1.
//
// No Inner-Force/Fate/Block-mechanic differences found from books 370/375 -
// the combat math implemented below is unchanged from those two sims.
//
// book_enemies column reuse, same convention as books 370/375: hp =
// Издръжливост; attack = a representative starting Defense value
// (autocomplete-fill default only, this book's enemies are fought via
// different named techniques on different branches, each with its own
// Defense - every Defense field must still be re-entered per encounter from
// the section text); pb/defense = the enemy's damage dice count / flat bonus.
//
// All state lives in pt.sim376, per-user/per-book via currentPlaythrough().

import { currentPlaythrough, saveState, apiFetch, currentBookId } from '../state.js';
import { showAlert } from '../confirm.js';
import { getPlayBtnRow } from '../charsheet.js';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../util.js';
import { t } from '../i18n.js';

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

const TECHNIQUES = ['hand', 'kick', 'throw', 'shuriken'];
const DEF_FIELD  = { hand: 'defHand', kick: 'defKick', throw: 'defThrow', shuriken: 'defShuriken' };

function _emptyEnemy() {
  return { name: '', endurance: 0, enduranceMax: 0, dmgDice: 1, dmgBonus: 0, defHand: 0, defKick: 0, defThrow: 0, defShuriken: 0 };
}

function _data() {
  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim376) {
    pt.sim376 = {
      player: {
        endurance: 20, enduranceInitial: 20,
        innerForce: 5, innerForceInitial: 5,
        hand: 0, kick: 0, throw: 0,
        shurikens: 5,
        defense: 0,
        blockPenaltyPending: false,
      },
      enemy: _emptyEnemy(),
      technique: 'hand',
      useInnerForce: false,
      pendingEnemyHit: null,
      pendingThrowFollowup: false,
      roundsThisBattle: 0,
      log: [],
      history: [],
    };
  }
  const d = pt.sim376;
  const p = d.player;
  if (p.endurance === undefined) p.endurance = 20;
  if (p.enduranceInitial === undefined) p.enduranceInitial = 20;
  if (p.innerForce === undefined) p.innerForce = 5;
  if (p.innerForceInitial === undefined) p.innerForceInitial = 5;
  if (p.hand === undefined) p.hand = 0;
  if (p.kick === undefined) p.kick = 0;
  if (p.throw === undefined) p.throw = 0;
  if (p.shurikens === undefined) p.shurikens = 5;
  if (p.defense === undefined) p.defense = 0;
  if (p.blockPenaltyPending === undefined) p.blockPenaltyPending = false;
  if (!d.enemy) d.enemy = _emptyEnemy();
  const e = d.enemy;
  if (e.dmgDice === undefined) e.dmgDice = 1;
  if (e.dmgBonus === undefined) e.dmgBonus = 0;
  if (e.defHand === undefined) e.defHand = 0;
  if (e.defKick === undefined) e.defKick = 0;
  if (e.defThrow === undefined) e.defThrow = 0;
  if (e.defShuriken === undefined) e.defShuriken = 0;
  if (!TECHNIQUES.includes(d.technique)) d.technique = 'hand';
  if (d.useInnerForce === undefined) d.useInnerForce = false;
  if (d.pendingEnemyHit === undefined) d.pendingEnemyHit = null;
  if (d.pendingThrowFollowup === undefined) d.pendingThrowFollowup = false;
  if (d.roundsThisBattle === undefined) d.roundsThisBattle = 0;
  if (!d.log) d.log = [];
  if (!d.history) d.history = [];
  return d;
}

function _roll2d6() { return 2 + Math.floor(Math.random() * 6) + Math.floor(Math.random() * 6); }
function _roll1d6() { return 1 + Math.floor(Math.random() * 6); }
function _rollNd6(n) { let s = 0; for (let i = 0; i < n; i++) s += _roll1d6(); return s; }

function _appendLog(d, line) {
  d.log.push(line);
  if (d.log.length > 200) d.log.shift();
}

function _enemyName(d) { return d.enemy.name.trim() || t('battlesim.default_enemy'); }
function _enemyNameSafe(d) { return escapeHtml(_enemyName(d)); }
function _techLabel(tech) { return t(`battlesim376.ui.tech_${tech}`); }

function _busy(d) { return !!d.pendingEnemyHit || !!d.pendingThrowFollowup; }
function _battleOver(d) { return d.player.endurance <= 0 || (d.enemy.enduranceMax > 0 && d.enemy.endurance <= 0); }

function _recordOutcome(d, outcome) {
  d.history.push({
    enemy: _enemyName(d), outcome,
    playerEndurance: d.player.endurance, playerEnduranceMax: d.player.enduranceInitial,
    ts: Date.now(),
  });
}

// ── Combat ───────────────────────────────────────────────────────────────────

function _consumeBlockPenalty(d, tech) {
  if (!d.player.blockPenaltyPending) return 0;
  d.player.blockPenaltyPending = false;
  return tech === 'shuriken' ? 0 : -2;
}

function _enemyCounter(d) {
  const enemyRoll = _roll2d6();
  if (enemyRoll > d.player.defense) {
    const dmg = _rollNd6(Math.max(1, d.enemy.dmgDice)) + (d.enemy.dmgBonus || 0);
    d.pendingEnemyHit = { dmg };
    _appendLog(d, t('battlesim376.log.enemy_hits_pending', { enemy: _enemyNameSafe(d), roll: enemyRoll, defense: d.player.defense, dmg }));
  } else {
    _appendLog(d, t('battlesim376.log.enemy_misses', { enemy: _enemyNameSafe(d), roll: enemyRoll, defense: d.player.defense }));
  }
}

function _applyEnemyDefeat(d) {
  if (d.enemy.enduranceMax > 0 && d.enemy.endurance <= 0) {
    _appendLog(d, t('battlesim376.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
    return true;
  }
  return false;
}

function _applyPlayerFall(d) {
  if (d.player.endurance <= 0) {
    _appendLog(d, t('battlesim376.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
    return true;
  }
  return false;
}

function _attack() {
  const d = _data();
  if (!d || _busy(d) || _battleOver(d)) return;
  const tech = d.technique;
  d.roundsThisBattle++;

  const useIF = d.useInnerForce && d.player.innerForce > 0;
  if (useIF) d.player.innerForce = Math.max(0, d.player.innerForce - 1);
  d.useInnerForce = false;

  const penalty = _consumeBlockPenalty(d, tech);
  const score = tech === 'shuriken' ? 0 : (d.player[tech] || 0) + penalty;
  const defense = d.enemy[DEF_FIELD[tech]] || 0;
  const raw = _roll2d6();
  const total = raw + score;
  const hit = total > defense;

  _appendLog(d, t('battlesim376.log.attack', { tech: _techLabel(tech), enemy: _enemyNameSafe(d), raw, score, total, defense }));

  if (tech === 'shuriken') d.player.shurikens = Math.max(0, d.player.shurikens - 1);

  if (!hit) {
    _appendLog(d, t('battlesim376.log.miss', { tech: _techLabel(tech) }));
    _enemyCounter(d);
    saveState();
    _renderAll();
    return;
  }

  if (tech === 'throw') {
    _appendLog(d, t('battlesim376.log.throw_lands'));
    d.pendingThrowFollowup = true;
    saveState();
    _renderAll();
    return;
  }

  let dmg = raw + _roll1d6();
  if (tech === 'kick') dmg += 2;
  if (useIF) dmg *= 2;
  d.enemy.endurance = Math.max(0, d.enemy.endurance - dmg);
  _appendLog(d, t('battlesim376.log.you_hit', { tech: _techLabel(tech), enemy: _enemyNameSafe(d), n: dmg, endurance: d.enemy.endurance, enduranceMax: d.enemy.enduranceMax, innerForce: useIF ? t('battlesim376.log.inner_force_tag') : '' }));

  if (!_applyEnemyDefeat(d)) _enemyCounter(d);
  saveState();
  _renderAll();
}

function _throwFollowup(tech) {
  const d = _data();
  if (!d || !d.pendingThrowFollowup || tech === 'throw' || tech === 'shuriken') return;
  d.pendingThrowFollowup = false;

  const penalty = _consumeBlockPenalty(d, tech);
  const score = (d.player[tech] || 0) + penalty;
  const defense = d.enemy[DEF_FIELD[tech]] || 0;
  const raw = _roll2d6();
  const total = raw + score;
  const hit = total > defense;

  _appendLog(d, t('battlesim376.log.followup_attack', { tech: _techLabel(tech), enemy: _enemyNameSafe(d), raw, score, total, defense }));

  if (!hit) {
    _appendLog(d, t('battlesim376.log.followup_miss', { tech: _techLabel(tech) }));
    saveState();
    _renderAll();
    return;
  }

  let dmg = raw + _roll1d6() + 2;
  if (tech === 'kick') dmg += 2;
  d.enemy.endurance = Math.max(0, d.enemy.endurance - dmg);
  _appendLog(d, t('battlesim376.log.you_hit', { tech: _techLabel(tech), enemy: _enemyNameSafe(d), n: dmg, endurance: d.enemy.endurance, enduranceMax: d.enemy.enduranceMax, innerForce: '' }));

  if (!_applyEnemyDefeat(d)) _enemyCounter(d);
  saveState();
  _renderAll();
}

function _block() {
  const d = _data();
  if (!d || !d.pendingEnemyHit) return;
  const { dmg } = d.pendingEnemyHit;
  const roll = _roll2d6();
  const blocked = roll < d.player.defense;
  d.pendingEnemyHit = null;
  d.player.blockPenaltyPending = true;
  if (blocked) {
    _appendLog(d, t('battlesim376.log.block_success', { roll, defense: d.player.defense }));
  } else {
    d.player.endurance = Math.max(0, d.player.endurance - dmg);
    _appendLog(d, t('battlesim376.log.block_fail', { roll, defense: d.player.defense, n: dmg, endurance: d.player.endurance, enduranceMax: d.player.enduranceInitial }));
  }
  _applyPlayerFall(d);
  saveState();
  _renderAll();
}

function _takeHit() {
  const d = _data();
  if (!d || !d.pendingEnemyHit) return;
  const { dmg } = d.pendingEnemyHit;
  d.pendingEnemyHit = null;
  d.player.endurance = Math.max(0, d.player.endurance - dmg);
  _appendLog(d, t('battlesim376.log.take_hit', { n: dmg, endurance: d.player.endurance, enduranceMax: d.player.enduranceInitial }));
  _applyPlayerFall(d);
  saveState();
  _renderAll();
}

function _resetBattle() {
  const d = _data();
  if (!d) return;
  d.enemy.endurance = d.enemy.enduranceMax;
  d.player.endurance = d.player.enduranceInitial;
  d.roundsThisBattle = 0;
  d.pendingEnemyHit = null;
  d.pendingThrowFollowup = false;
  d.player.blockPenaltyPending = false;
  if (d.log.length) _appendLog(d, t('battlesim376.log.reset_sep'));
  _appendLog(d, t('battlesim376.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
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

function _setupAutocomplete(inputId, dropdownId, onSelect) {
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
      `<li role="option" id="${dropdownId}-opt-${i}" data-idx="${i}">${escapeHtml(e.name)}<span class="ac-sub">${t('battlesim376.ui.endurance')}:${e.hp ?? '?'}</span></li>`
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

// ── Render ───────────────────────────────────────────────────────────────────

function _setVal(id, v) { const el = document.getElementById(id); if (el) el.value = v; }

function _renderInputs(skipEnemyPick) {
  const d = _data();
  if (!d) return;
  const p = d.player, e = d.enemy;

  _setVal('sim376-player-endurance', p.endurance);
  _setVal('sim376-player-endurancemax', p.enduranceInitial);
  _setVal('sim376-player-innerforce', p.innerForce);
  _setVal('sim376-player-innerforcemax', p.innerForceInitial);
  _setVal('sim376-player-hand', p.hand);
  _setVal('sim376-player-kick', p.kick);
  _setVal('sim376-player-throw', p.throw);
  _setVal('sim376-player-shurikens', p.shurikens);
  _setVal('sim376-player-defense', p.defense);

  if (!skipEnemyPick) _setVal('sim376-enemy-pick', e.name);
  _setVal('sim376-enemy-endurance', e.endurance);
  _setVal('sim376-enemy-endurancemax', e.enduranceMax);
  _setVal('sim376-enemy-dmgdice', e.dmgDice);
  _setVal('sim376-enemy-dmgbonus', e.dmgBonus);
  _setVal('sim376-enemy-defhand', e.defHand);
  _setVal('sim376-enemy-defkick', e.defKick);
  _setVal('sim376-enemy-defthrow', e.defThrow);
  _setVal('sim376-enemy-defshuriken', e.defShuriken);

  const techSel = document.getElementById('sim376-technique');
  if (techSel) techSel.value = d.technique;
  const ifCheck = document.getElementById('sim376-innerforce-use');
  if (ifCheck) ifCheck.checked = d.useInnerForce;

  const busy = _busy(d);
  const over = _battleOver(d);
  document.getElementById('sim376-attack').disabled = busy || over;
  document.getElementById('sim376-technique').disabled = busy || over;
  document.getElementById('sim376-innerforce-use').disabled = busy || over || p.innerForce <= 0;

  const hitPrompt = document.getElementById('sim376-hit-prompt');
  hitPrompt.style.display = d.pendingEnemyHit ? '' : 'none';
  if (d.pendingEnemyHit) {
    document.getElementById('sim376-hit-prompt-text').textContent = t('battlesim376.ui.hit_prompt', { n: d.pendingEnemyHit.dmg });
  }

  const followupPrompt = document.getElementById('sim376-followup-prompt');
  followupPrompt.style.display = d.pendingThrowFollowup ? '' : 'none';

  const status = document.getElementById('sim376-status');
  if (p.endurance <= 0) status.innerHTML = t('battlesim376.status.fallen', { skull: SVG_SKULL });
  else if (e.enduranceMax > 0 && e.endurance <= 0) status.innerHTML = t('battlesim376.status.victory', { trophy: SVG_TROPHY });
  else status.innerHTML = '';

  const penaltyNote = document.getElementById('sim376-penalty-note');
  penaltyNote.style.display = p.blockPenaltyPending ? '' : 'none';
}

function _renderLog() {
  const d = _data();
  const el = document.getElementById('sim376-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim376-history-summary');
  const listEl = document.getElementById('sim376-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim376.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim376.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim376.history.won') : t('battlesim376.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">${t('battlesim376.ui.endurance')} ${h.playerEndurance}/${h.playerEnduranceMax} · ${date}</span>
    </div>`;
  }).join('');
}

function _renderAll() {
  _renderInputs(true);
  _renderLog();
  _renderHistory();
}

export function renderSim376() {
  const overlay = document.getElementById('sim376-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim376(); return; }
  _renderAll();
}

function openSim376() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim376-overlay').classList.add('active');
}

function closeSim376() {
  document.getElementById('sim376-overlay')?.classList.remove('active');
}

export function setSim376Visible(visible) {
  const btn = document.getElementById('sim376-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim376();
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

export function initSim376() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim376-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim376.ui.title')}</span>
        <button id="sim376-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim376.ui.you')}</div>
            ${_numField(t('battlesim376.ui.endurance'), 'sim376-player-endurance')}
            ${_numField(t('battlesim376.ui.endurance_initial'), 'sim376-player-endurancemax')}
            ${_numField(t('battlesim376.ui.innerforce'), 'sim376-player-innerforce')}
            ${_numField(t('battlesim376.ui.innerforce_initial'), 'sim376-player-innerforcemax')}
            ${_numField(t('battlesim376.ui.hand'), 'sim376-player-hand')}
            ${_numField(t('battlesim376.ui.kick'), 'sim376-player-kick')}
            ${_numField(t('battlesim376.ui.throw'), 'sim376-player-throw')}
            ${_numField(t('battlesim376.ui.shurikens'), 'sim376-player-shurikens')}
            ${_numField(t('battlesim376.ui.player_defense'), 'sim376-player-defense')}
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim376.ui.enemy')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim376.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim376-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim376-enemy-pick-dropdown">
                <ul id="sim376-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim376.ui.endurance'), 'sim376-enemy-endurance')}
            ${_numField(t('battlesim376.ui.endurance_max'), 'sim376-enemy-endurancemax')}
            ${_numField(t('battlesim376.ui.dmg_dice'), 'sim376-enemy-dmgdice')}
            ${_numField(t('battlesim376.ui.dmg_bonus'), 'sim376-enemy-dmgbonus')}
            ${_numField(t('battlesim376.ui.def_hand'), 'sim376-enemy-defhand')}
            ${_numField(t('battlesim376.ui.def_kick'), 'sim376-enemy-defkick')}
            ${_numField(t('battlesim376.ui.def_throw'), 'sim376-enemy-defthrow')}
            ${_numField(t('battlesim376.ui.def_shuriken'), 'sim376-enemy-defshuriken')}
          </div>
          <div class="inv-edit-row">
            <span class="inv-edit-label bsim-stat-label">${t('battlesim376.ui.technique')}</span>
            <select id="sim376-technique" class="inv-edit-input">
              <option value="hand">${t('battlesim376.ui.tech_hand')}</option>
              <option value="kick">${t('battlesim376.ui.tech_kick')}</option>
              <option value="throw">${t('battlesim376.ui.tech_throw')}</option>
              <option value="shuriken">${t('battlesim376.ui.tech_shuriken')}</option>
            </select>
          </div>
          <div class="inv-edit-row">
            <label class="inv-edit-check-label"><input type="checkbox" id="sim376-innerforce-use" class="inv-edit-check"> ${t('battlesim376.ui.innerforce_use_toggle')}</label>
          </div>
          <div id="sim376-penalty-note" class="bsim-status" style="display:none">${t('battlesim376.ui.penalty_note')}</div>
          <div id="sim376-status" class="bsim-status"></div>
          <div id="sim376-hit-prompt" class="inv-edit-row bsim-heal-row" style="display:none">
            <span id="sim376-hit-prompt-text" class="inv-edit-label bsim-stat-label"></span>
            <button id="sim376-block" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim376.btn.block')}</button>
            <button id="sim376-take-hit" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim376.btn.take_hit')}</button>
          </div>
          <div id="sim376-followup-prompt" class="inv-edit-row bsim-heal-row" style="display:none">
            <span class="inv-edit-label bsim-stat-label">${t('battlesim376.ui.followup_prompt')}</span>
            <button id="sim376-followup-hand" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim376.ui.tech_hand')}</button>
            <button id="sim376-followup-kick" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim376.ui.tech_kick')}</button>
          </div>
          <div class="inv-modal-ftr">
            <button id="sim376-attack" class="inv-add-btn bsim-action-primary">${t('battlesim376.btn.attack')}</button>
            <button id="sim376-reset" class="inv-add-btn">${t('battlesim376.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary id="sim376-history-summary">${t('battlesim376.history.summary', { n: 0 })}</summary>
            <div id="sim376-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim376-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim376-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim376);
  document.getElementById('sim376-close').addEventListener('click', closeSim376);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim376(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim376-overlay'),
    open:  openSim376,
    close: closeSim376,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim376();
  });

  document.getElementById('sim376-attack').addEventListener('click', _attack);
  document.getElementById('sim376-reset').addEventListener('click', _resetBattle);
  document.getElementById('sim376-block').addEventListener('click', _block);
  document.getElementById('sim376-take-hit').addEventListener('click', _takeHit);
  document.getElementById('sim376-followup-hand').addEventListener('click', () => _throwFollowup('hand'));
  document.getElementById('sim376-followup-kick').addEventListener('click', () => _throwFollowup('kick'));

  document.getElementById('sim376-technique').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.technique = e.target.value;
    saveState();
  });
  document.getElementById('sim376-innerforce-use').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.useInnerForce = e.target.checked;
    saveState();
  });

  document.getElementById('sim376-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });
  _setupAutocomplete('sim376-enemy-pick', 'sim376-enemy-pick-dropdown', enemy => {
    const d = _data();
    if (!d) return;
    d.enemy.name        = enemy.name;
    d.enemy.endurance    = enemy.hp ?? 0;
    d.enemy.enduranceMax = enemy.hp ?? 0;
    d.enemy.dmgDice      = enemy.pb ?? 1;
    d.enemy.dmgBonus     = enemy.defense ?? 0;
    d.enemy.defHand      = enemy.attack ?? 0;
    d.enemy.defKick      = 0;
    d.enemy.defThrow     = 0;
    d.enemy.defShuriken  = 0;
    d.player.defense     = 0;
    d.roundsThisBattle   = 0;
    d.pendingEnemyHit     = null;
    d.pendingThrowFollowup = false;
    d.player.blockPenaltyPending = false;
    saveState();
    _renderAll();
  });

  const fieldMap = {
    'sim376-player-endurance': ['player', 'endurance'], 'sim376-player-endurancemax': ['player', 'enduranceInitial'],
    'sim376-player-innerforce': ['player', 'innerForce'], 'sim376-player-innerforcemax': ['player', 'innerForceInitial'],
    'sim376-player-hand': ['player', 'hand'], 'sim376-player-kick': ['player', 'kick'], 'sim376-player-throw': ['player', 'throw'],
    'sim376-player-shurikens': ['player', 'shurikens'], 'sim376-player-defense': ['player', 'defense'],
    'sim376-enemy-endurance': ['enemy', 'endurance'], 'sim376-enemy-endurancemax': ['enemy', 'enduranceMax'],
    'sim376-enemy-dmgdice': ['enemy', 'dmgDice'], 'sim376-enemy-dmgbonus': ['enemy', 'dmgBonus'],
    'sim376-enemy-defhand': ['enemy', 'defHand'], 'sim376-enemy-defkick': ['enemy', 'defKick'],
    'sim376-enemy-defthrow': ['enemy', 'defThrow'], 'sim376-enemy-defshuriken': ['enemy', 'defShuriken'],
  };
  for (const [id, path] of Object.entries(fieldMap)) {
    const input = document.getElementById(id);
    input.addEventListener('change', () => {
      const d = _data();
      if (!d) return;
      const val = parseInt(input.value, 10) || 0;
      d[path[0]][path[1]] = Math.max(0, val);
      saveState();
      _renderInputs(true);
    });
  }
  overlay.querySelectorAll('.inv-qty-btn').forEach(btn2 => {
    btn2.addEventListener('click', () => {
      const input = document.getElementById(btn2.dataset.id);
      if (!input) return;
      const delta = parseInt(btn2.dataset.delta, 10);
      input.value = (parseInt(input.value, 10) || 0) + delta;
      input.dispatchEvent(new Event('change'));
    });
  });
}

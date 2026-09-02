// ── Battle Simulator (Пъкъл! / Hell!, book 378, Way of the Tiger 5 - final book) ──
// Self-contained module. Imports from state.js, charsheet.js and util.js.
// Visibility is gated (book 378 only) by the caller in boot.js via
// setSim378Visible().
// To remove: delete this file, remove its import line and initSim378()/
// setSim378Visible() calls from boot.js, remove 'sim378' from
// SIM_HISTORY_KEYS in server/db/xp.js, and remove the .bsim-* CSS (shared
// with the other battlesim*.js files, so only remove it if all are gone).
//
// Same series-wide combat system as books 370/375/376/377 (three independent
// technique scores - удар с ръка/Hand, удар с крак/Kick, хвърляне/Throw,
// plus Shuriken-jutsu as a separate ranged option with its own 5-count
// resource). This final book also prints no rules recap of its own -
// confirmed identical mechanic from this book's own 20 in-story stat-block-
// bearing sections ("[NAME] Защита срещу [техника] «[име]»: N Издръжливост: N
// Щети: N зар[+N]"), matching books 370/375/376/377's format exactly. No new
// climactic mechanic found - Inner Force/Block/Throw-followup all behave
// identically to the earlier four books.
//
// Full enemy roster (6 rows, read from all 20 stat-block-bearing sections of
// 424 total):
//   - Лорд Сайл, Вожд на Орковете (§12/§382, →§72 on defeat): End 18, Dmg
//     1d+2, Def Kick(«вършачка на Куон»)=5, Def Hand(«тигрова лапа»)=7. An
//     earlier beat in the same fight (§362) also gives a flat Defense=4 for
//     a single unnamed counter-punch with no separate Endurance value - not
//     a distinct encounter, just one exchange within this same boss fight,
//     not modeled separately.
//   - Кочияш орк / Втори орк / Трети орк (§162, three orcs fought
//     simultaneously as one scene, same shape as book 376's paired
//     bodyguards): Кочияш орк (coachman) End 10 Def 6 Dmg 1d+1; Втори орк
//     End 8 Def 5 Dmg 1d; Трети орк End 7 Def 5 Dmg 1d. Player's own
//     Defense against their combined attacks is 8 (not stored in
//     book_enemies - the player-defense field is set manually per fight, as
//     with every other sim in this series). Kept as three separate rows
//     since each has genuinely different stats, not a merged group.
//   - Касандра (§221/§241, one fight with multiple technique branches): End
//     18, Dmg 1d+3 (source prints "1 зар + З", the "З" a plain OCR
//     Cyrillic/Latin-lookalike misread of "3", corrected here), Def
//     Hand(«ухапване на кобра»)=8, Def Throw(«водовъртеж»)=8. Two further
//     technique branches (Kick «двузъба мълния» §231, Throw «драконова
//     опашка» §211) are offered but never get their own reprinted stat
//     block in the source - only Hand and Throw have a directly-stated
//     Defense value, so defKick is left at the field default (0) rather
//     than guessed.
//   - Тютчев (§254/§294/§334, three narrative retellings of the same
//     climactic multi-round duel - explicitly "три битки"/"three battles"
//     fought in sequence against the same stat line, same as book 375's
//     recurring Старец fight): End 20, Dmg 2d+2, Defense given as a single
//     generic "Защита срещу Пътя на тигъра" (Defense against the Way of the
//     Tiger) that applies no matter which of the three techniques is used -
//     seeded into defHand only (book_enemies has no generic/all-technique
//     column), so defKick and defThrow must be manually set to match
//     defHand (8) if simulating a Kick or Throw attempt specifically. Two
//     of the three retellings state Defense 8 (§254/§294); the third
//     (§334) states 7, with the player's own counter-defense listed as 9
//     instead of the other two's 8 - a minor inconsistency in the source
//     text, seeded at the majority value (8) as with prior books' similar
//     cases.
//
// Excluded from the roster (single opposed-roll story beats or generic
// "Джудже-трол"/dwarf-troll skirmishes with no Endurance value ever printed
// - an infinite-retry single check rather than an HP-tracked fight, same
// judgment as book 377's Мардолх and book 376's scripted interrupts): the
// silver serpent-headed spear dodge/block sequence (§6/§118/§138/§358/§388/
// §418, no Endurance given, single Defense-6 check each time), and every
// "Джудже-трол" axe-fighter encounter (§37/§137/§199/§247/§387, Defense-only
// checks with a flat Endurance-point loss on failure, never a stat block).
//
// book_enemies column reuse, same convention as books 370/375/376/377: hp =
// Издръжливост; attack = a representative starting Defense value
// (autocomplete-fill default only, re-entered per encounter from the
// section text since most enemies here are fought via a single named
// technique rather than several); pb/defense = the enemy's damage dice
// count / flat bonus.
//
// All state lives in pt.sim378, per-user/per-book via currentPlaythrough().

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
  if (!pt.sim378) {
    pt.sim378 = {
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
  const d = pt.sim378;
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
function _techLabel(tech) { return t(`battlesim378.ui.tech_${tech}`); }

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
    _appendLog(d, t('battlesim378.log.enemy_hits_pending', { enemy: _enemyNameSafe(d), roll: enemyRoll, defense: d.player.defense, dmg }));
  } else {
    _appendLog(d, t('battlesim378.log.enemy_misses', { enemy: _enemyNameSafe(d), roll: enemyRoll, defense: d.player.defense }));
  }
}

function _applyEnemyDefeat(d) {
  if (d.enemy.enduranceMax > 0 && d.enemy.endurance <= 0) {
    _appendLog(d, t('battlesim378.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
    return true;
  }
  return false;
}

function _applyPlayerFall(d) {
  if (d.player.endurance <= 0) {
    _appendLog(d, t('battlesim378.log.fallen', { skull: SVG_SKULL }));
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

  _appendLog(d, t('battlesim378.log.attack', { tech: _techLabel(tech), enemy: _enemyNameSafe(d), raw, score, total, defense }));

  if (tech === 'shuriken') d.player.shurikens = Math.max(0, d.player.shurikens - 1);

  if (!hit) {
    _appendLog(d, t('battlesim378.log.miss', { tech: _techLabel(tech) }));
    _enemyCounter(d);
    saveState();
    _renderAll();
    return;
  }

  if (tech === 'throw') {
    _appendLog(d, t('battlesim378.log.throw_lands'));
    d.pendingThrowFollowup = true;
    saveState();
    _renderAll();
    return;
  }

  let dmg = raw + _roll1d6();
  if (tech === 'kick') dmg += 2;
  if (useIF) dmg *= 2;
  d.enemy.endurance = Math.max(0, d.enemy.endurance - dmg);
  _appendLog(d, t('battlesim378.log.you_hit', { tech: _techLabel(tech), enemy: _enemyNameSafe(d), n: dmg, endurance: d.enemy.endurance, enduranceMax: d.enemy.enduranceMax, innerForce: useIF ? t('battlesim378.log.inner_force_tag') : '' }));

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

  _appendLog(d, t('battlesim378.log.followup_attack', { tech: _techLabel(tech), enemy: _enemyNameSafe(d), raw, score, total, defense }));

  if (!hit) {
    _appendLog(d, t('battlesim378.log.followup_miss', { tech: _techLabel(tech) }));
    saveState();
    _renderAll();
    return;
  }

  let dmg = raw + _roll1d6() + 2;
  if (tech === 'kick') dmg += 2;
  d.enemy.endurance = Math.max(0, d.enemy.endurance - dmg);
  _appendLog(d, t('battlesim378.log.you_hit', { tech: _techLabel(tech), enemy: _enemyNameSafe(d), n: dmg, endurance: d.enemy.endurance, enduranceMax: d.enemy.enduranceMax, innerForce: '' }));

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
    _appendLog(d, t('battlesim378.log.block_success', { roll, defense: d.player.defense }));
  } else {
    d.player.endurance = Math.max(0, d.player.endurance - dmg);
    _appendLog(d, t('battlesim378.log.block_fail', { roll, defense: d.player.defense, n: dmg, endurance: d.player.endurance, enduranceMax: d.player.enduranceInitial }));
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
  _appendLog(d, t('battlesim378.log.take_hit', { n: dmg, endurance: d.player.endurance, enduranceMax: d.player.enduranceInitial }));
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
  if (d.log.length) _appendLog(d, t('battlesim378.log.reset_sep'));
  _appendLog(d, t('battlesim378.log.reset', { enemy: _enemyNameSafe(d) }));
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
      `<li role="option" id="${dropdownId}-opt-${i}" data-idx="${i}">${escapeHtml(e.name)}<span class="ac-sub">${t('battlesim378.ui.endurance')}:${e.hp ?? '?'}</span></li>`
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

  _setVal('sim378-player-endurance', p.endurance);
  _setVal('sim378-player-endurancemax', p.enduranceInitial);
  _setVal('sim378-player-innerforce', p.innerForce);
  _setVal('sim378-player-innerforcemax', p.innerForceInitial);
  _setVal('sim378-player-hand', p.hand);
  _setVal('sim378-player-kick', p.kick);
  _setVal('sim378-player-throw', p.throw);
  _setVal('sim378-player-shurikens', p.shurikens);
  _setVal('sim378-player-defense', p.defense);

  if (!skipEnemyPick) _setVal('sim378-enemy-pick', e.name);
  _setVal('sim378-enemy-endurance', e.endurance);
  _setVal('sim378-enemy-endurancemax', e.enduranceMax);
  _setVal('sim378-enemy-dmgdice', e.dmgDice);
  _setVal('sim378-enemy-dmgbonus', e.dmgBonus);
  _setVal('sim378-enemy-defhand', e.defHand);
  _setVal('sim378-enemy-defkick', e.defKick);
  _setVal('sim378-enemy-defthrow', e.defThrow);
  _setVal('sim378-enemy-defshuriken', e.defShuriken);

  const techSel = document.getElementById('sim378-technique');
  if (techSel) techSel.value = d.technique;
  const ifCheck = document.getElementById('sim378-innerforce-use');
  if (ifCheck) ifCheck.checked = d.useInnerForce;

  const busy = _busy(d);
  const over = _battleOver(d);
  document.getElementById('sim378-attack').disabled = busy || over;
  document.getElementById('sim378-technique').disabled = busy || over;
  document.getElementById('sim378-innerforce-use').disabled = busy || over || p.innerForce <= 0;

  const hitPrompt = document.getElementById('sim378-hit-prompt');
  hitPrompt.style.display = d.pendingEnemyHit ? '' : 'none';
  if (d.pendingEnemyHit) {
    document.getElementById('sim378-hit-prompt-text').textContent = t('battlesim378.ui.hit_prompt', { n: d.pendingEnemyHit.dmg });
  }

  const followupPrompt = document.getElementById('sim378-followup-prompt');
  followupPrompt.style.display = d.pendingThrowFollowup ? '' : 'none';

  const status = document.getElementById('sim378-status');
  if (p.endurance <= 0) status.innerHTML = t('battlesim378.status.fallen', { skull: SVG_SKULL });
  else if (e.enduranceMax > 0 && e.endurance <= 0) status.innerHTML = t('battlesim378.status.victory', { trophy: SVG_TROPHY });
  else status.innerHTML = '';

  const penaltyNote = document.getElementById('sim378-penalty-note');
  penaltyNote.style.display = p.blockPenaltyPending ? '' : 'none';
}

function _renderLog() {
  const d = _data();
  const el = document.getElementById('sim378-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim378-history-summary');
  const listEl = document.getElementById('sim378-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim378.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim378.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim378.history.won') : t('battlesim378.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">${t('battlesim378.ui.endurance')} ${h.playerEndurance}/${h.playerEnduranceMax} · ${date}</span>
    </div>`;
  }).join('');
}

function _renderAll() {
  _renderInputs(true);
  _renderLog();
  _renderHistory();
}

export function renderSim378() {
  const overlay = document.getElementById('sim378-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim378(); return; }
  _renderAll();
}

function openSim378() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim378-overlay').classList.add('active');
}

function closeSim378() {
  document.getElementById('sim378-overlay')?.classList.remove('active');
}

export function setSim378Visible(visible) {
  const btn = document.getElementById('sim378-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim378();
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

export function initSim378() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim378-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim378.ui.title')}</span>
        <button id="sim378-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim378.ui.you')}</div>
            ${_numField(t('battlesim378.ui.endurance'), 'sim378-player-endurance')}
            ${_numField(t('battlesim378.ui.endurance_initial'), 'sim378-player-endurancemax')}
            ${_numField(t('battlesim378.ui.innerforce'), 'sim378-player-innerforce')}
            ${_numField(t('battlesim378.ui.innerforce_initial'), 'sim378-player-innerforcemax')}
            ${_numField(t('battlesim378.ui.hand'), 'sim378-player-hand')}
            ${_numField(t('battlesim378.ui.kick'), 'sim378-player-kick')}
            ${_numField(t('battlesim378.ui.throw'), 'sim378-player-throw')}
            ${_numField(t('battlesim378.ui.shurikens'), 'sim378-player-shurikens')}
            ${_numField(t('battlesim378.ui.player_defense'), 'sim378-player-defense')}
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim378.ui.enemy')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim378.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim378-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim378-enemy-pick-dropdown">
                <ul id="sim378-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim378.ui.endurance'), 'sim378-enemy-endurance')}
            ${_numField(t('battlesim378.ui.endurance_max'), 'sim378-enemy-endurancemax')}
            ${_numField(t('battlesim378.ui.dmg_dice'), 'sim378-enemy-dmgdice')}
            ${_numField(t('battlesim378.ui.dmg_bonus'), 'sim378-enemy-dmgbonus')}
            ${_numField(t('battlesim378.ui.def_hand'), 'sim378-enemy-defhand')}
            ${_numField(t('battlesim378.ui.def_kick'), 'sim378-enemy-defkick')}
            ${_numField(t('battlesim378.ui.def_throw'), 'sim378-enemy-defthrow')}
            ${_numField(t('battlesim378.ui.def_shuriken'), 'sim378-enemy-defshuriken')}
          </div>
          <div class="inv-edit-row">
            <span class="inv-edit-label bsim-stat-label">${t('battlesim378.ui.technique')}</span>
            <select id="sim378-technique" class="inv-edit-input">
              <option value="hand">${t('battlesim378.ui.tech_hand')}</option>
              <option value="kick">${t('battlesim378.ui.tech_kick')}</option>
              <option value="throw">${t('battlesim378.ui.tech_throw')}</option>
              <option value="shuriken">${t('battlesim378.ui.tech_shuriken')}</option>
            </select>
          </div>
          <div class="inv-edit-row">
            <label class="inv-edit-check-label"><input type="checkbox" id="sim378-innerforce-use" class="inv-edit-check"> ${t('battlesim378.ui.innerforce_use_toggle')}</label>
          </div>
          <div id="sim378-penalty-note" class="bsim-status" style="display:none">${t('battlesim378.ui.penalty_note')}</div>
          <div id="sim378-status" class="bsim-status"></div>
          <div id="sim378-hit-prompt" class="inv-edit-row bsim-heal-row" style="display:none">
            <span id="sim378-hit-prompt-text" class="inv-edit-label bsim-stat-label"></span>
            <button id="sim378-block" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim378.btn.block')}</button>
            <button id="sim378-take-hit" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim378.btn.take_hit')}</button>
          </div>
          <div id="sim378-followup-prompt" class="inv-edit-row bsim-heal-row" style="display:none">
            <span class="inv-edit-label bsim-stat-label">${t('battlesim378.ui.followup_prompt')}</span>
            <button id="sim378-followup-hand" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim378.ui.tech_hand')}</button>
            <button id="sim378-followup-kick" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim378.ui.tech_kick')}</button>
          </div>
          <div class="inv-modal-ftr">
            <button id="sim378-attack" class="inv-add-btn bsim-action-primary">${t('battlesim378.btn.attack')}</button>
            <button id="sim378-reset" class="inv-add-btn">${t('battlesim378.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary id="sim378-history-summary">${t('battlesim378.history.summary', { n: 0 })}</summary>
            <div id="sim378-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim378-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim378-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim378);
  document.getElementById('sim378-close').addEventListener('click', closeSim378);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim378(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim378-overlay'),
    open:  openSim378,
    close: closeSim378,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim378();
  });

  document.getElementById('sim378-attack').addEventListener('click', _attack);
  document.getElementById('sim378-reset').addEventListener('click', _resetBattle);
  document.getElementById('sim378-block').addEventListener('click', _block);
  document.getElementById('sim378-take-hit').addEventListener('click', _takeHit);
  document.getElementById('sim378-followup-hand').addEventListener('click', () => _throwFollowup('hand'));
  document.getElementById('sim378-followup-kick').addEventListener('click', () => _throwFollowup('kick'));

  document.getElementById('sim378-technique').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.technique = e.target.value;
    saveState();
  });
  document.getElementById('sim378-innerforce-use').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.useInnerForce = e.target.checked;
    saveState();
  });

  document.getElementById('sim378-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });
  _setupAutocomplete('sim378-enemy-pick', 'sim378-enemy-pick-dropdown', enemy => {
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
    'sim378-player-endurance': ['player', 'endurance'], 'sim378-player-endurancemax': ['player', 'enduranceInitial'],
    'sim378-player-innerforce': ['player', 'innerForce'], 'sim378-player-innerforcemax': ['player', 'innerForceInitial'],
    'sim378-player-hand': ['player', 'hand'], 'sim378-player-kick': ['player', 'kick'], 'sim378-player-throw': ['player', 'throw'],
    'sim378-player-shurikens': ['player', 'shurikens'], 'sim378-player-defense': ['player', 'defense'],
    'sim378-enemy-endurance': ['enemy', 'endurance'], 'sim378-enemy-endurancemax': ['enemy', 'enduranceMax'],
    'sim378-enemy-dmgdice': ['enemy', 'dmgDice'], 'sim378-enemy-dmgbonus': ['enemy', 'dmgBonus'],
    'sim378-enemy-defhand': ['enemy', 'defHand'], 'sim378-enemy-defkick': ['enemy', 'defKick'],
    'sim378-enemy-defthrow': ['enemy', 'defThrow'], 'sim378-enemy-defshuriken': ['enemy', 'defShuriken'],
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

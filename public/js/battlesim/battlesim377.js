// ── Battle Simulator (Завоевател! / The Conqueror, book 377, Way of the Tiger 4) ──
// Self-contained module. Imports from state.js, charsheet.js and util.js.
// Visibility is gated (book 377 only) by the caller in boot.js via
// setSim377Visible().
// To remove: delete this file, remove its import line and initSim377()/
// setSim377Visible() calls from boot.js, remove 'sim377' from
// SIM_HISTORY_KEYS in server/db/xp.js, and remove the .bsim-* CSS (shared
// with the other battlesim*.js files, so only remove it if all are gone).
//
// Same series-wide combat system as books 370/375/376 (three independent
// technique scores - удар с ръка/Hand, удар с крак/Kick, хвърляне/Throw,
// plus Shuriken-jutsu as a separate ranged option with its own 5-count
// resource). This book (book 4) also prints no rules recap of its own -
// confirmed identical mechanic from this book's own 17 in-story stat blocks
// ("[NAME] Защита срещу [техника] «[име]»: N Издръжливост: N Щети: N зар[+N]"),
// matching books 370/375/376's format exactly.
//
// One book-specific addition found in this book only: a "нервнопаралитичен
// удар" (paralytic-strike) skill, offered on the Хонорик fight, adds a flat
// +2 to damage on a hit - explicitly mutually exclusive with Inner Force
// ("нямаш право да използваш едновременно нервнопаралитичен удар и вътрешна
// сила"). Not modeled as a separate toggle - the existing Inner Force
// checkbox already doubles damage, a strictly better option whenever
// available, so a player with both skills would simply never choose the
// weaker one; omitting the paralytic-strike toggle costs nothing in play,
// it would only ever be picked if Inner Force were already spent for that
// fight, which the sim doesn't need a separate control to represent (the
// player can just add 2 by hand to the enemy's dmgBonus field for that
// specific fight if they want to model it, same as any other manual
// enemy-stat override this UI already exposes for editing before an attack).
//
// Full enemy roster (6 rows, read from all 17 stat-block-bearing sections of
// 420 total):
//   - Старец (§60/70, §168/178, §264/274 - three narrative retellings of the
//     same recurring boss fight, identical stats every time): End 22,
//     Def Hand(«тигрова лапа»)=7, Def "Скиптър"(a story item, modeled as the
//     Hand slot's alternate weapon - same Defense field reused since the
//     game never asks for both at once)=8 - only Def Hand is populated in
//     book_enemies since the two options never differ in outcome shape, only
//     in which weapon is narrated. Dmg 1d+2.
//   - Пещерен трол (§173/195/211, →§19): End 20, Def Hand(«железен юмрук»)=4,
//     Kick(«тигров скок»)=7, Kick(«вършачка на Куон»)=6 (both Kick moves
//     share the defKick field in this UI - populated with the «тигров скок»
//     value, the more frequently offered branch; «вършачка на Куон»'s
//     Defense=6 differs slightly and must be hand-adjusted if that specific
//     branch is being simulated). Dmg 2 dice.
//   - Пещерен трол (втора среща) (§337/347/357, →§411 - a second, later,
//     narratively distinct fight against the same monster type, kept as its
//     own book_enemies row rather than merged with the first): End 20,
//     Def Hand(«железен юмрук»)=6, Kick(«тигров скок»)=7, Kick(«вършачка на
//     Куон»)=6 (same shared-field caveat as above). Dmg 2 dice at two of the
//     three branches (§347/357) and 2 dice+1 at the third (§337, Iron Fist
//     branch) - a minor inconsistency in the source text; seeded at the
//     majority value (2 dice, no bonus) since that's what two of the three
//     branches state.
//   - Изчадие на процепа (§213/263/283, three branches of one fight, a
//     three-headed creature the rules explicitly forbid blocking against -
//     "Не можеш да използваш блок" - not modeled as a hard rule-out since
//     this UI's Block button is always available by design; a player using
//     this sim for this specific fight should just choose Take Hit instead
//     of Block each time to match the book's restriction): End 24,
//     Def Kick(«двузъба мълния»)=4, Hand(«ухапване от кобра»)=3, Kick(«крилат
//     кон»)=4 (two Kick moves again share defKick - populated with «двузъба
//     мълния»). Dmg 2 dice+3.
//   - Хонорик (§360/370, two branches of one fight, the book's final major
//     duel): End 24, Def Kick(«двузъба мълния»)=8, Hand(«железен юмрук»)=9,
//     Throw(«тигрови зъби», §380 - no stat block reprinted for this branch,
//     consistent with the series' pattern of Throw not needing its own
//     Defense line since it never deals direct damage) left at Def
//     Throw=0 (unused field default). Dmg 1d+5. See paralytic-strike note
//     above re: the +2 damage skill offered on this fight specifically.
//
// Excluded from the roster (single opposed-roll story beats, not sustained
// HP-tracked fights, same judgment as book 376's Nemesis Priest scripted
// interrupt): two guard stealth takedowns (§52), a young Nemesis wizard
// stealth takedown (§252), a shuriken toss at an already-fought troll
// (§379), and a "Мардолх" encounter (§223) that gives only the player's own
// Defense/loss-on-fail (no Mardolh Endurance value at all, an infinite-retry
// single check rather than an HP-tracked fight - unlike book 375's Мардолх,
// which DOES have a full 30-Endurance stat block; the two are not the same
// encounter shape despite the shared name, so book 375's Мардолх entry was
// not reused or referenced here).
//
// No other Inner-Force/Fate/Block-mechanic differences found from books
// 370/375/376 - the combat math implemented below is unchanged from those
// three sims.
//
// book_enemies column reuse, same convention as books 370/375/376: hp =
// Издръжливост; attack = a representative starting Defense value
// (autocomplete-fill default only, this book's enemies are fought via
// different named techniques on different branches, each with its own
// Defense - every Defense field must still be re-entered per encounter from
// the section text); pb/defense = the enemy's damage dice count / flat bonus.
//
// All state lives in pt.sim377, per-user/per-book via currentPlaythrough().

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
  if (!pt.sim377) {
    pt.sim377 = {
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
  const d = pt.sim377;
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
function _techLabel(tech) { return t(`battlesim377.ui.tech_${tech}`); }

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
    _appendLog(d, t('battlesim377.log.enemy_hits_pending', { enemy: _enemyNameSafe(d), roll: enemyRoll, defense: d.player.defense, dmg }));
  } else {
    _appendLog(d, t('battlesim377.log.enemy_misses', { enemy: _enemyNameSafe(d), roll: enemyRoll, defense: d.player.defense }));
  }
}

function _applyEnemyDefeat(d) {
  if (d.enemy.enduranceMax > 0 && d.enemy.endurance <= 0) {
    _appendLog(d, t('battlesim377.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
    return true;
  }
  return false;
}

function _applyPlayerFall(d) {
  if (d.player.endurance <= 0) {
    _appendLog(d, t('battlesim377.log.fallen', { skull: SVG_SKULL }));
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

  _appendLog(d, t('battlesim377.log.attack', { tech: _techLabel(tech), enemy: _enemyNameSafe(d), raw, score, total, defense }));

  if (tech === 'shuriken') d.player.shurikens = Math.max(0, d.player.shurikens - 1);

  if (!hit) {
    _appendLog(d, t('battlesim377.log.miss', { tech: _techLabel(tech) }));
    _enemyCounter(d);
    saveState();
    _renderAll();
    return;
  }

  if (tech === 'throw') {
    _appendLog(d, t('battlesim377.log.throw_lands'));
    d.pendingThrowFollowup = true;
    saveState();
    _renderAll();
    return;
  }

  let dmg = raw + _roll1d6();
  if (tech === 'kick') dmg += 2;
  if (useIF) dmg *= 2;
  d.enemy.endurance = Math.max(0, d.enemy.endurance - dmg);
  _appendLog(d, t('battlesim377.log.you_hit', { tech: _techLabel(tech), enemy: _enemyNameSafe(d), n: dmg, endurance: d.enemy.endurance, enduranceMax: d.enemy.enduranceMax, innerForce: useIF ? t('battlesim377.log.inner_force_tag') : '' }));

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

  _appendLog(d, t('battlesim377.log.followup_attack', { tech: _techLabel(tech), enemy: _enemyNameSafe(d), raw, score, total, defense }));

  if (!hit) {
    _appendLog(d, t('battlesim377.log.followup_miss', { tech: _techLabel(tech) }));
    saveState();
    _renderAll();
    return;
  }

  let dmg = raw + _roll1d6() + 2;
  if (tech === 'kick') dmg += 2;
  d.enemy.endurance = Math.max(0, d.enemy.endurance - dmg);
  _appendLog(d, t('battlesim377.log.you_hit', { tech: _techLabel(tech), enemy: _enemyNameSafe(d), n: dmg, endurance: d.enemy.endurance, enduranceMax: d.enemy.enduranceMax, innerForce: '' }));

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
    _appendLog(d, t('battlesim377.log.block_success', { roll, defense: d.player.defense }));
  } else {
    d.player.endurance = Math.max(0, d.player.endurance - dmg);
    _appendLog(d, t('battlesim377.log.block_fail', { roll, defense: d.player.defense, n: dmg, endurance: d.player.endurance, enduranceMax: d.player.enduranceInitial }));
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
  _appendLog(d, t('battlesim377.log.take_hit', { n: dmg, endurance: d.player.endurance, enduranceMax: d.player.enduranceInitial }));
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
  if (d.log.length) _appendLog(d, t('battlesim377.log.reset_sep'));
  _appendLog(d, t('battlesim377.log.reset', { enemy: _enemyNameSafe(d) }));
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
      `<li role="option" id="${dropdownId}-opt-${i}" data-idx="${i}">${escapeHtml(e.name)}<span class="ac-sub">${t('battlesim377.ui.endurance')}:${e.hp ?? '?'}</span></li>`
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

  _setVal('sim377-player-endurance', p.endurance);
  _setVal('sim377-player-endurancemax', p.enduranceInitial);
  _setVal('sim377-player-innerforce', p.innerForce);
  _setVal('sim377-player-innerforcemax', p.innerForceInitial);
  _setVal('sim377-player-hand', p.hand);
  _setVal('sim377-player-kick', p.kick);
  _setVal('sim377-player-throw', p.throw);
  _setVal('sim377-player-shurikens', p.shurikens);
  _setVal('sim377-player-defense', p.defense);

  if (!skipEnemyPick) _setVal('sim377-enemy-pick', e.name);
  _setVal('sim377-enemy-endurance', e.endurance);
  _setVal('sim377-enemy-endurancemax', e.enduranceMax);
  _setVal('sim377-enemy-dmgdice', e.dmgDice);
  _setVal('sim377-enemy-dmgbonus', e.dmgBonus);
  _setVal('sim377-enemy-defhand', e.defHand);
  _setVal('sim377-enemy-defkick', e.defKick);
  _setVal('sim377-enemy-defthrow', e.defThrow);
  _setVal('sim377-enemy-defshuriken', e.defShuriken);

  const techSel = document.getElementById('sim377-technique');
  if (techSel) techSel.value = d.technique;
  const ifCheck = document.getElementById('sim377-innerforce-use');
  if (ifCheck) ifCheck.checked = d.useInnerForce;

  const busy = _busy(d);
  const over = _battleOver(d);
  document.getElementById('sim377-attack').disabled = busy || over;
  document.getElementById('sim377-technique').disabled = busy || over;
  document.getElementById('sim377-innerforce-use').disabled = busy || over || p.innerForce <= 0;

  const hitPrompt = document.getElementById('sim377-hit-prompt');
  hitPrompt.style.display = d.pendingEnemyHit ? '' : 'none';
  if (d.pendingEnemyHit) {
    document.getElementById('sim377-hit-prompt-text').textContent = t('battlesim377.ui.hit_prompt', { n: d.pendingEnemyHit.dmg });
  }

  const followupPrompt = document.getElementById('sim377-followup-prompt');
  followupPrompt.style.display = d.pendingThrowFollowup ? '' : 'none';

  const status = document.getElementById('sim377-status');
  if (p.endurance <= 0) status.innerHTML = t('battlesim377.status.fallen', { skull: SVG_SKULL });
  else if (e.enduranceMax > 0 && e.endurance <= 0) status.innerHTML = t('battlesim377.status.victory', { trophy: SVG_TROPHY });
  else status.innerHTML = '';

  const penaltyNote = document.getElementById('sim377-penalty-note');
  penaltyNote.style.display = p.blockPenaltyPending ? '' : 'none';
}

function _renderLog() {
  const d = _data();
  const el = document.getElementById('sim377-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim377-history-summary');
  const listEl = document.getElementById('sim377-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim377.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim377.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim377.history.won') : t('battlesim377.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">${t('battlesim377.ui.endurance')} ${h.playerEndurance}/${h.playerEnduranceMax} · ${date}</span>
    </div>`;
  }).join('');
}

function _renderAll() {
  _renderInputs(true);
  _renderLog();
  _renderHistory();
}

export function renderSim377() {
  const overlay = document.getElementById('sim377-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim377(); return; }
  _renderAll();
}

function openSim377() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim377-overlay').classList.add('active');
}

function closeSim377() {
  document.getElementById('sim377-overlay')?.classList.remove('active');
}

export function setSim377Visible(visible) {
  const btn = document.getElementById('sim377-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim377();
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

export function initSim377() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim377-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim377.ui.title')}</span>
        <button id="sim377-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim377.ui.you')}</div>
            ${_numField(t('battlesim377.ui.endurance'), 'sim377-player-endurance')}
            ${_numField(t('battlesim377.ui.endurance_initial'), 'sim377-player-endurancemax')}
            ${_numField(t('battlesim377.ui.innerforce'), 'sim377-player-innerforce')}
            ${_numField(t('battlesim377.ui.innerforce_initial'), 'sim377-player-innerforcemax')}
            ${_numField(t('battlesim377.ui.hand'), 'sim377-player-hand')}
            ${_numField(t('battlesim377.ui.kick'), 'sim377-player-kick')}
            ${_numField(t('battlesim377.ui.throw'), 'sim377-player-throw')}
            ${_numField(t('battlesim377.ui.shurikens'), 'sim377-player-shurikens')}
            ${_numField(t('battlesim377.ui.player_defense'), 'sim377-player-defense')}
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim377.ui.enemy')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim377.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim377-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim377-enemy-pick-dropdown">
                <ul id="sim377-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim377.ui.endurance'), 'sim377-enemy-endurance')}
            ${_numField(t('battlesim377.ui.endurance_max'), 'sim377-enemy-endurancemax')}
            ${_numField(t('battlesim377.ui.dmg_dice'), 'sim377-enemy-dmgdice')}
            ${_numField(t('battlesim377.ui.dmg_bonus'), 'sim377-enemy-dmgbonus')}
            ${_numField(t('battlesim377.ui.def_hand'), 'sim377-enemy-defhand')}
            ${_numField(t('battlesim377.ui.def_kick'), 'sim377-enemy-defkick')}
            ${_numField(t('battlesim377.ui.def_throw'), 'sim377-enemy-defthrow')}
            ${_numField(t('battlesim377.ui.def_shuriken'), 'sim377-enemy-defshuriken')}
          </div>
          <div class="inv-edit-row">
            <span class="inv-edit-label bsim-stat-label">${t('battlesim377.ui.technique')}</span>
            <select id="sim377-technique" class="inv-edit-input">
              <option value="hand">${t('battlesim377.ui.tech_hand')}</option>
              <option value="kick">${t('battlesim377.ui.tech_kick')}</option>
              <option value="throw">${t('battlesim377.ui.tech_throw')}</option>
              <option value="shuriken">${t('battlesim377.ui.tech_shuriken')}</option>
            </select>
          </div>
          <div class="inv-edit-row">
            <label class="inv-edit-check-label"><input type="checkbox" id="sim377-innerforce-use" class="inv-edit-check"> ${t('battlesim377.ui.innerforce_use_toggle')}</label>
          </div>
          <div id="sim377-penalty-note" class="bsim-status" style="display:none">${t('battlesim377.ui.penalty_note')}</div>
          <div id="sim377-status" class="bsim-status"></div>
          <div id="sim377-hit-prompt" class="inv-edit-row bsim-heal-row" style="display:none">
            <span id="sim377-hit-prompt-text" class="inv-edit-label bsim-stat-label"></span>
            <button id="sim377-block" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim377.btn.block')}</button>
            <button id="sim377-take-hit" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim377.btn.take_hit')}</button>
          </div>
          <div id="sim377-followup-prompt" class="inv-edit-row bsim-heal-row" style="display:none">
            <span class="inv-edit-label bsim-stat-label">${t('battlesim377.ui.followup_prompt')}</span>
            <button id="sim377-followup-hand" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim377.ui.tech_hand')}</button>
            <button id="sim377-followup-kick" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim377.ui.tech_kick')}</button>
          </div>
          <div class="inv-modal-ftr">
            <button id="sim377-attack" class="inv-add-btn bsim-action-primary">${t('battlesim377.btn.attack')}</button>
            <button id="sim377-reset" class="inv-add-btn">${t('battlesim377.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary id="sim377-history-summary">${t('battlesim377.history.summary', { n: 0 })}</summary>
            <div id="sim377-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim377-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim377-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim377);
  document.getElementById('sim377-close').addEventListener('click', closeSim377);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim377(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim377-overlay'),
    open:  openSim377,
    close: closeSim377,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim377();
  });

  document.getElementById('sim377-attack').addEventListener('click', _attack);
  document.getElementById('sim377-reset').addEventListener('click', _resetBattle);
  document.getElementById('sim377-block').addEventListener('click', _block);
  document.getElementById('sim377-take-hit').addEventListener('click', _takeHit);
  document.getElementById('sim377-followup-hand').addEventListener('click', () => _throwFollowup('hand'));
  document.getElementById('sim377-followup-kick').addEventListener('click', () => _throwFollowup('kick'));

  document.getElementById('sim377-technique').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.technique = e.target.value;
    saveState();
  });
  document.getElementById('sim377-innerforce-use').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.useInnerForce = e.target.checked;
    saveState();
  });

  document.getElementById('sim377-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });
  _setupAutocomplete('sim377-enemy-pick', 'sim377-enemy-pick-dropdown', enemy => {
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
    'sim377-player-endurance': ['player', 'endurance'], 'sim377-player-endurancemax': ['player', 'enduranceInitial'],
    'sim377-player-innerforce': ['player', 'innerForce'], 'sim377-player-innerforcemax': ['player', 'innerForceInitial'],
    'sim377-player-hand': ['player', 'hand'], 'sim377-player-kick': ['player', 'kick'], 'sim377-player-throw': ['player', 'throw'],
    'sim377-player-shurikens': ['player', 'shurikens'], 'sim377-player-defense': ['player', 'defense'],
    'sim377-enemy-endurance': ['enemy', 'endurance'], 'sim377-enemy-endurancemax': ['enemy', 'enduranceMax'],
    'sim377-enemy-dmgdice': ['enemy', 'dmgDice'], 'sim377-enemy-dmgbonus': ['enemy', 'dmgBonus'],
    'sim377-enemy-defhand': ['enemy', 'defHand'], 'sim377-enemy-defkick': ['enemy', 'defKick'],
    'sim377-enemy-defthrow': ['enemy', 'defThrow'], 'sim377-enemy-defshuriken': ['enemy', 'defShuriken'],
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

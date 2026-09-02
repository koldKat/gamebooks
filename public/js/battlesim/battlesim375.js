// ── Battle Simulator (Убиец! / The Assassin, book 375, Way of the Tiger 2) ──
// Self-contained module. Imports from state.js, charsheet.js and util.js.
// Visibility is gated (book 375 only) by the caller in boot.js via
// setSim375Visible().
// To remove: delete this file, remove its import line and initSim375()/
// setSim375Visible() calls from boot.js, remove 'sim375' from
// SIM_HISTORY_KEYS in server/db/xp.js, and remove the .bsim-* CSS (shared
// with the other battlesim*.js files, so only remove it if all are gone).
//
// NOT a Fighting Fantasy SKILL/STAMINA/LUCK system - this book (rules text
// "ПРАВИЛА НА ИГРАТА"/"СРАЖЕНИЯ") uses THREE independent technique scores
// (удар с ръка/Hand, удар с крак/Kick, хвърляне/Throw), each starting at 0
// and boosted once by an on-paper 1d6 chargen roll before play begins - the
// three fields below are free-entry, not re-rolled here. Shuriken-jutsu
// (шурикен-джуцу) is a fourth, separate ranged option with its own 5-count
// resource and no technique score of its own.
//
// This book (book 2 of the series) prints NO rules recap of its own - it
// opens directly into story at §1 assuming the reader already owns book 1
// (Узурпатор!/The Usurper, book 370, already built) and carries its combat
// stats over. Confirmed identical mechanic from this book's own in-story
// stat-block format ("[NAME] Защита срещу [техника] «[име]»: N Издръжливост:
// N Щети: N зар[+N]", matching book 370's exactly) rather than from a rules
// section, since none exists here. Combat math below is book 370's
// documented rules, reconstructed from THAT book's rules text (§"УДАР С
// РЪКА"/"УДАР С КРАК"/"ХВЪРЛЯНЕ"/"БЛОК"/"ВЪТРЕШНА СИЛА") and cross-checked
// against ~25 in-story stat blocks in this book:
//   - To-hit: roll 2d6 + the chosen technique's score (0 for Shuriken, which
//     has no score of its own); hit if the total exceeds the enemy's stated
//     Defense for that technique in that encounter (Defense varies per
//     branch even for the same named enemy, so it's a free-entry field per
//     fight, not looked up automatically beyond an initial autocomplete fill).
//   - Damage on a Hand/Kick/Shuriken hit: re-roll 1d6, add it to the RAW 2d6
//     to-hit roll (i.e. the two dice alone, not the technique-score-boosted
//     total) - this is a genuinely ambiguous reading of "прибави полученото
//     число към вече получения сбор от двата зара" ("add it to the sum
//     already obtained from the two dice"), since the rules describe the
//     technique score as a hit/miss modifier only (§"ТОЧКИ ЗА УДАР С РЪКА"),
//     never as part of the damage sum. Kick adds +2 to this damage sum
//     (explicitly stated as a flat bonus, distinct from Throw's bonus).
//   - Throw: on a hit, the enemy takes ZERO direct damage; the player
//     instead gets an immediate free follow-up attack (Hand or Kick). The
//     rules don't give a separate Defense number for this follow-up, so it
//     rolls against the SAME enemy Defense value already entered for that
//     technique this fight ("по-лесно е да удариш" - "easier to hit" - is
//     flavour text only, no numeric ease bonus is ever given). If the
//     follow-up lands, add +2 to its damage (on top of Kick's own +2, if
//     Kick was chosen). If the follow-up misses, nothing further happens -
//     the rules only describe the success branch.
//   - Throw miss: the general rules summary states the player's defense is
//     reduced for the enemy's counterattack ("защитата ти ще се намали,
//     тъй като оставаш открит за нападение") but NEVER gives a number
//     anywhere in the rules text or the two worked examples. Left
//     unquantified here - the enemy counterattack after a Throw miss uses
//     the player's normal per-battle Defense field, same as any other miss.
//     Flag this to the player narratively if it matters at the table.
//   - Enemy counterattack (after any player miss, or a hit that doesn't
//     finish the enemy - rules text and worked example both confirm a miss
//     immediately triggers this, not just a survived hit): roll 2d6; if it
//     exceeds the player's stated Defense for this battle, the player is
//     hit for the enemy's stated damage formula (N dice + flat bonus, e.g.
//     "1 зар + 2" - independent of any roll sums, unlike the player's own
//     damage-dealing formula above).
//   - Block (offered only after being hit, before damage is applied): roll
//     2d6; if LESS than the player's Defense for this battle, the hit is
//     fully avoided. Whether the block succeeds or fails, the player's
//     Hand/Kick/Throw scores all drop by 2 for their next attack only (a
//     one-shot flag consumed by the next Attack click, not a permanent
//     stat change) - Shuriken has no score to reduce, so choosing Shuriken
//     next just consumes the flag with no effect, per a literal reading of
//     "точки за удар с ръка, крак или хвърляне" (Shuriken isn't listed).
//   - Inner Force: may be spent (1 point, lost regardless of outcome, floor
//     0) right before any to-hit roll to double the total damage sum if the
//     attack lands. Toggled per-attack via a checkbox, auto-cleared after
//     each Attack click.
//   - Съдба (Fate) is explicitly narrative-only per this book's own rules
//     text and is NOT modeled here - there is no in-combat use of it.
//
// Deliberately NOT modeled: the first worked example's "-5 to Hand Strike
// for simply missing" line (0-5=-5) - this appears nowhere in the general
// rules (УДАР С РЪКА/ТОЧКИ ЗА УДАР С РЪКА never describe a miss penalty,
// only Block does, at a stated -2), so it reads as an anomaly specific to
// that one worked example rather than a generalizable rule, and applying an
// unstated -5 penalty to every plain miss would make the character
// unplayably weak within a few fights.
//
// book_enemies column reuse for this book's stat shape (documented since it
// doesn't match the plain attack/defense/hp used elsewhere): hp = Издръжливост
// (Endurance, confirmed identical across every branch of a given named
// enemy); attack = a representative starting Defense value (this book's
// enemies are fought via different named techniques on different branches,
// each with its own Defense - this is just an autocomplete-fill default for
// the Hand-strike Defense field, not a canonical number - every Defense
// field must still be re-entered per encounter from the section text);
// pb = the enemy's damage dice count, defense = the enemy's flat damage
// bonus (together reconstructing "Щети: {pb} зара + {defense}").
//
// Data gaps:
//   - Бойно псе / Battle Dogs (§268, §284, §327 - all three branches lead to
//     the same §353, confirming they're the same underlying two-dog fight
//     narrated via different technique choices, not three separate fights):
//     Endurance is genuinely inconsistent across the three tellings -
//     §268 gives 14/12 (first/second dog), §284 gives 14/16, §327 (a single
//     "БОЙНО ПСЕ") gives 12. Seeded as two dogs at 14/12 (§268's numbers,
//     the lower/more conservative reading) rather than guessing which
//     retelling is the "correct" one - flagged here, not silently averaged.
//   - Хання (Hannya, the story's main antagonist) is NOT a standard fight
//     and is NOT seeded into book_enemies: she has no Endurance/Defense
//     stat block anywhere in the text. She's defeated via a scripted
//     sequence instead (survive a Luck-gated mind-control check via
//     §293/§390, then land one specific dagger or Inner-Force punch attack
//     at §247/§298) - this project's sims model round-based Endurance
//     combat, not mind-control/scripted-kill story branches, so she's
//     deliberately left out rather than forced into a shape that doesn't
//     fit (same reasoning as the Forbidden Gateway duology being ruled out
//     as sim candidates entirely for the same kind of single-check combat).
//   - Крал на таласъмите's companion "Танцуващ меч" (Dancing Sword, §275/
//     §306) has a stated Damage line but "-" for both Defense and
//     Endurance - it can't be targeted/killed directly, only the King can;
//     not seeded as its own book_enemies row, folded into the King's entry
//     as flavor context only (its damage is a passive second attack the
//     player must defend against alongside the King's, not modeled as a
//     separate combatant to fight).
//
// All state lives in pt.sim375, per-user/per-book via currentPlaythrough().

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
  if (!pt.sim375) {
    pt.sim375 = {
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
  const d = pt.sim375;
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
function _techLabel(tech) { return t(`battlesim375.ui.tech_${tech}`); }

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
    _appendLog(d, t('battlesim375.log.enemy_hits_pending', { enemy: _enemyNameSafe(d), roll: enemyRoll, defense: d.player.defense, dmg }));
  } else {
    _appendLog(d, t('battlesim375.log.enemy_misses', { enemy: _enemyNameSafe(d), roll: enemyRoll, defense: d.player.defense }));
  }
}

function _applyEnemyDefeat(d) {
  if (d.enemy.enduranceMax > 0 && d.enemy.endurance <= 0) {
    _appendLog(d, t('battlesim375.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
    return true;
  }
  return false;
}

function _applyPlayerFall(d) {
  if (d.player.endurance <= 0) {
    _appendLog(d, t('battlesim375.log.fallen', { skull: SVG_SKULL }));
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

  _appendLog(d, t('battlesim375.log.attack', { tech: _techLabel(tech), enemy: _enemyNameSafe(d), raw, score, total, defense }));

  if (tech === 'shuriken') d.player.shurikens = Math.max(0, d.player.shurikens - 1);

  if (!hit) {
    _appendLog(d, t('battlesim375.log.miss', { tech: _techLabel(tech) }));
    _enemyCounter(d);
    saveState();
    _renderAll();
    return;
  }

  if (tech === 'throw') {
    _appendLog(d, t('battlesim375.log.throw_lands'));
    d.pendingThrowFollowup = true;
    saveState();
    _renderAll();
    return;
  }

  let dmg = raw + _roll1d6();
  if (tech === 'kick') dmg += 2;
  if (useIF) dmg *= 2;
  d.enemy.endurance = Math.max(0, d.enemy.endurance - dmg);
  _appendLog(d, t('battlesim375.log.you_hit', { tech: _techLabel(tech), enemy: _enemyNameSafe(d), n: dmg, endurance: d.enemy.endurance, enduranceMax: d.enemy.enduranceMax, innerForce: useIF ? t('battlesim375.log.inner_force_tag') : '' }));

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

  _appendLog(d, t('battlesim375.log.followup_attack', { tech: _techLabel(tech), enemy: _enemyNameSafe(d), raw, score, total, defense }));

  if (!hit) {
    _appendLog(d, t('battlesim375.log.followup_miss', { tech: _techLabel(tech) }));
    saveState();
    _renderAll();
    return;
  }

  let dmg = raw + _roll1d6() + 2;
  if (tech === 'kick') dmg += 2;
  d.enemy.endurance = Math.max(0, d.enemy.endurance - dmg);
  _appendLog(d, t('battlesim375.log.you_hit', { tech: _techLabel(tech), enemy: _enemyNameSafe(d), n: dmg, endurance: d.enemy.endurance, enduranceMax: d.enemy.enduranceMax, innerForce: '' }));

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
    _appendLog(d, t('battlesim375.log.block_success', { roll, defense: d.player.defense }));
  } else {
    d.player.endurance = Math.max(0, d.player.endurance - dmg);
    _appendLog(d, t('battlesim375.log.block_fail', { roll, defense: d.player.defense, n: dmg, endurance: d.player.endurance, enduranceMax: d.player.enduranceInitial }));
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
  _appendLog(d, t('battlesim375.log.take_hit', { n: dmg, endurance: d.player.endurance, enduranceMax: d.player.enduranceInitial }));
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
  if (d.log.length) _appendLog(d, t('battlesim375.log.reset_sep'));
  _appendLog(d, t('battlesim375.log.reset', { enemy: _enemyNameSafe(d) }));
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
      `<li role="option" id="${dropdownId}-opt-${i}" data-idx="${i}">${escapeHtml(e.name)}<span class="ac-sub">${t('battlesim375.ui.endurance')}:${e.hp ?? '?'}</span></li>`
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

  _setVal('sim375-player-endurance', p.endurance);
  _setVal('sim375-player-endurancemax', p.enduranceInitial);
  _setVal('sim375-player-innerforce', p.innerForce);
  _setVal('sim375-player-innerforcemax', p.innerForceInitial);
  _setVal('sim375-player-hand', p.hand);
  _setVal('sim375-player-kick', p.kick);
  _setVal('sim375-player-throw', p.throw);
  _setVal('sim375-player-shurikens', p.shurikens);
  _setVal('sim375-player-defense', p.defense);

  if (!skipEnemyPick) _setVal('sim375-enemy-pick', e.name);
  _setVal('sim375-enemy-endurance', e.endurance);
  _setVal('sim375-enemy-endurancemax', e.enduranceMax);
  _setVal('sim375-enemy-dmgdice', e.dmgDice);
  _setVal('sim375-enemy-dmgbonus', e.dmgBonus);
  _setVal('sim375-enemy-defhand', e.defHand);
  _setVal('sim375-enemy-defkick', e.defKick);
  _setVal('sim375-enemy-defthrow', e.defThrow);
  _setVal('sim375-enemy-defshuriken', e.defShuriken);

  const techSel = document.getElementById('sim375-technique');
  if (techSel) techSel.value = d.technique;
  const ifCheck = document.getElementById('sim375-innerforce-use');
  if (ifCheck) ifCheck.checked = d.useInnerForce;

  const busy = _busy(d);
  const over = _battleOver(d);
  document.getElementById('sim375-attack').disabled = busy || over;
  document.getElementById('sim375-technique').disabled = busy || over;
  document.getElementById('sim375-innerforce-use').disabled = busy || over || p.innerForce <= 0;

  const hitPrompt = document.getElementById('sim375-hit-prompt');
  hitPrompt.style.display = d.pendingEnemyHit ? '' : 'none';
  if (d.pendingEnemyHit) {
    document.getElementById('sim375-hit-prompt-text').textContent = t('battlesim375.ui.hit_prompt', { n: d.pendingEnemyHit.dmg });
  }

  const followupPrompt = document.getElementById('sim375-followup-prompt');
  followupPrompt.style.display = d.pendingThrowFollowup ? '' : 'none';

  const status = document.getElementById('sim375-status');
  if (p.endurance <= 0) status.innerHTML = t('battlesim375.status.fallen', { skull: SVG_SKULL });
  else if (e.enduranceMax > 0 && e.endurance <= 0) status.innerHTML = t('battlesim375.status.victory', { trophy: SVG_TROPHY });
  else status.innerHTML = '';

  const penaltyNote = document.getElementById('sim375-penalty-note');
  penaltyNote.style.display = p.blockPenaltyPending ? '' : 'none';
}

function _renderLog() {
  const d = _data();
  const el = document.getElementById('sim375-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderHistory() {
  const d      = _data();
  const sumEl  = document.getElementById('sim375-history-summary');
  const listEl = document.getElementById('sim375-history-list');
  if (!d || !sumEl || !listEl) return;
  sumEl.textContent = t('battlesim375.history.summary', { n: d.history.length });
  if (!d.history.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim375.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = d.history.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim375.history.won') : t('battlesim375.history.lost');
    const date   = new Date(h.ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">${t('battlesim375.ui.endurance')} ${h.playerEndurance}/${h.playerEnduranceMax} · ${date}</span>
    </div>`;
  }).join('');
}

function _renderAll() {
  _renderInputs(true);
  _renderLog();
  _renderHistory();
}

export function renderSim375() {
  const overlay = document.getElementById('sim375-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim375(); return; }
  _renderAll();
}

function openSim375() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim375-overlay').classList.add('active');
}

function closeSim375() {
  document.getElementById('sim375-overlay')?.classList.remove('active');
}

export function setSim375Visible(visible) {
  const btn = document.getElementById('sim375-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim375();
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

export function initSim375() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim375-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('battlesim375.ui.title')}</span>
        <button id="sim375-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim375.ui.you')}</div>
            ${_numField(t('battlesim375.ui.endurance'), 'sim375-player-endurance')}
            ${_numField(t('battlesim375.ui.endurance_initial'), 'sim375-player-endurancemax')}
            ${_numField(t('battlesim375.ui.innerforce'), 'sim375-player-innerforce')}
            ${_numField(t('battlesim375.ui.innerforce_initial'), 'sim375-player-innerforcemax')}
            ${_numField(t('battlesim375.ui.hand'), 'sim375-player-hand')}
            ${_numField(t('battlesim375.ui.kick'), 'sim375-player-kick')}
            ${_numField(t('battlesim375.ui.throw'), 'sim375-player-throw')}
            ${_numField(t('battlesim375.ui.shurikens'), 'sim375-player-shurikens')}
            ${_numField(t('battlesim375.ui.player_defense'), 'sim375-player-defense')}
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim375.ui.enemy')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim375.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim375-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim375-enemy-pick-dropdown">
                <ul id="sim375-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim375.ui.endurance'), 'sim375-enemy-endurance')}
            ${_numField(t('battlesim375.ui.endurance_max'), 'sim375-enemy-endurancemax')}
            ${_numField(t('battlesim375.ui.dmg_dice'), 'sim375-enemy-dmgdice')}
            ${_numField(t('battlesim375.ui.dmg_bonus'), 'sim375-enemy-dmgbonus')}
            ${_numField(t('battlesim375.ui.def_hand'), 'sim375-enemy-defhand')}
            ${_numField(t('battlesim375.ui.def_kick'), 'sim375-enemy-defkick')}
            ${_numField(t('battlesim375.ui.def_throw'), 'sim375-enemy-defthrow')}
            ${_numField(t('battlesim375.ui.def_shuriken'), 'sim375-enemy-defshuriken')}
          </div>
          <div class="inv-edit-row">
            <span class="inv-edit-label bsim-stat-label">${t('battlesim375.ui.technique')}</span>
            <select id="sim375-technique" class="inv-edit-input">
              <option value="hand">${t('battlesim375.ui.tech_hand')}</option>
              <option value="kick">${t('battlesim375.ui.tech_kick')}</option>
              <option value="throw">${t('battlesim375.ui.tech_throw')}</option>
              <option value="shuriken">${t('battlesim375.ui.tech_shuriken')}</option>
            </select>
          </div>
          <div class="inv-edit-row">
            <label class="inv-edit-check-label"><input type="checkbox" id="sim375-innerforce-use" class="inv-edit-check"> ${t('battlesim375.ui.innerforce_use_toggle')}</label>
          </div>
          <div id="sim375-penalty-note" class="bsim-status" style="display:none">${t('battlesim375.ui.penalty_note')}</div>
          <div id="sim375-status" class="bsim-status"></div>
          <div id="sim375-hit-prompt" class="inv-edit-row bsim-heal-row" style="display:none">
            <span id="sim375-hit-prompt-text" class="inv-edit-label bsim-stat-label"></span>
            <button id="sim375-block" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim375.btn.block')}</button>
            <button id="sim375-take-hit" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim375.btn.take_hit')}</button>
          </div>
          <div id="sim375-followup-prompt" class="inv-edit-row bsim-heal-row" style="display:none">
            <span class="inv-edit-label bsim-stat-label">${t('battlesim375.ui.followup_prompt')}</span>
            <button id="sim375-followup-hand" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim375.ui.tech_hand')}</button>
            <button id="sim375-followup-kick" class="inv-edit-done bsim-heal-btn" type="button">${t('battlesim375.ui.tech_kick')}</button>
          </div>
          <div class="inv-modal-ftr">
            <button id="sim375-attack" class="inv-add-btn bsim-action-primary">${t('battlesim375.btn.attack')}</button>
            <button id="sim375-reset" class="inv-add-btn">${t('battlesim375.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary id="sim375-history-summary">${t('battlesim375.history.summary', { n: 0 })}</summary>
            <div id="sim375-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim375-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim375-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim375);
  document.getElementById('sim375-close').addEventListener('click', closeSim375);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim375(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim375-overlay'),
    open:  openSim375,
    close: closeSim375,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim375();
  });

  document.getElementById('sim375-attack').addEventListener('click', _attack);
  document.getElementById('sim375-reset').addEventListener('click', _resetBattle);
  document.getElementById('sim375-block').addEventListener('click', _block);
  document.getElementById('sim375-take-hit').addEventListener('click', _takeHit);
  document.getElementById('sim375-followup-hand').addEventListener('click', () => _throwFollowup('hand'));
  document.getElementById('sim375-followup-kick').addEventListener('click', () => _throwFollowup('kick'));

  document.getElementById('sim375-technique').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.technique = e.target.value;
    saveState();
  });
  document.getElementById('sim375-innerforce-use').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.useInnerForce = e.target.checked;
    saveState();
  });

  document.getElementById('sim375-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });
  _setupAutocomplete('sim375-enemy-pick', 'sim375-enemy-pick-dropdown', enemy => {
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
    'sim375-player-endurance': ['player', 'endurance'], 'sim375-player-endurancemax': ['player', 'enduranceInitial'],
    'sim375-player-innerforce': ['player', 'innerForce'], 'sim375-player-innerforcemax': ['player', 'innerForceInitial'],
    'sim375-player-hand': ['player', 'hand'], 'sim375-player-kick': ['player', 'kick'], 'sim375-player-throw': ['player', 'throw'],
    'sim375-player-shurikens': ['player', 'shurikens'], 'sim375-player-defense': ['player', 'defense'],
    'sim375-enemy-endurance': ['enemy', 'endurance'], 'sim375-enemy-endurancemax': ['enemy', 'enduranceMax'],
    'sim375-enemy-dmgdice': ['enemy', 'dmgDice'], 'sim375-enemy-dmgbonus': ['enemy', 'dmgBonus'],
    'sim375-enemy-defhand': ['enemy', 'defHand'], 'sim375-enemy-defkick': ['enemy', 'defKick'],
    'sim375-enemy-defthrow': ['enemy', 'defThrow'], 'sim375-enemy-defshuriken': ['enemy', 'defShuriken'],
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

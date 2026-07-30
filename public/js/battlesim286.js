// ── Battle Simulator (В лабиринта на времето, book 286) ─────────────────────
// Self-contained module. Imports from state.js, play.js, charsheet.js and util.js.
// Visibility is gated (book 286 only) by the caller in boot.js via
// setSim286Visible().
// To remove: delete this file, remove its import line and initSim286()/
// setSim286Visible() calls from boot.js, and remove the .bsim-* CSS (shared
// with battlesim8.js/battlesim829.js, so only remove it if all three are gone).
//
// Rules differ from book 829's opposed Attack/Defense system: book 286 uses a
// flat weapon "minimum hit" threshold - damage = max(0, 2d6 - minHit) - with
// shields subtracting a flat amount from incoming enemy damage instead. All
// state lives in pt.sim286, per-user/per-book via currentPlaythrough().

import { currentPlaythrough, saveState, apiFetch, currentBookId } from './state.js?v=11';
import { showAlert } from './play.js?v=49';
import { getPlayBtnRow } from './charsheet.js?v=41';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from './util.js?v=22';
import { t } from './i18n.js?v=19';

// Book rule: initial life roll (2d6×4) plus up to 2 rerolls, 3 throws total per run.
const MAX_LIFE_ROLLS = 3;

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

// ── Reference data ───────────────────────────────────────────────────────────

// Weapons: [key, label, minHit, energyCost (АЕ)]. 'glove' is the special
// silovata rakavitsa case (locked minHit 4, always +5 bonus damage, even on a
// roll of exactly 4) - given to the player directly by Eternor, outside the
// АЕ-budgeted equipment list, so it costs 0. 'custom' has no fixed cost either
// - the player sets their own via a stepper (see FIELD_MAP's customAeCost).
const WEAPONS = [
  ['sword',   'Меч',      6, 20],
  ['mace',    'Боздуган', 5, 20],
  ['halberd', 'Алебарда', 6, 15],
  ['dagger',  'Кинжал',   7, 5],
  ['machete', 'Мачете',   6, 7],
  ['rapier',  'Шпага',    5, 11],
  ['harpoon', 'Харпун',   7, 2],
  ['axe',     'Брадва',   7, 2],
  ['glove',   'Силова ръкавица (мин. 4, +5 щети)', 4, 0],
  ['custom',  'Друго (ръчно)', null, null],
];

// Shields: [key, label, defense reduction (negative), energyCost (АЕ)].
const SHIELDS = [
  ['none',   'Няма', 0, 0],
  ['small',  'Малък щит (-2)', -2, 50],
  ['medium', 'Среден щит (-3)', -3, 100],
  ['large',  'Голям щит (-4)', -4, 120],
];

// Tech gadgets. 'kind' drives _activateTech()'s behavior:
//   buff_shield  - extra -4 defense for the rest of the current battle
//   buff_next    - +10 damage on the player's next successful hit
//   stun         - enemy skips its next 3 attacks
//   double       - player attacks twice per round for the rest of the battle
//   direct       - immediate flat damage to the enemy, no roll needed once activated
//   revive       - resets the current battle back to its starting HP, once ever
// All items (except 'revive', which has its own fixed 15hp cost) cost 3hp per
// attempt and need a 2d6 roll >= 6 to succeed - whether or not the roll
// succeeds, that attempt still counts against maxUses.
const TECH_ITEMS = [
  { key: 'shield_temp', name: 'Временен енергетичен щит', desc: 'До края на схватката отнема допълнителни 4 точки от всеки вражески удар.', kind: 'buff_shield', maxUses: 3 },
  { key: 'grav_shock',  name: 'Гравитационен шок',         desc: 'Прибавя 10 точки към следващия ти успешен удар.',                          kind: 'buff_next',   maxUses: 3 },
  { key: 'gas',         name: 'Упойващ газ',               desc: 'Противникът пропуска следващите 3 удара.',                                  kind: 'stun',        maxUses: 3 },
  { key: 'laser',       name: 'Лазер',                     desc: 'Поразява противника с 10 точки веднага.',                                   kind: 'direct',      maxUses: 3, damage: 10 },
  { key: 'time_accel',  name: 'Ускорител на времето',      desc: 'До края на схватката нанасяш по 2 удара на рунд.',                          kind: 'double',      maxUses: 3 },
  { key: 'blaster',     name: 'Бластер',                   desc: '10 заряда по 10 точки. Първият изстрел изисква активиране (роля + 3 ТЖ), после стреляй свободно.', kind: 'direct', maxUses: 10, damage: 10, charged: true },
  { key: 'raygun',      name: 'Лъчемет',                   desc: '2 заряда по 75 точки. Първият изстрел изисква активиране (роля + 3 ТЖ), после стреляй свободно.',  kind: 'direct', maxUses: 2,  damage: 75, charged: true },
  { key: 'dehronator',  name: 'Дехронатор',                desc: 'Връща схватката към нейното начало (пълно възстановяване на ТЖ на двама ви). Може да се използва само веднъж за цялата мисия.', kind: 'revive', maxUses: 1, cost: 15 },
];

// Dream outcomes when a troubled sleep (2d6 roll of 2-5) sends you into the
// "Област на съня" - the 2d6 sum on the follow-up roll (2-12) selects which
// of these 11 you land in, matching the book's own numbering exactly.
const DREAM_LABELS = {
  2:  'Хроноцентърът избухва',
  3:  'Медицински център на бъдещето',
  4:  'Необитаем остров',
  5:  'Черният кактус',
  6:  'Арената на Нерон',
  7:  'Курорт на бъдещето',
  8:  'Полет с извънземни',
  9:  'Безформени кошмари',
  10: 'Освобождаването на д\'Артанян',
  11: 'Кошмари',
  12: 'Горската колиба',
};

function _data() {
  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim286) {
    pt.sim286 = {
      // life/lifeMax/aeMax all start at 0, not some generous placeholder -
      // the book requires throwing dice for both before you have any stats
      // at all, so the sim shouldn't hand out free points before that roll.
      player: { life: 0, lifeMax: 0, weaponKey: 'sword', customMinHit: 6, customAeCost: 0, shieldKey: 'none', aeMax: 0, enemyFirst: false, gloveBonus: 5, extraDef: 0 },
      enemy:  { name: '', hp: 20, hpMax: 20, minHit: 6 },
      battleStart: { playerLife: 0, enemyHp: 20 },
      effects: { tempShield: false, doubleAttack: false, pendingBonus: 0, enemyStun: 0 },
      roundsThisBattle: 0,
      healUsedThisBattle: false,
      lifeRollCount: 0,
      aeRolled: false,
      tech: {},
      dehronatorUsed: false,
      log: [],
      history: [],
    };
  }
  const d = pt.sim286;
  if (!d.effects) d.effects = { tempShield: false, doubleAttack: false, pendingBonus: 0, enemyStun: 0 };
  if (!d.tech) d.tech = {};
  if (!d.battleStart) d.battleStart = { playerLife: d.player.life, enemyHp: d.enemy.hp };
  if (d.dehronatorUsed === undefined) d.dehronatorUsed = false;
  if (!d.history) d.history = [];
  if (d.player.aeMax === undefined) d.player.aeMax = 0;
  if (d.player.customAeCost === undefined) d.player.customAeCost = 0;
  if (d.player.enemyFirst === undefined) d.player.enemyFirst = false;
  if (d.player.gloveBonus === undefined) d.player.gloveBonus = 5;
  if (d.player.extraDef === undefined) d.player.extraDef = 0;
  if (d.lifeRollCount === undefined) d.lifeRollCount = 0;
  if (d.aeRolled === undefined) d.aeRolled = false;
  if (d.roundsThisBattle === undefined) d.roundsThisBattle = 0;
  if (d.healUsedThisBattle === undefined) d.healUsedThisBattle = false;
  // Migration: saves from before life/AE required an explicit roll can carry
  // a nonzero lifeMax/aeMax from the old always-free starting defaults with
  // lifeRollCount/aeRolled still at their untouched zero/false - retroactively
  // gating those behind _notReady() would freeze an in-progress playthrough
  // that never needed to touch the roll buttons. Grandfather each stat in
  // independently the first time it's seen already-set this way; a no-op for
  // saves that legitimately rolled, since the roll handlers set both fields together.
  if (d.lifeRollCount === 0 && d.player.lifeMax > 0) d.lifeRollCount = 1;
  if (!d.aeRolled && d.player.aeMax > 0) d.aeRolled = true;
  for (const item of TECH_ITEMS) {
    if (!d.tech[item.key]) d.tech[item.key] = { usesLeft: item.maxUses, activated: false };
  }
  return d;
}

// True until the player has thrown both starting-life and starting-AE dice -
// combat, healing, sleep, and tech gadgets all stay locked out until then,
// same as the book requires those rolls before you have any stats to act with.
function _notReady(d) {
  return d.lifeRollCount === 0 || !d.aeRolled;
}

// Current loadout's total energy cost (weapon + shield). Tech gadgets and the
// power glove sit outside the АЕ-budgeted equipment list per the book's own
// framing (Eternor hands those over separately), so they're excluded here.
function _loadoutAE(d) {
  const w = WEAPONS.find(w => w[0] === d.player.weaponKey);
  const s = SHIELDS.find(s => s[0] === d.player.shieldKey);
  const weaponAE = w ? (w[0] === 'custom' ? (d.player.customAeCost || 0) : w[3]) : 0;
  const shieldAE = s ? s[3] : 0;
  return weaponAE + shieldAE;
}

function _roll2d6() { return 2 + Math.floor(Math.random() * 6) + Math.floor(Math.random() * 6); }
function _roll1d6() { return 1 + Math.floor(Math.random() * 6); }

function _appendLog(d, line) {
  d.log.push(line);
  if (d.log.length > 250) d.log.shift();
}

function _enemyName(d) { return d.enemy.name.trim() || 'противникът'; }
// Escaped variant for log lines, which get dumped into innerHTML in
// _renderLog() - the enemy name is free-text player input, so an unescaped
// "<img src=x onerror=...>" would execute. _recordOutcome()'s history.enemy
// deliberately stays unescaped - _renderHistory() already escapes it once at
// render time, and escaping here too would double-escape it there.
function _enemyNameSafe(d) { return escapeHtml(_enemyName(d)); }

function _weaponMinHit(d) {
  const w = WEAPONS.find(w => w[0] === d.player.weaponKey);
  if (!w) return 6;
  return w[0] === 'custom' ? (d.player.customMinHit || 0) : w[2];
}
function _weaponIsGlove(d) { return d.player.weaponKey === 'glove'; }
function _shieldDef(d) {
  const s = SHIELDS.find(s => s[0] === d.player.shieldKey);
  return s ? s[2] : 0;
}
// d.player.extraDef is stored as a positive "how many points" value (matching
// how the book states shield/armor protection before the minus sign) so it
// can reuse the shared non-negative stepper - negated here, same sign
// convention as _shieldDef(). Covers found items that stack with the equipped
// shield (e.g. the "скафандър с повишена защита" spacesuit, -2, found at
// section 156 - the text explicitly says it adds to whatever shield you carry).
function _totalPlayerDef(d) {
  return _shieldDef(d) + (d.effects.tempShield ? -4 : 0) - (d.player.extraDef || 0);
}

// ── Combat resolution ─────────────────────────────────────────────────────

// One player attack roll: max(0, roll - minHit), + glove's flat +5 bonus
// (applies even when roll lands exactly on the minimum, or +10 instead of +5
// against the final boss, if the player took the alien's offer to upgrade it
// at section 181), + any pending one-shot tech bonus (gravity shock),
// consumed on the first successful hit.
function _playerAttackOnce(d) {
  const roll   = _roll2d6();
  const minHit = _weaponIsGlove(d) ? 4 : _weaponMinHit(d);
  let dmg = Math.max(0, roll - minHit);
  const hit = _weaponIsGlove(d) ? roll >= 4 : roll > minHit;
  if (hit && _weaponIsGlove(d)) dmg += d.player.gloveBonus;
  if (hit && d.effects.pendingBonus > 0) {
    dmg += d.effects.pendingBonus;
    d.effects.pendingBonus = 0;
  }
  if (!hit) dmg = 0;
  d.enemy.hp = Math.max(0, d.enemy.hp - dmg);
  _appendLog(d, dmg > 0
    ? `Хвърляш: ${roll} (мин. ${minHit}) → Удар за ${dmg}. ТЖ на ${_enemyNameSafe(d)}: ${d.enemy.hp}/${d.enemy.hpMax}.`
    : `Хвърляш: ${roll} (мин. ${minHit}) → Пропуск.`);
}

function _enemyAttackOnce(d) {
  if (d.effects.enemyStun > 0) {
    d.effects.enemyStun--;
    _appendLog(d, `${_enemyNameSafe(d)} е зашеметен от газа и пропуска удара си.`);
    return;
  }
  const roll = _roll2d6();
  const raw  = Math.max(0, roll - (d.enemy.minHit || 0));
  const dmg  = Math.max(0, raw + _totalPlayerDef(d));
  if (dmg > 0) {
    d.player.life = Math.max(0, d.player.life - dmg);
    _appendLog(d, `${_enemyNameSafe(d)} хвърля: ${roll} (мин. ${d.enemy.minHit}) → Удар за ${dmg}. Твоето ТЖ: ${d.player.life}/${d.player.lifeMax}.`);
  } else {
    _appendLog(d, `${_enemyNameSafe(d)} хвърля: ${roll} (мин. ${d.enemy.minHit}) → Пропуск.`);
  }
}

function _recordOutcome(d, outcome, enemyNameOverride = null) {
  d.history.push({
    enemy: enemyNameOverride ?? _enemyName(d), outcome,
    enemyHpMax: d.enemy.hpMax, enemyMinHit: d.enemy.minHit,
    playerLife: d.player.life, playerLifeMax: d.player.lifeMax,
    ts: Date.now(),
  });
  if (d.history.length > 100) d.history.shift();
}

// Rule "Първи удар": the player strikes first by default - some episodes flip
// this (d.player.enemyFirst), in which case the enemy gets the opening blow
// each round instead, same alternation from then on.
function _runRound() {
  const d = _data();
  if (!d || _notReady(d) || d.player.life <= 0 || d.enemy.hp <= 0) return;
  d.roundsThisBattle = (d.roundsThisBattle || 0) + 1;

  if (d.player.enemyFirst) {
    _enemyAttackOnce(d);
    if (d.player.life <= 0) {
      _appendLog(d, `${SVG_SKULL} Ти падна в битката.`);
      _recordOutcome(d, 'loss');
      saveState();
      _renderAll();
      return;
    }
  }

  _playerAttackOnce(d);
  if (d.effects.doubleAttack && d.enemy.hp > 0) _playerAttackOnce(d);

  if (d.enemy.hp <= 0) {
    _appendLog(d, `${SVG_TROPHY} ${_enemyNameSafe(d)} е победен!`);
    _recordOutcome(d, 'win');
  } else if (!d.player.enemyFirst) {
    _enemyAttackOnce(d);
    if (d.player.life <= 0) {
      _appendLog(d, `${SVG_SKULL} Ти падна в битката.`);
      _recordOutcome(d, 'loss');
    }
  }

  saveState();
  _renderAll();
}

// Recovery rules 1+3: can't heal mid-fight (only before the first blow, or
// after the fight resolves, while resting up for the next one), and only
// once per battle-cycle - the closest analog to "once per episode" this sim
// can enforce, since it has no concept of the book's actual section numbers.
function _heal(amount) {
  const d = _data();
  if (!d || amount <= 0) return;
  if (_notReady(d)) {
    showAlert('Хвърли начални ТЖ и АЕ, преди да продължиш.');
    return;
  }
  if (d.roundsThisBattle > 0 && d.player.life > 0 && d.enemy.hp > 0) {
    showAlert('Не можеш да възстановяваш жизнени точки по време на сражение.');
    return;
  }
  if (d.healUsedThisBattle) {
    showAlert('Вече използва лечебно средство в тази среща - изчакай следващата.');
    return;
  }
  const before = d.player.life;
  d.player.life = Math.min(d.player.lifeMax, d.player.life + amount);
  d.healUsedThisBattle = true;
  _appendLog(d, `Възстановяваш ${amount} ТЖ: ${before} → ${d.player.life}/${d.player.lifeMax}.`);
  saveState();
  _renderAll();
}

function _resetBattle() {
  const d = _data();
  if (!d) return;
  d.enemy.hp    = d.enemy.hpMax;
  d.player.life = d.player.lifeMax;
  d.effects = { tempShield: false, doubleAttack: false, pendingBonus: 0, enemyStun: 0 };
  d.roundsThisBattle = 0;
  d.healUsedThisBattle = false;
  d.battleStart = { playerLife: d.player.life, enemyHp: d.enemy.hp };
  if (d.log.length) _appendLog(d, '──────────');
  _appendLog(d, `Схватката е нулирана. ТЖ на ${_enemyNameSafe(d)} и твоите ТЖ са възстановени.`);
  saveState();
  _renderAll();
}

// ── Tech gadgets ─────────────────────────────────────────────────────────────

function _activateTech(key) {
  const d = _data();
  if (!d) return;
  const item  = TECH_ITEMS.find(i => i.key === key);
  const state = d.tech[key];
  if (!item || !state || _notReady(d)) return;

  if (item.kind === 'revive') {
    if (d.dehronatorUsed || d.player.life <= 0) return;
    // The 15hp cost applies through the rewind, not before it - resetting to
    // battleStart.playerLife outright would silently erase the cost, since
    // that's an overwrite, not a delta.
    d.player.life = Math.max(0, d.battleStart.playerLife - item.cost);
    d.enemy.hp    = d.battleStart.enemyHp;
    d.dehronatorUsed = true;
    state.usesLeft = 0;
    _appendLog(d, `Дехронаторът връща схватката в началото ѝ. Цена: ${item.cost} ТЖ. Твоето ТЖ: ${d.player.life}/${d.player.lifeMax}.`);
    if (d.player.life <= 0) {
      _appendLog(d, `${SVG_SKULL} Цената на дехронатора те довършва.`);
      _recordOutcome(d, 'loss');
    }
    saveState();
    _renderAll();
    return;
  }

  // A decided battle (enemy already dead, or player already dead) must block
  // every path below - without this, firing an already-activated charged
  // weapon (or any other gadget) at a dead enemy re-triggers the 'win'/'loss'
  // check and appends a duplicate history entry for a fight that already ended.
  if (d.player.life <= 0 || d.enemy.hp <= 0) return;

  // Charged weapons (blaster/raygun): once activated, subsequent shots are
  // free fires with no roll and no attempt cap - the book explicitly exempts
  // these two from the general "3 attempts max" rule, giving them their own
  // charge counts (10/2) instead. usesLeft here means "shots remaining", not
  // "attempts remaining" - a failed activation costs HP but never a charge.
  if (item.charged && state.activated) {
    if (state.usesLeft <= 0) return;
    state.usesLeft--;
    d.enemy.hp = Math.max(0, d.enemy.hp - item.damage);
    _appendLog(d, `${item.name}: изстрел за ${item.damage} точки. ТЖ на ${_enemyNameSafe(d)}: ${d.enemy.hp}/${d.enemy.hpMax} (заряди: ${state.usesLeft}).`);
    if (d.enemy.hp <= 0) { _appendLog(d, `${SVG_TROPHY} ${_enemyNameSafe(d)} е победен!`); _recordOutcome(d, 'win'); }
    saveState();
    _renderAll();
    return;
  }

  if (item.charged) {
    if (state.usesLeft <= 0) return; // depleted before ever landing an activation roll
  } else if (state.usesLeft <= 0) {
    return; // items 1-5: 3 attempts total, win or lose
  }

  d.player.life = Math.max(0, d.player.life - 3);
  if (!item.charged) state.usesLeft--; // charged items: cost paid, but the attempt itself never spends a charge
  const roll = _roll2d6();
  const ok   = roll >= 6;
  if (!ok) {
    _appendLog(d, `${item.name}: опит за активиране (${roll}, трябва ≥6) → неуспех. -3 ТЖ.`);
  } else {
    switch (item.kind) {
      case 'buff_shield': d.effects.tempShield   = true; break;
      case 'buff_next':   d.effects.pendingBonus = 10;   break;
      case 'stun':        d.effects.enemyStun    = 3;    break;
      case 'double':      d.effects.doubleAttack = true; break;
      case 'direct':
        if (item.charged) { state.activated = true; state.usesLeft--; } // first shot spends its own charge
        d.enemy.hp = Math.max(0, d.enemy.hp - item.damage);
        break;
    }
    _appendLog(d, `${item.name}: активиране (${roll}) → успех. -3 ТЖ. ${item.desc}`);
    if (item.kind === 'direct') {
      _appendLog(d, `Поразяваш ${_enemyNameSafe(d)} за ${item.damage} точки. ТЖ: ${d.enemy.hp}/${d.enemy.hpMax}.`);
      if (d.enemy.hp <= 0) { _appendLog(d, `${SVG_TROPHY} ${_enemyNameSafe(d)} е победен!`); _recordOutcome(d, 'win'); }
    }
  }
  if (d.player.life <= 0) {
    _appendLog(d, `${SVG_SKULL} Ти падна в битката.`);
    _recordOutcome(d, 'loss');
  }
  saveState();
  _renderAll();
}

// ── Sleep / dream table ──────────────────────────────────────────────────────

function _sleepAttempt() {
  const d = _data();
  if (!d) return;
  if (_notReady(d)) {
    showAlert('Хвърли начални ТЖ и АЕ, преди да продължиш.');
    return;
  }
  // "Можеш да спиш във всеки епизод, освен когато си нападнат" - sleep is
  // blocked mid-fight for the same reason manual healing is.
  if (d.roundsThisBattle > 0 && d.player.life > 0 && d.enemy.hp > 0) {
    showAlert('Не можеш да спиш, докато си нападнат.');
    return;
  }
  const roll = _roll2d6();
  if (roll >= 6) {
    const before = d.player.life;
    d.player.life = Math.min(d.player.lifeMax, d.player.life + roll);
    _appendLog(d, `Спокоен сън: хвърляне ${roll} → ТЖ ${before} → ${d.player.life}/${d.player.lifeMax}.`);
    saveState();
    _renderAll();
    return;
  }
  _appendLog(d, `Тревожен сън: хвърляне ${roll} (2-5) → навлизаш в областта на сънищата.`);
  const dreamRoll = _roll2d6();
  _appendLog(d, `Хвърляне за съня: ${dreamRoll} → ${DREAM_LABELS[dreamRoll]}.`);
  _resolveDream(d, dreamRoll);
  saveState();
  _renderAll();
}

function _resolveDream(d, n) {
  const sleepLife = d.player.life; // life at the moment of falling asleep
  switch (n) {
    case 2: {
      const roll = _roll2d6();
      if (roll <= 7) { _appendLog(d, `Хвърляне ${roll} (2-7) → избягваш взрива, събуждаш се без промяна.`); }
      else { d.player.life = 0; _appendLog(d, `Хвърляне ${roll} (8-12) → хроноцентърът избухва. Попадаш на 11.`); }
      break;
    }
    case 3: {
      const roll = _roll2d6();
      if (roll >= 9 && roll <= 12) {
        d.player.life = Math.min(d.player.lifeMax, d.player.life + roll);
        _appendLog(d, `Медицински център: хвърляне ${roll} (9-12) → +${roll} ТЖ.`);
      } else {
        d.player.life = Math.max(0, d.player.life - roll);
        _appendLog(d, `Медицински център: хвърляне ${roll} (извън 9-12) → -${roll} ТЖ.`);
      }
      break;
    }
    case 4: {
      const days = _roll1d6();
      d.player.life = Math.max(0, d.player.life - days);
      _appendLog(d, `Необитаем остров: ${days} дни до спасяването → -${days} ТЖ.`);
      break;
    }
    case 5: {
      const sum  = _roll1d6() + _roll1d6() + _roll1d6();
      const loss = Math.floor(sum / 2);
      if (loss > sleepLife) {
        d.player.life = 0;
        _appendLog(d, `Черният кактус: губиш ${loss} ТЖ по пътя (сбор ${sum}/2) → не издържаш. Попадаш на 11.`);
      } else {
        d.player.life = sleepLife - loss;
        d.player.life = Math.min(d.player.lifeMax, d.player.life + 25);
        _appendLog(d, `Черният кактус: губиш ${loss} ТЖ по пътя, после пиеш от сока → +25 ТЖ. ТЖ: ${d.player.life}/${d.player.lifeMax}.`);
      }
      break;
    }
    case 6: {
      const netRoll = _roll2d6();
      if (netRoll >= 7) {
        _appendLog(d, `Арената на Нерон: мрежата хваща лъва (${netRoll}, 7-12) → победа без бой.`);
        break;
      }
      _appendLog(d, `Арената на Нерон: мрежата пропуска (${netRoll}) → бой до победа или гибел (лъв: 20 ТЖ, мин. 6; ти: -1 защита, мин. 5).`);
      let lionHp = 20;
      while (lionHp > 0 && d.player.life > 0) {
        const pr = _roll2d6();
        const pd = pr > 5 ? pr - 5 : 0;
        lionHp = Math.max(0, lionHp - pd);
        _appendLog(d, `  Удряш лъва: ${pr} → ${pd > 0 ? `удар за ${pd}, ТЖ на лъва: ${lionHp}` : 'пропуск'}.`);
        if (lionHp <= 0) break;
        const er = _roll2d6();
        const ed = er > 6 ? Math.max(0, (er - 6) - 1) : 0;
        d.player.life = Math.max(0, d.player.life - ed);
        _appendLog(d, `  Лъвът те удря: ${er} → ${ed > 0 ? `-${ed} ТЖ (${d.player.life}/${d.player.lifeMax})` : 'пропуск'}.`);
      }
      _appendLog(d, lionHp <= 0 ? `${SVG_TROPHY} Побеждаваш лъва.` : `${SVG_SKULL} Лъвът те поваля.`);
      break;
    }
    case 7: {
      d.player.life = Math.min(d.player.lifeMax, d.player.life + 15);
      _appendLog(d, `Курорт на бъдещето: чудесна почивка → +15 ТЖ.`);
      break;
    }
    case 8: {
      const years = _roll2d6() * 10;
      if (years < 100) {
        d.player.life = d.player.lifeMax;
        _appendLog(d, `Полет с извънземни: ${years} години → пристигаш навреме, пълно възстановяване.`);
      } else {
        d.player.life = 0;
        _appendLog(d, `Полет с извънземни: ${years} години → умираш от старост на борда. Попадаш на 11.`);
      }
      break;
    }
    case 9: {
      d.player.life = 0;
      _appendLog(d, `Безформени кошмари: не разбираш какво стана... събуждаш се на 11.`);
      break;
    }
    case 10: {
      _appendLog(d, `Освобождаването на д'Артанян: дуел с 4 гвардейци, по един удар всеки.`);
      for (let i = 1; i <= 4 && d.player.life > 0; i++) {
        const pr = _roll1d6(), gr = _roll1d6();
        if (pr > gr) {
          const gain = pr - gr;
          d.player.life = Math.min(d.player.lifeMax, d.player.life + gain);
          _appendLog(d, `  Гвардеец ${i}: ти ${pr} срещу ${gr} → +${gain} ТЖ.`);
        } else if (pr < gr) {
          const loss = gr - pr;
          d.player.life = Math.max(0, d.player.life - loss);
          _appendLog(d, `  Гвардеец ${i}: ти ${pr} срещу ${gr} → -${loss} ТЖ.`);
        } else {
          _appendLog(d, `  Гвардеец ${i}: равен резултат (${pr}) → преминаваш нататък.`);
        }
      }
      break;
    }
    case 11: {
      d.player.life = Math.max(0, d.player.life - 5);
      _appendLog(d, `Кошмари: събуждаш се с -5 ТЖ.`);
      break;
    }
    case 12: {
      d.player.life = Math.min(d.player.lifeMax, d.player.life + 18);
      _appendLog(d, `Горската колиба: билковото питие → +18 ТЖ.`);
      break;
    }
  }
  // Overrides the stale/unrelated enemy name that'd otherwise be pulled from
  // whatever was last fought for real - a dream death has nothing to do with it.
  if (d.player.life <= 0) _recordOutcome(d, 'loss', `Сън: ${DREAM_LABELS[n]}`);
}

// ── Render ────────────────────────────────────────────────────────────────

function _techButtonsHtml(d) {
  // Every gadget except the revive (dehronator) is blocked once the battle is
  // decided - see the matching guard in _activateTech(). Dehronator has its
  // own independent guard there (blocked only once already used, or once the
  // player is already dead - it doesn't care whether the enemy is already down).
  // Both also stay locked until the starting ТЖ/АЕ rolls are done (_notReady).
  const notReady = _notReady(d);
  const battleOver = notReady || d.player.life <= 0 || d.enemy.hp <= 0;
  return TECH_ITEMS.map(item => {
    const s = d.tech[item.key];
    const depleted = item.kind === 'revive'
      ? (s.usesLeft <= 0 || notReady || d.player.life <= 0)
      : (s.usesLeft <= 0 || battleOver);
    const label = item.kind === 'revive'
      ? `${item.name} (${item.cost} ТЖ)`
      : (item.charged && s.activated ? `${item.name} - изстрел` : `${item.name} - активирай`);
    return `<div class="bsim-tech-row${depleted ? ' bsim-tech-row--depleted' : ''}">
      <div class="bsim-tech-name">${escapeHtml(item.name)}</div>
      <div class="bsim-tech-desc">${escapeHtml(item.desc)}</div>
      <div class="bsim-tech-footer">
        <button class="inv-edit-done bsim-tech-btn" data-tech="${item.key}" ${depleted ? 'disabled' : ''}>${escapeHtml(label)}</button>
        <span class="bsim-tech-uses">${s.usesLeft}/${item.maxUses}</span>
      </div>
    </div>`;
  }).join('');
}

function _renderHistory() {
  const d = _data();
  const summaryEl = document.getElementById('sim286-history-summary');
  const listEl    = document.getElementById('sim286-history-list');
  if (!d || !summaryEl || !listEl) return;
  const hist = d.history;
  summaryEl.textContent = `История на битките (${hist.length})`;
  if (!hist.length) {
    listEl.innerHTML = '<div class="bsim-history-empty">Все още няма приключени битки.</div>';
    return;
  }
  listEl.innerHTML = hist.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? 'победа' : 'загуба';
    const date   = new Date(h.ts).toLocaleDateString('bg-BG', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="bsim-history-row">
      <span>${icon} ${escapeHtml(h.enemy)} - ${result}</span>
      <span class="bsim-history-meta">ТЖ ${h.playerLife}/${h.playerLifeMax} · ${date}</span>
    </div>`;
  }).join('');
}

function _renderLog() {
  const d  = _data();
  const el = document.getElementById('sim286-log');
  if (!el || !d) return;
  el.innerHTML = d.log.slice().reverse().join('<br>');
}

function _renderStatus() {
  const d  = _data();
  const el = document.getElementById('sim286-status');
  if (!d || !el) return;
  const notReady = _notReady(d);
  if (notReady)                el.innerHTML = 'Хвърли начални ТЖ и АЕ, за да започнеш.';
  else if (d.player.life <= 0) el.innerHTML = `${SVG_SKULL} Ти падна в битката.`;
  else if (d.enemy.hp <= 0)    el.innerHTML = `${SVG_TROPHY} Победа!`;
  else                         el.innerHTML = '';
  const over = notReady || d.player.life <= 0 || d.enemy.hp <= 0;
  document.getElementById('sim286-round').disabled = over;
  // Recovery rules 1+3: no healing mid-fight, and only once per battle-cycle.
  const midFight = d.roundsThisBattle > 0 && !over;
  document.getElementById('sim286-heal').disabled = over || midFight || d.healUsedThisBattle;
  // "Не можеш да спиш, докато си нападнат" - same mid-fight block as healing.
  document.getElementById('sim286-sleep').disabled = notReady || d.player.life <= 0 || midFight;
  _renderEffectsBadges(d);
}

function _renderEffectsBadges(d) {
  const el = document.getElementById('sim286-effects');
  if (!el) return;
  const badges = [];
  if (d.effects.tempShield)   badges.push('Временен щит активен');
  if (d.effects.doubleAttack) badges.push('Ускорено време: 2 удара/рунд');
  if (d.effects.pendingBonus > 0) badges.push(`Гравитационен бонус: +${d.effects.pendingBonus} на следващия удар`);
  if (d.effects.enemyStun > 0) badges.push(`Врагът е зашеметен (${d.effects.enemyStun} удара)`);
  el.textContent = badges.join(' · ');
}

function _renderInputs() {
  const d = _data();
  if (!d) return;

  document.getElementById('sim286-player-life').value    = Math.min(d.player.life, d.player.lifeMax);
  document.getElementById('sim286-player-lifemax').value = d.player.lifeMax;
  document.getElementById('sim286-enemy-first').checked  = d.player.enemyFirst;
  const lifeRollBtn = document.getElementById('sim286-life-roll');
  lifeRollBtn.disabled   = d.lifeRollCount >= MAX_LIFE_ROLLS;
  lifeRollBtn.textContent = `Хвърли начални ТЖ (2d6×4) - ${d.lifeRollCount}/${MAX_LIFE_ROLLS}`;
  const aeRollBtn = document.getElementById('sim286-ae-roll');
  aeRollBtn.disabled   = d.aeRolled;
  aeRollBtn.textContent = d.aeRolled ? 'Хвърлено (2d6×10)' : 'Хвърли (2d6×10)';
  document.getElementById('sim286-weapon').value  = d.player.weaponKey;
  document.getElementById('sim286-shield').value  = d.player.shieldKey;
  const customRow = document.getElementById('sim286-custom-minhit-row');
  if (customRow) customRow.style.display = d.player.weaponKey === 'custom' ? 'flex' : 'none';
  document.getElementById('sim286-custom-minhit').value = d.player.customMinHit;
  const customAeRow = document.getElementById('sim286-custom-ae-row');
  if (customAeRow) customAeRow.style.display = d.player.weaponKey === 'custom' ? 'flex' : 'none';
  document.getElementById('sim286-custom-ae').value = d.player.customAeCost;
  const gloveBonusRow = document.getElementById('sim286-glove-bonus-row');
  if (gloveBonusRow) gloveBonusRow.style.display = _weaponIsGlove(d) ? 'flex' : 'none';
  document.getElementById('sim286-glove-bonus').value = d.player.gloveBonus;
  document.getElementById('sim286-extra-def').value = d.player.extraDef;
  const aeSpent = _loadoutAE(d);
  const aeEl = document.getElementById('sim286-ae-display');
  if (aeEl) {
    aeEl.textContent = `${aeSpent} / ${d.player.aeMax} АЕ`;
    aeEl.classList.toggle('bsim-ae-over', aeSpent > d.player.aeMax);
  }

  document.getElementById('sim286-enemy-pick').value    = d.enemy.name;
  document.getElementById('sim286-enemy-hp').value      = d.enemy.hp;
  document.getElementById('sim286-enemy-hpmax').value   = d.enemy.hpMax;
  document.getElementById('sim286-enemy-minhit').value  = d.enemy.minHit;

  document.getElementById('sim286-tech-list').innerHTML = _techButtonsHtml(d);
  _renderStatus(); // also renders the effects badges, as its last step
}

function _renderAll() {
  _renderInputs();
  _renderLog();
  _renderHistory();
}

export function renderSim286() {
  const overlay = document.getElementById('sim286-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (!_data()) { closeSim286(); return; }
  _renderAll();
}

function openSim286() {
  if (!_data()) {
    showAlert(t('battlesim.no_active_playthrough'));
    return;
  }
  _renderAll();
  document.getElementById('sim286-overlay').classList.add('active');
}

function closeSim286() {
  document.getElementById('sim286-overlay')?.classList.remove('active');
}

export function setSim286Visible(visible) {
  const btn = document.getElementById('sim286-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
  if (!visible) closeSim286();
}

// ── Enemy autocomplete (reuses the /api/books/:id/enemies list - `attack`
// is repurposed here to mean "enemy minimum hit", since book 286's flat
// min-hit model has no opposed defense stat like book 829's) ────────────────

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

function _setupEnemyAutocomplete() {
  const input    = document.getElementById('sim286-enemy-pick');
  const dropdown = document.getElementById('sim286-enemy-pick-dropdown');
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
      `<li role="option" id="sim286-enemy-pick-opt-${i}" data-idx="${i}">${escapeHtml(e.name)}<span class="ac-sub">ТЖ:${e.hp ?? '?'} мин.:${e.attack ?? '?'}</span></li>`
    ).join('');
    activeIdx = -1;
    dropdown.classList.add('open');
    input.setAttribute('aria-expanded', 'true');
    input.removeAttribute('aria-activedescendant');
  }

  function select(enemy) {
    const d = _data();
    if (!d || !enemy) return;
    input.value = enemy.name;
    d.enemy.name = enemy.name;
    if (enemy.hp != null)     { d.enemy.hp = enemy.hp; d.enemy.hpMax = enemy.hp; }
    if (enemy.attack != null) d.enemy.minHit = enemy.attack;
    d.battleStart = { playerLife: d.player.life, enemyHp: d.enemy.hp };
    d.roundsThisBattle = 0;
    d.healUsedThisBattle = false;
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

function _checkField(label, id, note) {
  return `
    <div class="inv-edit-row">
      <span class="inv-edit-label bsim-stat-label">${label}</span>
      <input id="${id}" type="checkbox" class="inv-edit-check">
      <label for="${id}" class="inv-edit-check-label">${escapeHtml(note)}</label>
    </div>`;
}

export function initSim286() {
  const overlay = document.createElement('div');
  overlay.id        = 'sim286-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal bsim-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">Симулатор на битки</span>
        <button id="sim286-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">Ти</div>
            ${_numField('Точки живот (ТЖ)', 'sim286-player-life')}
            ${_numField('Максимум ТЖ',      'sim286-player-lifemax')}
            <div class="inv-edit-row bsim-life-roll-row">
              <button id="sim286-life-roll" class="inv-edit-done bsim-ae-roll-btn" type="button">Хвърли начални ТЖ (2d6×4)</button>
            </div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">Оръжие</span>
              <select id="sim286-weapon" class="inv-edit-input bsim-select">
                ${WEAPONS.map(w => `<option value="${w[0]}">${escapeHtml(w[1])}${w[3] != null ? ` (${w[3]} АЕ)` : ''}</option>`).join('')}
              </select>
            </div>
            <div id="sim286-custom-minhit-row" class="inv-edit-row" style="display:none">
              <span class="inv-edit-label bsim-stat-label">Минимум удар</span>
              <div class="inv-qty-wrap">
                <button class="inv-qty-btn" data-id="sim286-custom-minhit" data-delta="-1">−</button>
                <input id="sim286-custom-minhit" class="inv-edit-input inv-qty-input" type="text" inputmode="numeric">
                <button class="inv-qty-btn" data-id="sim286-custom-minhit" data-delta="1">+</button>
              </div>
            </div>
            <div id="sim286-custom-ae-row" class="inv-edit-row" style="display:none">
              <span class="inv-edit-label bsim-stat-label">Заряд (АЕ)</span>
              <div class="inv-qty-wrap">
                <button class="inv-qty-btn" data-id="sim286-custom-ae" data-delta="-1">−</button>
                <input id="sim286-custom-ae" class="inv-edit-input inv-qty-input" type="text" inputmode="numeric">
                <button class="inv-qty-btn" data-id="sim286-custom-ae" data-delta="1">+</button>
              </div>
            </div>
            <div id="sim286-glove-bonus-row" class="inv-edit-row" style="display:none">
              <span class="inv-edit-label bsim-stat-label" title="Обичайно +5, но някои срещи го намаляват (+1 до +3) или го увеличават (+10 срещу Огнената сянка, ако си приел ъпгрейда на 181)">Бонус на ръкавицата</span>
              <div class="inv-qty-wrap">
                <button class="inv-qty-btn" data-id="sim286-glove-bonus" data-delta="-1">−</button>
                <input id="sim286-glove-bonus" class="inv-edit-input inv-qty-input" type="text" inputmode="numeric">
                <button class="inv-qty-btn" data-id="sim286-glove-bonus" data-delta="1">+</button>
              </div>
            </div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label" title="Намери ли скафандър с повишена защита или подобен предмет, добави точките му тук - те се сумират с щита">Доп. защита</span>
              <div class="inv-qty-wrap">
                <button class="inv-qty-btn" data-id="sim286-extra-def" data-delta="-1">−</button>
                <input id="sim286-extra-def" class="inv-edit-input inv-qty-input" type="text" inputmode="numeric">
                <button class="inv-qty-btn" data-id="sim286-extra-def" data-delta="1">+</button>
              </div>
            </div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">Щит</span>
              <select id="sim286-shield" class="inv-edit-input bsim-select">
                ${SHIELDS.map(s => `<option value="${s[0]}">${escapeHtml(s[1])}${s[3] ? ` (${s[3]} АЕ)` : ''}</option>`).join('')}
              </select>
            </div>
            <div class="inv-edit-row bsim-ae-row">
              <span class="inv-edit-label bsim-stat-label">Заряд</span>
              <span id="sim286-ae-display" class="bsim-ae-display"></span>
              <button id="sim286-ae-roll" class="inv-edit-done bsim-ae-roll-btn" type="button">Хвърли (2d6×10)</button>
            </div>
            ${_checkField('Врагът напада първи', 'sim286-enemy-first', 'според епизода')}
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">Враг</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">Избор</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim286-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim286-enemy-pick-dropdown">
                <ul id="sim286-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField('Точки живот (ТЖ)', 'sim286-enemy-hp')}
            ${_numField('Максимум ТЖ',      'sim286-enemy-hpmax')}
            ${_numField('Минимум удар',     'sim286-enemy-minhit')}
          </div>
          <div id="sim286-effects" class="bsim-effects"></div>
          <div id="sim286-status" class="bsim-status"></div>
          <div class="inv-edit-row bsim-heal-row">
            <span class="inv-edit-label bsim-stat-label">Лечение</span>
            <div class="inv-qty-wrap">
              <button class="inv-qty-btn" data-id="sim286-heal-amount" data-delta="-1" data-min="1">−</button>
              <input id="sim286-heal-amount" class="inv-edit-input inv-qty-input" type="text" inputmode="numeric" value="10">
              <button class="inv-qty-btn" data-id="sim286-heal-amount" data-delta="1" data-min="1">+</button>
            </div>
            <button id="sim286-heal-roll" class="inv-edit-done bsim-heal-btn" type="button" title="Много лечебни средства в книгата възстановяват колкото покажат зарчетата">Хвърли (2d6)</button>
            <button id="sim286-heal" class="inv-edit-done bsim-heal-btn">Лекувай</button>
          </div>
          <div class="inv-modal-ftr">
            <button id="sim286-round" class="inv-add-btn bsim-action-primary">Рунд</button>
            <button id="sim286-sleep" class="inv-add-btn">Сън</button>
            <button id="sim286-reset" class="inv-add-btn">Нулирай</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary>Технически арсенал</summary>
            <div id="sim286-tech-list" class="bsim-tech-list"></div>
          </details>
          <details class="bsim-history">
            <summary id="sim286-history-summary">История на битките (0)</summary>
            <div id="sim286-history-list" class="bsim-history-list"></div>
          </details>
          <div id="sim286-log" class="bsim-log"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const btn = document.createElement('button');
  btn.id            = 'sim286-btn';
  btn.innerHTML     = shortcutLabel(t('battlesim.title'));
  btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn);

  btn.addEventListener('click', openSim286);
  document.getElementById('sim286-close').addEventListener('click', closeSim286);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) closeSim286(); });
  registerPanelShortcut('KeyS', {
    getButton:  () => btn,
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'sim286-overlay'),
    open:  openSim286,
    close: closeSim286,
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeSim286();
  });

  document.getElementById('sim286-round').addEventListener('click', _runRound);
  document.getElementById('sim286-sleep').addEventListener('click', _sleepAttempt);
  document.getElementById('sim286-reset').addEventListener('click', _resetBattle);
  document.getElementById('sim286-heal').addEventListener('click', () => {
    const amount = Number(document.getElementById('sim286-heal-amount').value) || 0;
    _heal(amount);
  });
  // Many of the book's recovery moments ("хвърли зарчетата, за да видиш колко
  // жизнени точки ти е възстановило" - the healing fruit/balm etc.) just tell
  // the reader to roll 2d6 for the amount - this fills the amount field with
  // that roll rather than making the player reach for a physical die.
  document.getElementById('sim286-heal-roll').addEventListener('click', () => {
    document.getElementById('sim286-heal-amount').value = _roll2d6();
  });

  document.getElementById('sim286-tech-list').addEventListener('click', e => {
    const btnEl = e.target.closest('.bsim-tech-btn');
    if (btnEl) _activateTech(btnEl.dataset.tech);
  });

  // Plain numeric steppers (life/lifeMax/customMinHit/enemy fields/heal amount)
  const FIELD_MAP = {
    'sim286-player-life':     ['player', 'life'],
    'sim286-player-lifemax':  ['player', 'lifeMax'],
    'sim286-custom-minhit':   ['player', 'customMinHit'],
    'sim286-custom-ae':       ['player', 'customAeCost'],
    'sim286-glove-bonus':     ['player', 'gloveBonus'],
    'sim286-extra-def':       ['player', 'extraDef'],
    'sim286-enemy-hp':        ['enemy', 'hp'],
    'sim286-enemy-hpmax':     ['enemy', 'hpMax'],
    'sim286-enemy-minhit':    ['enemy', 'minHit'],
  };
  function _applyField(id, val) {
    const d = _data();
    if (!d) return;
    const map = FIELD_MAP[id];
    if (!map) return;
    val = Math.max(0, val);
    if (id === 'sim286-player-life') val = Math.min(val, d.player.lifeMax);
    d[map[0]][map[1]] = val;
    if (id === 'sim286-player-lifemax') d.player.life = Math.min(d.player.life, val);
    // A manual correction to the enemy's HP (not via autocomplete/reset) means
    // this now IS the fight's real starting point - without this, Dehronator
    // would silently rewind to whatever stale number was there before the fix.
    if (id === 'sim286-enemy-hp' || id === 'sim286-enemy-hpmax') d.battleStart.enemyHp = d.enemy.hp;
    saveState();
    _renderInputs();
  }
  overlay.querySelectorAll('.inv-qty-input[id^="sim286-"]').forEach(input => {
    if (!FIELD_MAP[input.id]) return;
    input.addEventListener('input', () => {
      const raw = String(input.value).replace(/[^0-9]/g, '');
      if (raw !== input.value) input.value = raw;
      _applyField(input.id, Number(raw) || 0);
    });
  });
  overlay.querySelectorAll('.inv-qty-btn[data-id^="sim286-"]').forEach(btnEl => {
    btnEl.addEventListener('click', () => {
      const input = document.getElementById(btnEl.dataset.id);
      if (!input) return;
      const min = Number(btnEl.dataset.min) || 0;
      if (FIELD_MAP[btnEl.dataset.id]) {
        const next = Math.max(min, (Number(input.value) || 0) + Number(btnEl.dataset.delta));
        _applyField(btnEl.dataset.id, next);
      } else {
        const next = Math.max(min, (Number(input.value) || 0) + Number(btnEl.dataset.delta));
        input.value = next;
      }
    });
  });
  document.getElementById('sim286-heal-amount').addEventListener('input', e => {
    const raw = String(e.target.value).replace(/[^0-9]/g, '');
    if (raw !== e.target.value) e.target.value = raw;
  });

  document.getElementById('sim286-weapon').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    const prevKey = d.player.weaponKey;
    d.player.weaponKey = e.target.value;
    const needed = _loadoutAE(d);
    if (needed > d.player.aeMax) {
      d.player.weaponKey = prevKey;
      e.target.value = prevKey;
      showAlert(`Не достига заряд - нужни са ${needed} АЕ, а имаш ${d.player.aeMax}.`);
      return;
    }
    saveState();
    _renderInputs();
  });
  document.getElementById('sim286-shield').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    const prevKey = d.player.shieldKey;
    d.player.shieldKey = e.target.value;
    const needed = _loadoutAE(d);
    if (needed > d.player.aeMax) {
      d.player.shieldKey = prevKey;
      e.target.value = prevKey;
      showAlert(`Не достига заряд - нужни са ${needed} АЕ, а имаш ${d.player.aeMax}.`);
      return;
    }
    saveState();
    _renderInputs();
  });
  // "Хвърли зарчетата, те ще измерят заряда в АЕ" - a single roll, no reroll
  // mentioned anywhere for this one (unlike starting life, which explicitly
  // allows 2 more tries) - so this button is a genuine one-shot per playthrough.
  document.getElementById('sim286-ae-roll').addEventListener('click', () => {
    const d = _data();
    if (!d || d.aeRolled) return;
    d.player.aeMax = _roll2d6() * 10;
    d.aeRolled = true;
    saveState();
    _renderInputs();
  });
  // "Можеш да опиташ още два пъти и да избереш най-добрия резултат. Но не
  // повече." - starting life allows the initial roll plus 2 rerolls, 3 total.
  document.getElementById('sim286-life-roll').addEventListener('click', () => {
    const d = _data();
    if (!d || d.lifeRollCount >= MAX_LIFE_ROLLS) return;
    const rolled = _roll2d6() * 4;
    d.player.lifeMax = rolled;
    d.player.life = rolled;
    d.lifeRollCount++;
    saveState();
    _renderInputs();
  });
  document.getElementById('sim286-enemy-first').addEventListener('change', e => {
    const d = _data();
    if (!d) return;
    d.player.enemyFirst = e.target.checked;
    saveState();
  });
  document.getElementById('sim286-enemy-pick').addEventListener('input', e => {
    const d = _data();
    if (!d) return;
    d.enemy.name = e.target.value;
    saveState();
  });

  _setupEnemyAutocomplete();
}

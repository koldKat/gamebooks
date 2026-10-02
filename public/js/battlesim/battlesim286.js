// Battle Simulator (В лабиринта на времето, book 286)
// Weapon damage = max(0,2d6-minHit), with glove/tech bonuses; shields reduce incoming damage.

import { currentPlaythrough, saveState, apiFetch, currentBookId } from '../core/state.js';
import { showAlert } from '../ui-helpers/confirm.js';
import { getPlayBtnRow } from '../play/charsheet.js';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../core/util.js';
import { t } from '../i18n.js';

// Book rule: initial life roll (2d6×4) plus up to 2 rerolls, 3 throws total per run.
const MAX_LIFE_ROLLS = 3;
const TECH_ATTEMPT_COST = 3;

const SVG_SKULL  = `<svg class="sim-icon sim-icon-dead"  viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2C18.6 16.3 20 13.8 20 11a8 8 0 0 0-8-8zm-2.5 13v-1.5a.5.5 0 0 0-.5-.5H8l-.5-1 1-1-1-1 1-1H9a2.5 2.5 0 0 1 5 0h.5l1 1-1 1 1 1-.5 1h-1a.5.5 0 0 0-.5.5V16h-4z"/></svg>`;
const SVG_TROPHY = `<svg class="sim-icon sim-icon-win"   viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v7a6 6 0 0 1-12 0V2zm-2 1H2v4a4 4 0 0 0 4 4v-1a3 3 0 0 1-3-3V3zm16 0h2v4a4 4 0 0 1-4 4v-1a3 3 0 0 0 3-3V3zm-7 13v2H9v2h6v-2h-2v-2a6 6 0 0 0 5-5.92V2H6v8.08A6 6 0 0 0 13 16z"/></svg>`;

// Weapons: [key,label,minHit,energyCost]. Glove hits add +5 even at minHit and cost no AE.
// Custom weapon cost is entered manually.
const WEAPONS = [
  ['sword',   6, 20],
  ['mace',    5, 20],
  ['halberd', 6, 15],
  ['dagger',  7, 5],
  ['machete', 6, 7],
  ['rapier',  5, 11],
  ['harpoon', 7, 2],
  ['axe',     7, 2],
  ['glove',   4, 0],
  ['custom',  null, null],
];

// Shields: [key,negative defense reduction,energyCost]; labels come from translations.
const SHIELDS = [
  ['none',   0, 0],
  ['small',  -2, 50],
  ['medium', -3, 100],
  ['large',  -4, 120],
];

// Tech attempts cost 3 HP and require 2d6>=6; failed attempts still consume a use.
// Revive instead costs 15 HP and rewinds the battle once.
const TECH_ITEMS = [
  { key: 'shield_temp', kind: 'buff_shield', maxUses: 3 },
  { key: 'grav_shock',  kind: 'buff_next',   maxUses: 3 },
  { key: 'gas',         kind: 'stun',        maxUses: 3 },
  { key: 'laser',       kind: 'direct',      maxUses: 3, damage: 10 },
  { key: 'time_accel',  kind: 'double',      maxUses: 3 },
  { key: 'blaster',     kind: 'direct', maxUses: 10, damage: 10, charged: true },
  { key: 'raygun',      kind: 'direct', maxUses: 2,  damage: 75, charged: true },
  { key: 'dehronator',  kind: 'revive', maxUses: 1, cost: 15 },
];
function _techName(key) { return t(`battlesim286.tech.${key}.name`); }
function _techDesc(key) { return t(`battlesim286.tech.${key}.desc`); }

// A troubled-sleep result (2-5 on 2d6) triggers a second roll selecting dreams 2-12.
// Dream 9 is instant death; dream 11 loses 5 life.

function _data() {
  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim286) {
    pt.sim286 = {
      // Starting life/AE stay zero until rolled; never grant placeholder points.
      player: { life: 0, lifeMax: 0, weaponKey: 'sword', customMinHit: 6, customAeCost: 0, shieldKey: 'none', aeMax: 0, enemyFirst: false, gloveBonus: 5, extraDef: 0 },
      enemy:  { name: '', hp: 20, hpMax: 20, minHit: 6, fixedDamage: 0, extraAttackers: 0 },
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
  if (d.enemy.fixedDamage === undefined) d.enemy.fixedDamage = 0;
  if (d.enemy.extraAttackers === undefined) d.enemy.extraAttackers = 0;
  if (d.lifeRollCount === undefined) d.lifeRollCount = 0;
  if (d.aeRolled === undefined) d.aeRolled = false;
  if (d.roundsThisBattle === undefined) d.roundsThisBattle = 0;
  if (d.healUsedThisBattle === undefined) d.healUsedThisBattle = false;
  // Grandfather previously initialized life/AE stats independently so legacy runs do not become roll-gated.
  if (d.lifeRollCount === 0 && d.player.lifeMax > 0) d.lifeRollCount = 1;
  if (!d.aeRolled && d.player.aeMax > 0) d.aeRolled = true;
  for (const item of TECH_ITEMS) {
    if (!d.tech[item.key]) d.tech[item.key] = { usesLeft: item.maxUses, activated: false };
  }
  return d;
}

// Require both starting rolls before combat, healing, sleep, or tech use.
function _notReady(d) {
  return d.lifeRollCount === 0 || !d.aeRolled;
}

// Only weapon and shield count toward AE; glove and tech are separate gifts.
function _loadoutAE(d) {
  const w = WEAPONS.find(w => w[0] === d.player.weaponKey);
  const s = SHIELDS.find(s => s[0] === d.player.shieldKey);
  const weaponAE = w ? (w[0] === 'custom' ? (d.player.customAeCost || 0) : w[2]) : 0;
  const shieldAE = s ? s[2] : 0;
  return weaponAE + shieldAE;
}

function _roll2d6() { return 2 + Math.floor(Math.random() * 6) + Math.floor(Math.random() * 6); }
function _roll1d6() { return 1 + Math.floor(Math.random() * 6); }

function _appendLog(d, line) {
  d.log.push(line);
  if (d.log.length > 250) d.log.shift();
}

function _enemyName(d) { return d.enemy.name.trim() || 'противникът'; }
// Escape free-text names in HTML logs; store history names raw and escape once when rendered.
function _enemyNameSafe(d) { return escapeHtml(_enemyName(d)); }

function _weaponMinHit(d) {
  const w = WEAPONS.find(w => w[0] === d.player.weaponKey);
  if (!w) return 6;
  return w[0] === 'custom' ? (d.player.customMinHit || 0) : w[1];
}
function _weaponIsGlove(d) { return d.player.weaponKey === 'glove'; }
function _shieldDef(d) {
  const s = SHIELDS.find(s => s[0] === d.player.shieldKey);
  return s ? s[1] : 0;
}
// Store extra defense as a positive stepper value; negate it when adding shield/armour protection.
function _totalPlayerDef(d) {
  return _shieldDef(d) + (d.effects.tempShield ? -4 : 0) - (d.player.extraDef || 0);
}

// Damage is max(0, roll-minHit), plus glove bonus (+5; upgraded boss +10) and pending tech.
// Consume one-shot tech on the first successful hit.
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
    ? t('battlesim286.log.player_hit', { roll, minHit, dmg, enemy: _enemyNameSafe(d), hp: d.enemy.hp, hpMax: d.enemy.hpMax })
    : t('battlesim286.log.player_miss', { roll, minHit }));
}

// Extra identical attackers share enemy stats but roll independently; override their log labels.
function _enemyAttackOnce(d, labelOverride = null) {
  const label = labelOverride ?? _enemyNameSafe(d);
  if (d.effects.enemyStun > 0) {
    d.effects.enemyStun--;
    _appendLog(d, t('battlesim286.log.enemy_stunned', { label }));
    return;
  }
  const roll = _roll2d6();
  const minHit = d.enemy.minHit || 0;
  const hit  = roll > minHit;
  // Fixed-damage hits still receive normal shield/armour reduction.
  const raw  = hit ? (d.enemy.fixedDamage > 0 ? d.enemy.fixedDamage : (roll - minHit)) : 0;
  const dmg  = Math.max(0, raw + _totalPlayerDef(d));
  if (dmg > 0) {
    d.player.life = Math.max(0, d.player.life - dmg);
    _appendLog(d, t('battlesim286.log.enemy_hit', { label, roll, minHit, dmg, life: d.player.life, lifeMax: d.player.lifeMax }));
  } else {
    _appendLog(d, t('battlesim286.log.enemy_miss', { label, roll, minHit }));
  }
}

// Each surviving extra attacker strikes independently; only the tracked enemy pool is woundable.
function _resolveExtraAttackers(d) {
  const n = d.enemy.extraAttackers || 0;
  for (let i = 1; i <= n && d.player.life > 0; i++) {
    _enemyAttackOnce(d, t('battlesim286.ui.extra_attacker_label', { enemy: _enemyNameSafe(d), n: i }));
  }
}

// Keep lifetime outcomes: admin totals require the full history.
function _recordOutcome(d, outcome, enemyNameOverride = null) {
  d.history.push({
    enemy: enemyNameOverride ?? _enemyName(d), outcome,
    enemyHpMax: d.enemy.hpMax, enemyMinHit: d.enemy.minHit,
    playerLife: d.player.life, playerLifeMax: d.player.lifeMax,
    ts: Date.now(),
  });
}

// Player attacks first unless the encounter's enemyFirst flag reverses the order.
function _runRound() {
  const d = _data();
  if (!d || _notReady(d) || d.player.life <= 0 || d.enemy.hp <= 0) return;
  d.roundsThisBattle = (d.roundsThisBattle || 0) + 1;

  if (d.player.enemyFirst) {
    _enemyAttackOnce(d);
    if (d.player.life > 0) _resolveExtraAttackers(d);
    if (d.player.life <= 0) {
      _appendLog(d, `${SVG_SKULL} ${t('battlesim286.log.player_fallen')}`);
      _recordOutcome(d, 'loss');
      saveState();
      _renderAll();
      return;
    }
  }

  _playerAttackOnce(d);
  if (d.effects.doubleAttack && d.enemy.hp > 0) _playerAttackOnce(d);

  if (d.enemy.hp <= 0) {
    _appendLog(d, `${SVG_TROPHY} ${t('battlesim286.log.enemy_defeated', { enemy: _enemyNameSafe(d) })}`);
    _recordOutcome(d, 'win');
  } else if (!d.player.enemyFirst) {
    _enemyAttackOnce(d);
    if (d.player.life > 0) _resolveExtraAttackers(d);
    if (d.player.life <= 0) {
      _appendLog(d, `${SVG_SKULL} ${t('battlesim286.log.player_fallen')}`);
      _recordOutcome(d, 'loss');
    }
  }

  saveState();
  _renderAll();
}

// Heal only outside combat, once per battle cycle as the simulator's episode proxy.
function _heal(amount) {
  const d = _data();
  if (!d || amount <= 0) return;
  if (_notReady(d)) {
    showAlert(t('battlesim286.alert.not_ready'));
    return;
  }
  if (d.roundsThisBattle > 0 && d.player.life > 0 && d.enemy.hp > 0) {
    showAlert(t('battlesim286.alert.heal_midfight'));
    return;
  }
  if (d.healUsedThisBattle) {
    showAlert(t('battlesim286.alert.heal_used'));
    return;
  }
  const before = d.player.life;
  d.player.life = Math.min(d.player.lifeMax, d.player.life + amount);
  d.healUsedThisBattle = true;
  _appendLog(d, t('battlesim286.log.heal', { n: amount, before, life: d.player.life, lifeMax: d.player.lifeMax }));
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
  if (d.log.length) _appendLog(d, t('battlesim286.log.reset_sep'));
  _appendLog(d, t('battlesim286.log.reset', { enemy: _enemyNameSafe(d) }));
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
    // Deduct revive's 15 HP from the restored starting life, not the overwritten current value.
    d.player.life = Math.max(0, d.battleStart.playerLife - item.cost);
    d.enemy.hp    = d.battleStart.enemyHp;
    d.dehronatorUsed = true;
    state.usesLeft = 0;
    _appendLog(d, t('battlesim286.log.dehronator', { cost: item.cost, life: d.player.life, lifeMax: d.player.lifeMax }));
    if (d.player.life <= 0) {
      _appendLog(d, `${SVG_SKULL} ${t('battlesim286.log.dehronator_death')}`);
      _recordOutcome(d, 'loss');
    }
    saveState();
    _renderAll();
    return;
  }

  // Block actions after resolution to prevent duplicate outcome history.
  if (d.player.life <= 0 || d.enemy.hp <= 0) return;

  // Activated charged weapons fire freely; failed activation costs HP but not ammunition.
  if (item.charged && state.activated) {
    if (state.usesLeft <= 0) return;
    state.usesLeft--;
    d.enemy.hp = Math.max(0, d.enemy.hp - item.damage);
    _appendLog(d, t('battlesim286.log.charged_shot', { name: _techName(item.key), dmg: item.damage, enemy: _enemyNameSafe(d), hp: d.enemy.hp, hpMax: d.enemy.hpMax, left: state.usesLeft }));
    if (d.enemy.hp <= 0) { _appendLog(d, `${SVG_TROPHY} ${t('battlesim286.log.enemy_defeated', { enemy: _enemyNameSafe(d) })}`); _recordOutcome(d, 'win'); }
    saveState();
    _renderAll();
    return;
  }

  if (item.charged) {
    if (state.usesLeft <= 0) return; // depleted before ever landing an activation roll
  } else if (state.usesLeft <= 0) {
    return; // items 1-5: 3 attempts total, win or lose
  }

  d.player.life = Math.max(0, d.player.life - TECH_ATTEMPT_COST);
  if (!item.charged) state.usesLeft--; // charged items: cost paid, but the attempt itself never spends a charge
  const roll = _roll2d6();
  const ok   = roll >= 6;
  if (!ok) {
    _appendLog(d, t('battlesim286.log.activate_fail', { name: _techName(item.key), roll, cost: TECH_ATTEMPT_COST }));
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
    _appendLog(d, t('battlesim286.log.activate_success', { name: _techName(item.key), roll, cost: TECH_ATTEMPT_COST, desc: _techDesc(item.key) }));
    if (item.kind === 'direct') {
      _appendLog(d, t('battlesim286.log.direct_hit', { enemy: _enemyNameSafe(d), dmg: item.damage, hp: d.enemy.hp, hpMax: d.enemy.hpMax }));
      if (d.enemy.hp <= 0) { _appendLog(d, `${SVG_TROPHY} ${t('battlesim286.log.enemy_defeated', { enemy: _enemyNameSafe(d) })}`); _recordOutcome(d, 'win'); }
    }
  }
  if (d.player.life <= 0) {
    _appendLog(d, `${SVG_SKULL} ${t('battlesim286.log.player_fallen')}`);
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
    showAlert(t('battlesim286.alert.not_ready'));
    return;
  }
  // "Можеш да спиш във всеки епизод, освен когато си нападнат" - sleep is
  // blocked mid-fight for the same reason manual healing is.
  if (d.roundsThisBattle > 0 && d.player.life > 0 && d.enemy.hp > 0) {
    showAlert(t('battlesim286.alert.sleep_midfight'));
    return;
  }
  const roll = _roll2d6();
  if (roll >= 6) {
    const before = d.player.life;
    d.player.life = Math.min(d.player.lifeMax, d.player.life + roll);
    _appendLog(d, t('battlesim286.log.sleep_calm', { roll, before, life: d.player.life, lifeMax: d.player.lifeMax }));
    saveState();
    _renderAll();
    return;
  }
  _appendLog(d, t('battlesim286.log.sleep_troubled', { roll }));
  const dreamRoll = _roll2d6();
  _appendLog(d, t('battlesim286.log.dream_roll', { roll: dreamRoll, label: t(`battlesim286.dream.${dreamRoll}`) }));
  _resolveDream(d, dreamRoll);
  saveState();
  _renderAll();
}

function _resolveDream(d, n) {
  const sleepLife = d.player.life; // life at the moment of falling asleep
  switch (n) {
    case 2: {
      const roll = _roll2d6();
      if (roll <= 7) { _appendLog(d, t('battlesim286.dream2.safe', { roll })); }
      else { d.player.life = 0; _appendLog(d, t('battlesim286.dream2.explode', { roll })); }
      break;
    }
    case 3: {
      const roll = _roll2d6();
      if (roll >= 9 && roll <= 12) {
        d.player.life = Math.min(d.player.lifeMax, d.player.life + roll);
        _appendLog(d, t('battlesim286.dream3.gain', { roll }));
      } else {
        d.player.life = Math.max(0, d.player.life - roll);
        _appendLog(d, t('battlesim286.dream3.loss', { roll }));
      }
      break;
    }
    case 4: {
      const days = _roll1d6();
      d.player.life = Math.max(0, d.player.life - days);
      _appendLog(d, t('battlesim286.dream4.result', { days }));
      break;
    }
    case 5: {
      const sum  = _roll1d6() + _roll1d6() + _roll1d6();
      const loss = Math.floor(sum / 2);
      if (loss > sleepLife) {
        d.player.life = 0;
        _appendLog(d, t('battlesim286.dream5.death', { loss, sum }));
      } else {
        d.player.life = sleepLife - loss;
        d.player.life = Math.min(d.player.lifeMax, d.player.life + 25);
        _appendLog(d, t('battlesim286.dream5.survive', { loss, life: d.player.life, lifeMax: d.player.lifeMax }));
      }
      break;
    }
    case 6: {
      const netRoll = _roll2d6();
      if (netRoll >= 7) {
        _appendLog(d, t('battlesim286.dream6.net_catch', { roll: netRoll }));
        break;
      }
      _appendLog(d, t('battlesim286.dream6.net_miss', { roll: netRoll }));
      let lionHp = 20;
      while (lionHp > 0 && d.player.life > 0) {
        const pr = _roll2d6();
        const pd = pr > 5 ? pr - 5 : 0;
        lionHp = Math.max(0, lionHp - pd);
        _appendLog(d, pd > 0 ? t('battlesim286.dream6.player_hit', { roll: pr, dmg: pd, lionHp }) : t('battlesim286.dream6.player_miss', { roll: pr }));
        if (lionHp <= 0) break;
        const er = _roll2d6();
        const ed = er > 6 ? Math.max(0, (er - 6) - 1) : 0;
        d.player.life = Math.max(0, d.player.life - ed);
        _appendLog(d, ed > 0 ? t('battlesim286.dream6.lion_hit', { roll: er, dmg: ed, life: d.player.life, lifeMax: d.player.lifeMax }) : t('battlesim286.dream6.lion_miss', { roll: er }));
      }
      _appendLog(d, lionHp <= 0 ? `${SVG_TROPHY} ${t('battlesim286.dream6.win')}` : `${SVG_SKULL} ${t('battlesim286.dream6.lose')}`);
      break;
    }
    case 7: {
      d.player.life = Math.min(d.player.lifeMax, d.player.life + 15);
      _appendLog(d, t('battlesim286.dream7.result'));
      break;
    }
    case 8: {
      const years = _roll2d6() * 10;
      if (years < 100) {
        d.player.life = d.player.lifeMax;
        _appendLog(d, t('battlesim286.dream8.safe', { years }));
      } else {
        d.player.life = 0;
        _appendLog(d, t('battlesim286.dream8.death', { years }));
      }
      break;
    }
    case 9: {
      d.player.life = 0;
      _appendLog(d, t('battlesim286.dream9.result'));
      break;
    }
    case 10: {
      _appendLog(d, t('battlesim286.dream10.intro'));
      for (let i = 1; i <= 4 && d.player.life > 0; i++) {
        const pr = _roll1d6(), gr = _roll1d6();
        if (pr > gr) {
          const gain = pr - gr;
          d.player.life = Math.min(d.player.lifeMax, d.player.life + gain);
          _appendLog(d, t('battlesim286.dream10.guard_win', { n: i, pr, gr, gain }));
        } else if (pr < gr) {
          const loss = gr - pr;
          d.player.life = Math.max(0, d.player.life - loss);
          _appendLog(d, t('battlesim286.dream10.guard_lose', { n: i, pr, gr, loss }));
        } else {
          _appendLog(d, t('battlesim286.dream10.guard_tie', { n: i, roll: pr }));
        }
      }
      break;
    }
    case 11: {
      d.player.life = Math.max(0, d.player.life - 5);
      _appendLog(d, t('battlesim286.dream11.result'));
      break;
    }
    case 12: {
      d.player.life = Math.min(d.player.lifeMax, d.player.life + 18);
      _appendLog(d, t('battlesim286.dream12.result'));
      break;
    }
  }
  // Label dream deaths independently of the previous enemy.
  if (d.player.life <= 0) _recordOutcome(d, 'loss', t('battlesim286.log.dream_death_label', { label: t(`battlesim286.dream.${n}`) }));
}

// ── Render ────────────────────────────────────────────────────────────────

function _techButtonsHtml(d) {
  // Block gadgets after resolution except the revive, which has its own alive/unused guard.
  // Require starting life/AE rolls for both.
  const notReady = _notReady(d);
  const battleOver = notReady || d.player.life <= 0 || d.enemy.hp <= 0;
  return TECH_ITEMS.map(item => {
    const s = d.tech[item.key];
    const depleted = item.kind === 'revive'
      ? (s.usesLeft <= 0 || notReady || d.player.life <= 0)
      : (s.usesLeft <= 0 || battleOver);
    const label = item.kind === 'revive'
      ? t('battlesim286.ui.tech_revive_label', { name: _techName(item.key), cost: item.cost })
      : (item.charged && s.activated ? t('battlesim286.ui.tech_fire_label', { name: _techName(item.key) }) : t('battlesim286.ui.tech_activate_label', { name: _techName(item.key) }));
    return `<div class="bsim-tech-row${depleted ? ' bsim-tech-row--depleted' : ''}">
      <div class="bsim-tech-name">${escapeHtml(_techName(item.key))}</div>
      <div class="bsim-tech-desc">${escapeHtml(_techDesc(item.key))}</div>
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
  summaryEl.textContent = t('battlesim286.history.summary', { n: hist.length });
  if (!hist.length) {
    listEl.innerHTML = `<div class="bsim-history-empty">${t('battlesim286.history.empty')}</div>`;
    return;
  }
  listEl.innerHTML = hist.slice().reverse().map(h => {
    const icon   = h.outcome === 'win' ? SVG_TROPHY : SVG_SKULL;
    const result = h.outcome === 'win' ? t('battlesim286.history.won') : t('battlesim286.history.lost');
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
  if (notReady)                el.innerHTML = t('battlesim286.status.not_ready');
  else if (d.player.life <= 0) el.innerHTML = `${SVG_SKULL} ${t('battlesim286.status.fallen')}`;
  else if (d.enemy.hp <= 0)    el.innerHTML = `${SVG_TROPHY} ${t('battlesim286.status.victory')}`;
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
  if (d.effects.tempShield)   badges.push(t('battlesim286.badge.temp_shield'));
  if (d.effects.doubleAttack) badges.push(t('battlesim286.badge.double_attack'));
  if (d.effects.pendingBonus > 0) badges.push(t('battlesim286.badge.pending_bonus', { n: d.effects.pendingBonus }));
  if (d.effects.enemyStun > 0) badges.push(t('battlesim286.badge.enemy_stun', { n: d.effects.enemyStun }));
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
  lifeRollBtn.textContent = t('battlesim286.btn.life_roll', { count: d.lifeRollCount, max: MAX_LIFE_ROLLS });
  const aeRollBtn = document.getElementById('sim286-ae-roll');
  aeRollBtn.disabled   = d.aeRolled;
  aeRollBtn.textContent = d.aeRolled ? t('battlesim286.btn.ae_rolled') : t('battlesim286.btn.ae_roll');
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
    aeEl.textContent = t('battlesim286.ui.ae_display', { spent: aeSpent, max: d.player.aeMax });
    aeEl.classList.toggle('bsim-ae-over', aeSpent > d.player.aeMax);
  }

  document.getElementById('sim286-enemy-pick').value    = d.enemy.name;
  document.getElementById('sim286-enemy-hp').value      = d.enemy.hp;
  document.getElementById('sim286-enemy-hpmax').value   = d.enemy.hpMax;
  document.getElementById('sim286-enemy-minhit').value  = d.enemy.minHit;
  document.getElementById('sim286-enemy-fixeddmg').value = d.enemy.fixedDamage;
  document.getElementById('sim286-enemy-extra').value    = d.enemy.extraAttackers;

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

// Enemy autocomplete stores minimum-hit thresholds in attack.

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
      `<li role="option" id="sim286-enemy-pick-opt-${i}" data-idx="${i}">${escapeHtml(e.name)}<span class="ac-sub">${t('battlesim286.ui.ac_life')}:${e.hp ?? '?'} ${t('battlesim286.ui.ac_minhit')}:${e.attack ?? '?'}</span></li>`
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
    // Reset manual fixed-damage/multi-attacker settings on enemy selection; roster labels indicate exceptions.
    d.enemy.fixedDamage = 0;
    d.enemy.extraAttackers = 0;
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
        <span class="inv-modal-title">${t('battlesim286.ui.title')}</span>
        <button id="sim286-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div class="bsim-body">
        <div class="bsim-col bsim-col-left">
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim286.ui.you')}</div>
            ${_numField(t('battlesim286.ui.life'), 'sim286-player-life')}
            ${_numField(t('battlesim286.ui.life_max'), 'sim286-player-lifemax')}
            <div class="inv-edit-row bsim-life-roll-row">
              <button id="sim286-life-roll" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim286.btn.life_roll_static')}</button>
            </div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim286.ui.weapon')}</span>
              <select id="sim286-weapon" class="inv-edit-input bsim-select">
                ${WEAPONS.map(w => `<option value="${w[0]}">${escapeHtml(t(`battlesim286.weapon.${w[0]}`))}${w[2] != null ? ` (${w[2]} АЕ)` : ''}</option>`).join('')}
              </select>
            </div>
            <div id="sim286-custom-minhit-row" class="inv-edit-row" style="display:none">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim286.ui.custom_minhit')}</span>
              <div class="inv-qty-wrap">
                <button class="inv-qty-btn" data-id="sim286-custom-minhit" data-delta="-1">−</button>
                <input id="sim286-custom-minhit" class="inv-edit-input inv-qty-input" type="text" inputmode="numeric">
                <button class="inv-qty-btn" data-id="sim286-custom-minhit" data-delta="1">+</button>
              </div>
            </div>
            <div id="sim286-custom-ae-row" class="inv-edit-row" style="display:none">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim286.ui.custom_ae')}</span>
              <div class="inv-qty-wrap">
                <button class="inv-qty-btn" data-id="sim286-custom-ae" data-delta="-1">−</button>
                <input id="sim286-custom-ae" class="inv-edit-input inv-qty-input" type="text" inputmode="numeric">
                <button class="inv-qty-btn" data-id="sim286-custom-ae" data-delta="1">+</button>
              </div>
            </div>
            <div id="sim286-glove-bonus-row" class="inv-edit-row" style="display:none">
              <span class="inv-edit-label bsim-stat-label" data-tooltip="${t('battlesim286.ui.glove_bonus_tooltip')}">${t('battlesim286.ui.glove_bonus')}</span>
              <div class="inv-qty-wrap">
                <button class="inv-qty-btn" data-id="sim286-glove-bonus" data-delta="-1">−</button>
                <input id="sim286-glove-bonus" class="inv-edit-input inv-qty-input" type="text" inputmode="numeric">
                <button class="inv-qty-btn" data-id="sim286-glove-bonus" data-delta="1">+</button>
              </div>
            </div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label" data-tooltip="${t('battlesim286.ui.extra_def_tooltip')}">${t('battlesim286.ui.extra_def')}</span>
              <div class="inv-qty-wrap">
                <button class="inv-qty-btn" data-id="sim286-extra-def" data-delta="-1">−</button>
                <input id="sim286-extra-def" class="inv-edit-input inv-qty-input" type="text" inputmode="numeric">
                <button class="inv-qty-btn" data-id="sim286-extra-def" data-delta="1">+</button>
              </div>
            </div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim286.ui.shield')}</span>
              <select id="sim286-shield" class="inv-edit-input bsim-select">
                ${SHIELDS.map(s => `<option value="${s[0]}">${escapeHtml(t(`battlesim286.shield.${s[0]}`))}${s[2] ? ` (${s[2]} АЕ)` : ''}</option>`).join('')}
              </select>
            </div>
            <div class="inv-edit-row bsim-ae-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim286.ui.charge')}</span>
              <span id="sim286-ae-display" class="bsim-ae-display"></span>
              <button id="sim286-ae-roll" class="inv-edit-done bsim-ae-roll-btn" type="button">${t('battlesim286.btn.ae_roll')}</button>
            </div>
            ${_checkField(t('battlesim286.ui.enemy_first'), 'sim286-enemy-first', t('battlesim286.ui.enemy_first_note'))}
          </div>
          <div class="bsim-side">
            <div class="bsim-side-title">${t('battlesim286.ui.enemy')}</div>
            <div class="inv-edit-row">
              <span class="inv-edit-label bsim-stat-label">${t('battlesim286.ui.pick')}</span>
              <div class="autocomplete-wrap bsim-enemy-ac">
                <input id="sim286-enemy-pick" class="inv-edit-input" type="text" autocomplete="off" readonly role="combobox" aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" aria-controls="sim286-enemy-pick-dropdown">
                <ul id="sim286-enemy-pick-dropdown" class="autocomplete-dropdown" role="listbox"></ul>
              </div>
            </div>
            ${_numField(t('battlesim286.ui.life'), 'sim286-enemy-hp')}
            ${_numField(t('battlesim286.ui.life_max'), 'sim286-enemy-hpmax')}
            ${_numField(t('battlesim286.ui.enemy_minhit'), 'sim286-enemy-minhit')}
            ${_numField(t('battlesim286.ui.enemy_fixeddmg'), 'sim286-enemy-fixeddmg')}
            ${_numField(t('battlesim286.ui.enemy_extra'), 'sim286-enemy-extra')}
          </div>
          <div id="sim286-effects" class="bsim-effects"></div>
          <div id="sim286-status" class="bsim-status"></div>
          <div class="inv-edit-row bsim-heal-row">
            <span class="inv-edit-label bsim-stat-label">${t('battlesim286.ui.heal')}</span>
            <div class="inv-qty-wrap">
              <button class="inv-qty-btn" data-id="sim286-heal-amount" data-delta="-1" data-min="1">−</button>
              <input id="sim286-heal-amount" class="inv-edit-input inv-qty-input" type="text" inputmode="numeric" value="10">
              <button class="inv-qty-btn" data-id="sim286-heal-amount" data-delta="1" data-min="1">+</button>
            </div>
            <button id="sim286-heal-roll" class="inv-edit-done bsim-heal-btn" type="button" data-tooltip="${t('battlesim286.ui.heal_roll_tooltip')}">${t('battlesim286.btn.heal_roll')}</button>
            <button id="sim286-heal" class="inv-edit-done bsim-heal-btn">${t('battlesim286.btn.heal')}</button>
          </div>
          <div class="inv-modal-ftr">
            <button id="sim286-round" class="inv-add-btn bsim-action-primary">${t('battlesim286.btn.round')}</button>
            <button id="sim286-sleep" class="inv-add-btn">${t('battlesim286.btn.sleep')}</button>
            <button id="sim286-reset" class="inv-add-btn">${t('battlesim286.btn.reset')}</button>
          </div>
        </div>
        <div class="bsim-col bsim-col-right">
          <details class="bsim-history" open>
            <summary>${t('battlesim286.ui.tech_arsenal')}</summary>
            <div id="sim286-tech-list" class="bsim-tech-list"></div>
          </details>
          <details class="bsim-history">
            <summary id="sim286-history-summary">${t('battlesim286.history.summary', { n: 0 })}</summary>
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
  // Roll 2d6 into the healing amount field.
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
    'sim286-enemy-fixeddmg':  ['enemy', 'fixedDamage'],
    'sim286-enemy-extra':     ['enemy', 'extraAttackers'],
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
    // Manual HP correction updates the starting snapshot used by revive.
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
      showAlert(t('battlesim286.alert.insufficient_ae', { needed, have: d.player.aeMax }));
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
      showAlert(t('battlesim286.alert.insufficient_ae', { needed, have: d.player.aeMax }));
      return;
    }
    saveState();
    _renderInputs();
  });
  // Starting AE is a one-shot roll; only life permits rerolls.
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

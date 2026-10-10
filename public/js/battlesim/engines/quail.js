export const QUAIL_RULES_VERSION = 1;

export function quailEnemies(d) {
  return [d.enemy, ...(d.extraEnemies || [])];
}

export function quailOver(d) {
  return d.player.hp <= 0 || Boolean(d.finished) || quailEnemies(d).every(e => e.hp <= 0);
}

export function quailStart(d) {
  d.rulesVersion = QUAIL_RULES_VERSION;
  d.finished = null;
  d.rounds = 0;
  d.started = false;
  d.extraEnemies ||= [];
  d.options ||= { escapeMin: 0, companionA: 0, companion: false, lowRoll: false, nonlethal: false };
  d.ammo ||= { bow: 0, musket: 0, spear: 0, shuriken: 0 };
  d.magic ||= { value: 0, spell: 'fireball', learned: {}, formulas: {}, used: {}, summonA: 0, empower: false, weakenDefense: false };
  d.magic.used = {};
  d.freeAttacks = 0;
  d.paralysis = 0;
  d.lastEnemyDamage = 0;
  if (d.summonedCompanion) d.options.companion = false;
  d.summonedCompanion = false;
  for (const e of quailEnemies(d)) {
    e.hp = e.hpMax;
    if (e.originalA != null) { e.a = e.originalA; delete e.originalA; }
    if (e.originalD != null) { e.d = e.originalD; delete e.originalD; }
    delete e.controlled;
    delete e.paralysis;
    delete e.lastDamage;
  }
  if (d.originalPlayerA != null) { d.player.a = d.originalPlayerA; delete d.originalPlayerA; }
}

function event(events, kind, actor, roll, damage, hp) {
  events.push({ kind, actor: actor?.name || '', roll, damage, hp });
}

function finish(d, events) {
  if (d.player.hp <= 0) {
    if (d.options.nonlethal) d.player.hp = 1;
    d.finished = 'loss';
  } else if (quailEnemies(d).every(e => e.hp <= 0)) d.finished = 'win';
  if (d.finished) {
    if (d.originalPlayerA != null) { d.player.a = d.originalPlayerA; delete d.originalPlayerA; }
    events.push({ kind: d.finished });
  }
}

function enemyRoll(e, roll) {
  let value = roll();
  if (e.rule === 'sum2') return value + roll();
  if (e.rule === 'max2') return Math.max(value, roll());
  if (e.rule === 'plus3six') return value === 6 ? value + 3 : value;
  if (e.rule === 'explode12' || e.rule === 'explode56') {
    let last = value;
    while (e.rule === 'explode12' ? last <= 2 : last >= 5) {
      last = roll();
      value += last;
    }
  }
  return value;
}

export function quailCounter(d, roll) {
  const events = [];
  if (quailOver(d)) return events;
  d.rounds++;
  d.lastEnemyDamage = 0;
  const aura = Math.max(0, ...quailEnemies(d).filter(e => e.hp > 0).map(e => e.aura || 0));
  if (aura) {
    d.player.hp = Math.max(0, d.player.hp - aura);
    d.lastEnemyDamage += aura;
    event(events, 'aura', null, 0, aura, d.player.hp);
  }
  if (d.freeAttacks > 0) {
    d.freeAttacks--;
    finish(d, events);
    return events;
  }
  for (const e of quailEnemies(d)) {
    if (e.hp <= 0 || d.player.hp <= 0) continue;
    if (e.paralysis > 0) { e.paralysis--; continue; }
    const attacks = [{ extra: false }];
    while (attacks.length && d.player.hp > 0 && e.hp > 0) {
      const { extra } = attacks.shift();
      const value = enemyRoll(e, roll);
      if (e.controlled) {
        const damage = Math.max(0, e.a + value - e.d);
        e.hp = Math.max(0, e.hp - damage);
        delete e.controlled;
        event(events, 'controlled', e, value, damage, e.hp);
      } else {
        const damage = Math.max(0, e.a + value - d.player.d);
        e.lastDamage = damage;
        d.player.hp = Math.max(0, d.player.hp - damage);
        d.lastEnemyDamage += damage;
        event(events, 'enemy', e, value, damage, d.player.hp);
      }
      if (e.rule === 'water' && value >= 5) {
        d.originalPlayerA ??= d.player.a;
        d.player.a = Math.max(0, d.player.a - 1);
      }
      if (e.rule === 'extra6' && value === 6 || e.rule === 'extra12' && value <= 2) attacks.push({ extra: true });
      if (e.rule === 'bedbug' && !extra && roll() >= 5) attacks.push({ extra: true });
    }
  }
  finish(d, events);
  return events;
}

function target(d) {
  return quailEnemies(d).find(e => e.hp > 0);
}

function companionAttack(d, events, roll) {
  const e = target(d);
  if (!d.options.companion || !e || d.player.hp <= 0) return;
  const value = roll(), damage = Math.max(0, d.options.companionA + value - e.d);
  e.hp = Math.max(0, e.hp - damage);
  event(events, 'companion', e, value, damage, e.hp);
}

export function quailRound(d, roll) {
  const events = [];
  if (quailOver(d)) return events;
  d.started = true;
  d.player.ranged.attempts = 0;
  const e = target(d);
  let value = roll();
  if (d.options.lowRoll) value = Math.min(value, roll());
  const damage = Math.max(0, d.player.a + value - e.d);
  e.hp = Math.max(0, e.hp - damage);
  event(events, 'player', e, value, damage, e.hp);
  companionAttack(d, events, roll);
  finish(d, events);
  if (!d.finished) events.push(...quailCounter(d, roll));
  return events;
}

export function quailHeal(d, amount, roll) {
  if (quailOver(d) || amount <= 0) return [];
  d.started = true;
  d.player.hp = Math.min(d.player.hpMax, d.player.hp + amount);
  const events = [{ kind: 'heal', hp: d.player.hp }];
  if (d.player.ranged.attempts > 0) d.player.ranged.attempts--;
  else {
    companionAttack(d, events, roll);
    finish(d, events);
    if (!d.finished) events.push(...quailCounter(d, roll));
  }
  return events;
}

export function quailFlee(d, roll) {
  if (quailOver(d) || !d.options.escapeMin) return [];
  d.started = true;
  const ranged = d.player.ranged.attempts > 0;
  if (ranged) d.player.ranged.attempts--;
  const value = roll();
  if (value >= d.options.escapeMin) {
    d.finished = 'escape';
    if (d.originalPlayerA != null) { d.player.a = d.originalPlayerA; delete d.originalPlayerA; }
    return [{ kind: 'escape', roll: value }];
  }
  return [{ kind: 'flee_failed', roll: value }, ...(!ranged ? quailCounter(d, roll) : [])];
}

export function quailRanged(d, weapon, roll) {
  const r = d.player.ranged;
  if (quailOver(d) || r.attempts <= 0 || !weapon || r.type === 'magic' || !(d.ammo[r.type] > 0)) return [];
  d.started = true;
  const e = target(d);
  const value = roll();
  r.attempts--;
  d.ammo[r.type]--;
  const accuracy = r.type === 'bow' ? weapon.t + (d.player.skills.archery >= 1 ? 1 : 0)
    : r.type === 'musket' ? 4 : (r.type === 'spear' ? 4 : 3) + (d.player.skills.throwing ? 1 : 0);
  const hit = value <= accuracy;
  let damage = 0;
  if (hit) {
    if (r.type === 'bow') damage = Math.max(0, weapon.a + (d.player.skills.archery >= 2 ? 2 : 0) - e.pb);
    else if (r.type === 'musket') damage = Math.max(0, 6 - e.pb);
    else if (r.type === 'spear') damage = 2;
    else damage = value;
    e.hp = Math.max(0, e.hp - damage);
  }
  const events = [{ kind: 'ranged', actor: e.name, roll: value, damage, hp: e.hp }];
  finish(d, events);
  return events;
}

export const QUAIL_SPELLS = ['summon', 'control', 'earthquake', 'fireball', 'heal', 'paralyze', 'weaken', 'mirror', 'wind'];

export function quailCanCast(d) {
  const m = d.magic, spell = m.spell;
  if (quailOver(d) || !QUAIL_SPELLS.includes(spell) || m.value < 1 || m.value > 5 || m.used[spell]) return false;
  const ranged = d.player.ranged.attempts > 0;
  if (ranged && ['control', 'paralyze', 'mirror'].includes(spell) || !ranged && spell === 'wind') return false;
  if (!m.learned[spell] && !(m.formulas[spell] > 0)) return false;
  if (spell === 'fireball' && m.empower && (m.value < 4 || d.player.hp <= 2)) return false;
  return true;
}

export function quailSpendAction(d, roll) {
  if (quailOver(d)) return [];
  d.started = true;
  if (d.player.ranged.attempts > 0) { d.player.ranged.attempts--; return [{ kind: 'action' }]; }
  const events = [{ kind: 'action' }];
  companionAttack(d, events, roll);
  finish(d, events);
  if (!d.finished) events.push(...quailCounter(d, roll));
  return events;
}

export function quailSpell(d, roll) {
  if (!quailCanCast(d)) return [];
  const m = d.magic, spell = m.spell;
  const ranged = d.player.ranged.attempts > 0;
  d.started = true;
  if (!m.learned[spell]) m.formulas[spell]--;
  if (ranged) d.player.ranged.attempts--;
  const events = [];
  const value = spell === 'fireball' ? 0 : roll();
  const success = spell === 'fireball' || value <= m.value;
  events.push({ kind: success ? 'spell' : 'spell_failed', spell, roll: value });
  if (success) {
    m.used[spell] = true;
    const e = target(d);
    if (spell === 'summon') {
      d.options.companion = true;
      d.options.companionA = Math.max(0, m.summonA - 2);
      d.summonedCompanion = true;
    } else if (spell === 'control') e.controlled = true;
    else if (spell === 'earthquake') {
      const damage = roll();
      for (const foe of quailEnemies(d).filter(foe => foe.hp > 0)) {
        foe.hp = Math.max(0, foe.hp - damage);
        event(events, 'spell_hit', foe, damage, damage, foe.hp);
      }
    } else if (spell === 'fireball') {
      let attack = roll() + roll() + m.value;
      if (m.empower) { attack += roll(); d.player.hp -= 2; }
      const damage = Math.max(0, attack - e.d);
      e.hp = Math.max(0, e.hp - damage);
      event(events, 'spell_hit', e, attack, damage, e.hp);
    } else if (spell === 'heal') d.player.hp = d.player.hpMax;
    else if (spell === 'paralyze') e.paralysis = 2;
    else if (spell === 'weaken') {
      const stat = m.weakenDefense ? 'd' : 'a', original = m.weakenDefense ? 'originalD' : 'originalA';
      e[original] ??= e[stat];
      e[stat] = Math.max(0, e[stat] - 2);
    } else if (spell === 'mirror') {
      const damage = e.lastDamage || 0;
      d.player.hp = Math.min(d.player.hpMax, d.player.hp + damage);
      e.hp = Math.max(0, e.hp - damage);
      event(events, 'spell_hit', e, 0, damage, e.hp);
    } else if (spell === 'wind') d.player.ranged.attempts += 2;
  }
  if (!ranged) companionAttack(d, events, roll);
  finish(d, events);
  if (!ranged && !d.finished) events.push(...quailCounter(d, roll));
  return events;
}

const copy = value => structuredClone(value);
function integer(value, min = 0, max = 1000000) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError('Invalid combat value');
  return value;
}
const randomDie = () => Math.floor(Math.random() * 6) + 1;
const die = roll => integer(roll(6), 1, 6);

// Vampire Taint improves supernatural influence. It never triggers the
// previous book's knight corruption/death rule.
export function vampireCharacter(value) {
  const next = copy(value);
  for (const key of ['ws', 's', 't']) integer(next[key], 1, 100);
  integer(next.a, 0, 100); integer(next.w); integer(next.maxW, 1);
  if (next.w > next.maxW) throw new RangeError('Wounds exceed starting Wounds');
  integer(next.taint ??= 5, 1); integer(next.armour ??= 0, 0, 6);
  if (!next.weapon || !Number.isFinite(next.weapon.damage) || next.weapon.damage <= 0 || next.weapon.damage > 1000) throw new RangeError('Invalid weapon multiplier');
  return next;
}

export function vampireRecovery(character, { wounds = 0, taint = 0, restore = false } = {}) {
  const next = vampireCharacter(character);
  integer(Math.abs(wounds)); integer(Math.abs(taint));
  next.w = restore ? next.maxW : Math.max(0, Math.min(next.maxW, next.w + wounds));
  next.taint = Math.max(1, next.taint + taint);
  return next;
}

export function vampireStats(fight) {
  const hero = fight.character, cfg = fight.config, modifiers = cfg.wholeBattlePlayerModifiers ?? {};
  return { ...hero, weapon: cfg.playerWeaponOverride ?? hero.weapon, s: hero.s + (modifiers.s ?? cfg.temporaryPlayerStrength ?? 0),
    t: hero.t + (modifiers.t ?? cfg.temporaryPlayerToughness ?? 0),
    a: Math.max(0, hero.a + (modifiers.a ?? cfg.temporaryPlayerAttacks ?? 0)
      + (cfg.playerExtraAttacks ?? 0) - (fight.options.nextBattleAttackPenalty ? 1 : 0)) };
}

function finish(fight, status, destination) {
  fight.status = status;
  fight.section = destination == null ? null : String(destination);
}
function outcome(fight) {
  const cfg = fight.config;
  if (fight.character.w <= 0) finish(fight, 'loss', cfg.deathSection ?? cfg.loss);
  else if (cfg.immediateEnemyWoundsThreshold !== undefined
      && fight.opponents.every(e => e.w <= cfg.immediateEnemyWoundsThreshold)) {
    finish(fight, cfg.preserveBattleForContinuation ? 'paused' : 'win', cfg.immediateThresholdDestination);
  } else if (fight.opponents.every(e => e.w <= 0)) {
    const target = cfg.quickVictoryRoundLimit && fight.round > cfg.quickVictoryRoundLimit
      ? cfg.slowVictoryDestination : cfg.win;
    finish(fight, 'win', target);
  }
  return fight.status !== 'fighting';
}

export function startVampireFight(character, encounter, options = {}, previous = null) {
  const hero = vampireCharacter(character), cfg = copy(encounter);
  if (!hero.w) throw new RangeError('No Wounds remaining');
  if (!cfg?.enemies?.length || cfg.enemies.length > 100) throw new RangeError('Missing opponents');
  if (!['you', 'enemy'].includes(cfg.initiative)) throw new RangeError('Invalid initiative');
  const opponents = cfg.enemies.map(enemy => {
    if (!enemy.name?.trim()) throw new RangeError('Enter an opponent name');
    const next = vampireCharacter({ ...enemy, maxW: enemy.maxW ?? enemy.w, taint: 1 });
    if (cfg.preservePreviouslyLostEnemyWounds && previous) {
      const saved = previous.opponents.find(unit => unit.name === next.name);
      if (saved) next.w = Math.min(next.w, saved.w);
    }
    return next;
  });
  if (cfg.turnOrder) {
    const expected = ['you', ...opponents.map(e => e.key)];
    if (cfg.turnOrder.length !== expected.length || new Set(cfg.turnOrder).size !== expected.length
        || expected.some(key => !cfg.turnOrder.includes(key))) throw new RangeError('Invalid initiative order');
  }
  const fight = { rulesVersion: 1, ruleset: 'vampire', config: cfg, options: copy(options),
    character: hero, opponents, round: 0, status: 'fighting', section: null,
    history: [], pending: null, roundWins: { you: 0, enemy: 0 }, damageInflicted: 0, damageTaken: 0 };
  if (options.applyEntryEffects && cfg.openingPlayerDamage) hero.w = Math.max(0, hero.w - cfg.openingPlayerDamage);
  outcome(fight);
  return fight;
}

export function resumeVampireFight(saved, continuation) {
  if (saved?.ruleset !== 'vampire' || saved.status !== 'paused'
      || String(saved.config.section) !== String(continuation.resumeSection)) throw new RangeError('No matching paused battle');
  const next = copy(saved);
  next.config.win = continuation.win; next.config.loss = continuation.loss;
  delete next.config.immediateEnemyWoundsThreshold;
  delete next.config.immediateThresholdDestination;
  next.status = 'fighting'; next.section = null; next.recorded = false;
  // Keep opponents, Wounds, dice already rolled and unspent attacks in this round.
  return next;
}

function attack(fight, attacker, defender, player, roll, event) {
  const hero = vampireStats(fight), attacking = player ? hero : attacker, defending = player ? defender : hero;
  const hit = { attacker: attacker.name, defender: defender.name,
    hitThreshold: Math.max(1, 7 - attacking.ws), hitRoll: die(roll) };
  event.attacks.push(hit);
  if (hit.hitRoll < hit.hitThreshold) return;
  const threshold = 4 + defending.t - attacking.s;
  hit.woundThreshold = threshold < 2 ? 0 : threshold > 6 ? Infinity : threshold;
  if (hit.woundThreshold === Infinity) { hit.cannotWound = true; return; }
  if (hit.woundThreshold) {
    hit.woundRoll = die(roll);
    if (hit.woundRoll < hit.woundThreshold && attacking.rerollFailedWounds) hit.woundReroll = die(roll);
    if ((hit.woundReroll ?? hit.woundRoll) < hit.woundThreshold) return;
  } else hit.automaticWound = true;
  if (defending.armour) {
    hit.saveThreshold = defending.armour; hit.saveRoll = die(roll);
    if (hit.saveRoll >= hit.saveThreshold) { hit.saved = true; return; }
  }
  const multiplier = player && defender.undead && attacking.weapon.undeadDamage
    ? attacking.weapon.undeadDamage : attacking.weapon.damage;
  let damage = Math.ceil(attacking.s * multiplier);
  if (!player) {
    if (fight.config.incomingDamageMultiplier) damage = Math.floor(damage * fight.config.incomingDamageMultiplier);
    damage = Math.max(0, damage - (fight.options.bloodstone ? 1 : 0)
      - (fight.options.vanhalRing && attacker.magicalAttack ? 1 : 0));
  }
  hit.damage = damage;
  if (player) event.you += damage; else event.enemy += damage;
  if (fight.config.firstRoundNoWoundsDeducted && fight.round === 1) { hit.noWoundsDeducted = true; return; }
  // These encounters stop to negotiate/control a living opponent, rather than kill it.
  const floor = player && fight.config.immediateEnemyWoundsThreshold !== undefined ? 1 : 0;
  hit.appliedDamage = Math.min(Math.max(0, defender.w - floor), damage);
  defender.w -= hit.appliedDamage;
  if (player) fight.damageInflicted += hit.appliedDamage; else fight.damageTaken += hit.appliedDamage;
  outcome(fight);
}

export function vampireRound(saved, { targets = [] } = {}, roll = randomDie) {
  if (saved?.rulesVersion !== 1 || saved.ruleset !== 'vampire' || saved.status !== 'fighting') throw new RangeError('No active fight');
  const fight = copy(saved), cfg = fight.config;
  if (!Array.isArray(targets)) throw new RangeError('Invalid targets');
  for (const target of targets) integer(target, 0, fight.opponents.length - 1);
  if (outcome(fight)) return fight;
  if (!fight.pending) {
    if (cfg.beforeRoundNumber && fight.round + 1 >= cfg.beforeRoundNumber) {
      finish(fight, 'interrupted', cfg.immediateRoundDestination); return fight;
    }
    const event = { round: ++fight.round, attacks: [], you: 0, enemy: 0 };
    fight.history.push(event); fight.history = fight.history.slice(-100);
    const enemyKeys = fight.opponents.map(e => e.key);
    const order = cfg.turnOrder ?? (cfg.initiative === 'enemy' ? [...enemyKeys, 'you'] : ['you', ...enemyKeys]);
    const actions = [];
    for (const key of order) {
      if (key === 'you') for (let i = 0; i < vampireStats(fight).a; i++) actions.push({ key, target: targets[i] ?? targets.at(-1) });
      else {
        const index = fight.opponents.findIndex(e => e.key === key);
        for (let i = 0; i < fight.opponents[index].a; i++) actions.push({ key, index });
      }
    }
    fight.pending = { actions, cursor: 0 };
  }
  const event = fight.history.at(-1), pending = fight.pending;
  while (pending.cursor < pending.actions.length && fight.status === 'fighting') {
    const action = pending.actions[pending.cursor++];
    if (action.key === 'you') {
      const index = action.target ?? fight.opponents.findIndex(e => e.w > 0);
      if (fight.opponents[index]?.w > 0) attack(fight, fight.character, fight.opponents[index], true, roll, event);
    } else {
      const enemy = fight.opponents[action.index];
      if (enemy.w > 0) attack(fight, enemy, fight.character, false, roll, event);
    }
  }
  if (pending.cursor >= pending.actions.length && fight.status === 'fighting') {
    fight.pending = null;
    if (cfg.joust && event.you !== event.enemy) {
      const winner = event.you > event.enemy ? 'you' : 'enemy';
      if (++fight.roundWins[winner] >= cfg.roundWinsRequired) finish(fight, winner === 'you' ? 'win' : 'loss', winner === 'you' ? cfg.win : cfg.roundLossSection);
    }
  }
  return fight;
}

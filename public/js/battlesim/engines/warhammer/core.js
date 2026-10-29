const copy = value => structuredClone(value);
const randomDie = () => Math.floor(Math.random() * 6) + 1;

function integer(value, min = 0, max = 1000000) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError('Invalid combat value');
  return value;
}
const die = roll => integer(roll(6), 1, 6);
const alive = fight => fight.opponents.map((enemy, index) => enemy.w > 0 ? index : -1).filter(index => index >= 0);
const actor = fight => fight.vehicle ?? fight.character;

function weapon(value, ranged) {
  if (value == null) return null;
  const next = copy(value);
  if (!Number.isFinite(next.damage) || next.damage <= 0 || next.damage > 1000) throw new RangeError('Invalid weapon damage');
  if (ranged) integer(next.s, 1, 6);
  if (ranged && next.ammo !== undefined) {
    integer(next.ammo); integer(next.capacity, 1); integer(next.reserve ?? 0);
    if (next.ammo > next.capacity) throw new RangeError('Ammunition exceeds weapon capacity');
  }
  if (ranged && !Number.isSafeInteger(next.damage)) throw new RangeError('Ranged damage must be a whole number');
  next.fire = Boolean(next.fire); next.poison = Boolean(next.poison);
  return next;
}

export function warhammerCharacter(value) {
  if (!value) throw new TypeError('Missing character');
  const next = copy(value);
  for (const key of ['ws', 's', 't']) integer(next[key], 1, 6);
  for (const key of ['w', 'maxW']) integer(next[key], key === 'maxW' ? 1 : 0);
  if (next.w > next.maxW) throw new RangeError('Wounds exceed starting Wounds');
  for (const key of ['aRanged', 'aClose']) integer(next[key], 1, 100);
  integer(next.purity ?? 0);
  integer(next.armour ?? 0, 0, 6); integer(next.cover ?? 0, 0, 6);
  next.ranged = weapon(next.ranged, true); next.melee = weapon(next.melee, false);
  next.poisoned = Boolean(next.poisoned); next.burning = Boolean(next.burning);
  return next;
}

// The printed chart spans Strength/Toughness 1 through 6. Infinity means
// impossible; zero means automatic damage, with saving throws still allowed.
export function woundThreshold(strength, toughness) {
  integer(strength, 1, 6); integer(toughness, 1, 6);
  const threshold = 4 + toughness - strength;
  return threshold < 2 ? 0 : threshold > 6 ? Infinity : threshold;
}

export function warhammerRecovery(character, { wounds, curePoison = false } = {}) {
  const next = warhammerCharacter(character);
  if (wounds !== undefined) next.w = Math.min(next.maxW, next.w + integer(wounds));
  if (curePoison) next.poisoned = false;
  return next;
}

function opponent(value) {
  if (!value || typeof value.name !== 'string' || !value.name.trim()) throw new RangeError('Missing opponent');
  return warhammerCharacter({ ...value, maxW: value.maxW ?? value.w, purity: 0 });
}

export function startWarhammerFight(character, encounter, mode = 'basic') {
  if (!['basic', 'advanced'].includes(mode)) throw new RangeError('Unknown rules');
  const hero = warhammerCharacter(character);
  if (!hero.w) throw new RangeError('No Wounds remaining');
  if (hero.ranged && hero.ranged.ammo === undefined) throw new RangeError('Enter your weapon ammunition');
  if (!encounter?.enemies?.length) throw new RangeError('Missing opponents');
  const fight = { rulesVersion: 1, mode, character: hero, config: copy(encounter),
    vehicle: null, opponents: [], phase: mode === 'basic' ? 'basic' : 'ranged',
    status: 'fighting', round: 0, rangedRounds: 0, history: [], section: null };
  if (encounter.kind === 'shooting-challenge') {
    integer(encounter.killTarget, 1); integer(encounter.powerPackLimit, 1); integer(encounter.shotsPerPack, 1);
    for (let face = 1; face <= 6; face++) integer(encounter.damageRoll[face], 0);
    fight.shotsLeft = encounter.powerPackLimit * encounter.shotsPerPack;
    fight.kills = 0;
    return fight;
  }
  fight.opponents = encounter.enemies.map(opponent);
  if (mode === 'advanced' && encounter.advancedPlayerProfile) {
    fight.vehicle = warhammerCharacter(encounter.advancedPlayerProfile);
  }
  if (mode === 'advanced' && encounter.skipRanged) fight.phase = 'close';
  if (mode === 'advanced' && (!actor(fight).ranged
      || actor(fight).ranged.ammo === 0 && !actor(fight).ranged.reserve)) fight.phase = 'close';
  if (mode === 'advanced' && encounter.forceCloseOnEmptyAmmo && !actor(fight).ranged?.ammo) fight.phase = 'close';
  return fight;
}

function finish(fight, status) {
  fight.status = status;
  const target = status === 'win' ? fight.config.win : fight.config.loss;
  fight.section = target == null ? null : String(target);
  // Fire ends with this fight; poison lasts until explicitly neutralised.
  fight.character.burning = false;
  if (fight.vehicle) fight.vehicle.burning = false;
}

function outcome(fight) {
  if (actor(fight).w <= 0) finish(fight, 'loss');
  else if (alive(fight).length <= (fight.config.stopWhenRemaining ?? 0)) finish(fight, 'win');
  return fight.status !== 'fighting';
}

function forceClose(fight) {
  if (fight.mode !== 'advanced' || fight.phase !== 'ranged') return;
  const config = fight.config;
  if (config.closeWhenEnemyWBelow !== undefined && fight.opponents.some(enemy => enemy.w < config.closeWhenEnemyWBelow)
      || config.forceCloseOnEmptyAmmo && !actor(fight).ranged?.ammo) fight.phase = 'close';
}

function selectedWeapon(fight, unit, choice, hero) {
  if (fight.phase === 'close') return unit.melee;
  if (fight.phase === 'ranged') return unit.ranged;
  if (hero) {
    if (!['ranged', 'melee'].includes(choice)) throw new RangeError('Choose a weapon');
    return unit[choice];
  }
  return unit.ranged ?? unit.melee;
}

function savingThrow(unit, phase) {
  return [unit.armour, ...(phase === 'close' ? [] : [unit.cover])].filter(value => value > 0).sort((a,b) => a-b)[0];
}

function attack(fight, attacker, defender, used, roll, event, basicHits) {
  const entry = { attacker: attacker.name ?? 'You', defender: defender.name ?? 'You', weapon: used.name ?? '',
    hitRoll: die(roll), hitThreshold: 7 - attacker.ws };
  event.attacks.push(entry);
  if (used === attacker.ranged && used.ammo !== undefined) used.ammo--;
  if (entry.hitRoll < entry.hitThreshold) return;
  if (fight.mode === 'advanced') {
    const strength = fight.phase === 'close' ? attacker.s : used.s;
    entry.woundThreshold = woundThreshold(strength, defender.t);
    // Do not roll for the two exceptional chart entries.
    if (entry.woundThreshold === Infinity) { entry.cannotWound = true; return; }
    if (entry.woundThreshold !== 0) {
      entry.woundRoll = die(roll);
      if (entry.woundRoll < entry.woundThreshold) return;
    } else entry.automaticWound = true;
  }
  entry.saveThreshold = savingThrow(defender, fight.phase);
  if (entry.saveThreshold) {
    entry.saveRoll = die(roll);
    if (entry.saveRoll >= entry.saveThreshold) { entry.saved = true; return; }
  }
  if (fight.mode === 'basic') {
    const existing = basicHits.find(group => group.defender === defender && group.weapon === used);
    if (existing) existing.hits++;
    else basicHits.push({ defender, weapon: used, hits: 1 });
  } else {
    entry.damage = fight.phase === 'close' ? Math.ceil(attacker.s * used.damage) : used.damage;
    damage(defender, entry.damage, used);
  }
}

function damage(unit, amount, used) {
  unit.w = Math.max(0, unit.w - amount);
  if (unit.w > 0 && used?.fire) unit.burning = true;
  if (unit.w > 0 && used?.poison) unit.poisoned = true;
}

function takeTurn(fight, unit, targets, choice, roll, event, hero) {
  if (unit.w <= 0 || fight.status !== 'fighting') return;
  const used = selectedWeapon(fight, unit, choice, hero);
  const attacks = fight.mode === 'basic' || fight.phase === 'ranged' ? unit.aRanged : unit.aClose;
  if (!used || used === unit.ranged && used.ammo !== undefined && used.ammo === 0) {
    if (hero) event.noWeapon = true;
    return;
  }
  const basicHits = [];
  for (let index = 0; index < attacks && fight.status === 'fighting'; index++) {
    if (used === unit.ranged && used.ammo !== undefined && !used.ammo) break;
    let target = actor(fight);
    if (hero) {
      const candidate = targets[index] ?? targets.at(-1) ?? alive(fight)[0];
      integer(candidate, 0, fight.opponents.length-1);
      target = fight.opponents[candidate];
      if (!target.w) continue; // An explicitly allocated attack is not silently reassigned.
    }
    attack(fight, unit, target, used, roll, event, basicHits);
    if (fight.mode === 'advanced' && outcome(fight)) break;
  }
  for (const group of basicHits) {
    const amount = Math.ceil(group.hits * group.weapon.damage);
    event.damage.push({ defender: group.defender.name ?? 'You', hits: group.hits, damage: amount });
    damage(group.defender, amount, group.weapon);
    if (outcome(fight)) break;
  }
  forceClose(fight);
}

function shootingRound(fight, roll) {
  const event = { round: ++fight.round, hitRoll: die(roll), hitThreshold: 7 - fight.character.ws };
  fight.shotsLeft--;
  if (event.hitRoll >= event.hitThreshold) {
    event.damageRoll = die(roll); event.kills = fight.config.damageRoll[event.damageRoll];
    fight.kills += event.kills;
  } else event.kills = 0;
  if (fight.kills >= fight.config.killTarget) finish(fight, 'win');
  else if (!fight.shotsLeft) finish(fight, 'loss');
  fight.history.push(event);
  return fight;
}

export function warhammerRound(saved, { targets = [], weapon: choice = 'ranged', close = false, reload = false } = {}, roll = randomDie) {
  if (saved?.rulesVersion !== 1 || saved.status !== 'fighting') throw new RangeError('No active fight');
  const fight = copy(saved);
  if (fight.config.kind === 'shooting-challenge') return shootingRound(fight, roll);
  const hero = actor(fight);
  if (!Array.isArray(targets)) throw new RangeError('Invalid targets');
  for (const target of targets) integer(target, 0, fight.opponents.length-1);
  if (close) {
    if (fight.mode !== 'advanced' || fight.phase !== 'ranged' || fight.round < 1 || reload) throw new RangeError('Cannot enter Close Combat now');
    fight.phase = 'close';
  }
  forceClose(fight);
  if (reload && (fight.mode !== 'advanced' || fight.phase !== 'ranged' || !hero.ranged
      || hero.ranged.ammo === undefined || !hero.ranged.reserve || hero.ranged.ammo >= hero.ranged.capacity)) throw new RangeError('Cannot reload now');
  if (!reload && fight.mode === 'basic' && (!selectedWeapon(fight, hero, choice, true)
      || choice === 'ranged' && hero.ranged.ammo === 0)) throw new RangeError('Choose a usable weapon');
  const ranged = fight.phase === 'ranged';
  const event = { round: ++fight.round, phase: fight.phase, attacks: [], damage: [], effects: [], reload };
  const playerTurn = () => {
    if (fight.status !== 'fighting') return;
    if (reload) {
      // A fresh pack/clip replaces the current one; remaining rounds are not
      // invented or transferred to the new pack.
      hero.ranged.ammo = hero.ranged.capacity; hero.ranged.reserve--;
    } else takeTurn(fight, hero, targets, choice, roll, event, true);
  };
  const enemyTurn = () => {
    for (const enemy of fight.opponents) {
      takeTurn(fight, enemy, [], choice, roll, event, false);
      if (fight.status !== 'fighting') break;
    }
  };
  if (fight.config.initiative === 'enemy') { enemyTurn(); playerTurn(); }
  else { playerTurn(); enemyTurn(); }
  if (fight.status === 'fighting') {
    for (const unit of [hero, ...fight.opponents]) {
      if (!unit.w) continue;
      const amount = Number(unit.burning) + Number(unit.poisoned);
      if (amount) { damage(unit, amount); event.effects.push({ name: unit.name ?? 'You', damage: amount }); }
    }
    outcome(fight);
  } else if (fight.status === 'win' && hero.poisoned && hero.w > 0) {
    // Poison still ticks in the round that kills the last opponent. Winning a
    // succession of short fights must not silently neutralise it.
    damage(hero, 1);
    event.effects.push({ name: hero.name ?? 'You', damage: 1 });
    if (!hero.w) finish(fight, 'loss');
  }
  if (ranged) fight.rangedRounds++;
  if (fight.status === 'fighting') {
    const config = fight.config;
    if (config.surviveRounds && fight.round >= config.surviveRounds) finish(fight, 'win');
    if (fight.mode === 'advanced' && (config.closeAfterRanged && fight.rangedRounds >= config.closeAfterRanged
        || config.closeCombatCondition && fight.rangedRounds >= config.closeCombatCondition.afterRound
          && fight.opponents.length - alive(fight).length < config.closeCombatCondition.ifKillsLessThan)) fight.phase = 'close';
  }
  fight.history.push(event);
  return fight;
}

export function reloadWarhammerAfterFight(character) {
  const next = warhammerCharacter(character), gun = next.ranged;
  if (!gun || !gun.reserve || gun.ammo >= gun.capacity) throw new RangeError('No reload available');
  gun.ammo = gun.capacity; gun.reserve--;
  return next;
}

const copy = value => structuredClone(value);
const integer = (n, min = 0, max = 10000) => {
  if (!Number.isSafeInteger(n) || n < min || n > max) throw new RangeError('Invalid score');
  return n;
};
const die = random => {
  const value = random();
  if (!(value >= 0 && value < 1)) throw new RangeError('Invalid random value');
  return Math.floor(value * 6) + 1;
};
const dice = random => [die(random), die(random)];
const total = values => values.reduce((a, b) => a + b, 0);
const pick = (values, random) => values[Math.floor(random() * values.length)];
const living = (fight, enemy = false) => enemy
  ? fight.enemies.map((row, i) => row.stamina > (fight.config.enemyFloor ?? 0) ? i : -1).filter(i => i >= 0)
  : fight.party.filter(key => fight.character.crew[key].stamina > 0);

export function createCombat({CREW, COMPANIONS, OFFICERS, encounterFor}) {
function newCharacter(random = Math.random) {
  const crew = Object.fromEntries(CREW.map(key => {
    const skill = die(random) + 6, stamina = total(dice(random)) + 12;
    return [key, {skill, skillInitial: skill, stamina, staminaInitial: stamina, replaced: false}];
  }));
  crew.macom = {skill: 9, skillInitial: 9, stamina: 12, staminaInitial: 12, replaced: false};
  crew.eagle = {skill: 6, skillInitial: 6, stamina: 5, staminaInitial: 5, replaced: false};
  const weapons = die(random) + 6, shields = die(random) + 12, luck = die(random) + 6;
  return {crew, ship: {weapons, weaponsInitial: weapons, shields, shieldsInitial: shields, destroyed: false}, luck, luckInitial: luck, helmet: false};
}

function validateCharacter(character) {
  if (!character?.crew || !character.ship) throw new RangeError('Missing character');
  for (const key of [...CREW, ...COMPANIONS]) {
    const row = character.crew[key];
    for (const field of ['skill', 'skillInitial', 'stamina', 'staminaInitial']) integer(row?.[field]);
    if (row.skill > row.skillInitial || row.stamina > row.staminaInitial) throw new RangeError('Above initial value');
  }
  for (const key of ['weapons', 'weaponsInitial', 'shields', 'shieldsInitial']) integer(character.ship[key]);
  if (character.ship.weapons > character.ship.weaponsInitial || character.ship.shields > character.ship.shieldsInitial) throw new RangeError('Above initial ship value');
  integer(character.luck); integer(character.luckInitial);
  if (character.luck > character.luckInitial) throw new RangeError('Above initial Luck');
  return character;
}

function recover(character, kind, key, random = Math.random) {
  const next = copy(validateCharacter(character));
  if (next.crew.captain.stamina <= 0) throw new RangeError('Captain dead');
  if (kind === 'replace') {
    if (!CREW.includes(key) || key === 'captain' || next.crew[key].stamina > 0 || next.crew[key].replaced) throw new RangeError('Cannot replace');
    const skill = Math.max(0, next.crew[key].skillInitial - 2), stamina = total(dice(random)) + 12;
    next.crew[key] = {skill, skillInitial: skill, stamina, staminaInitial: stamina, replaced: true};
  } else if (kind === 'planet') {
    const doctor = next.crew.medical;
    if (doctor.stamina <= 0) throw new RangeError('Doctor unavailable');
    for (const member of Object.values(next.crew)) if (member.stamina > 0) member.stamina = Math.min(member.staminaInitial, member.stamina + (doctor.replaced ? 1 : 2));
  } else if (kind === 'luck') {
    const roll = total(dice(random)), lucky = roll <= next.luck;
    next.luck = Math.max(0, next.luck - 1);
    return {character: next, roll, lucky};
  } else throw new RangeError('Unknown recovery');
  return next;
}

function startFight(section, character, setup = {}, random = Math.random) {
  const c = copy(validateCharacter(character)), preset = encounterFor(section);
  if (c.crew.captain.stamina <= 0 || c.ship.destroyed) throw new RangeError('Adventure over');
  const config = {...copy(preset ?? {}), mode: preset?.mode ?? setup.mode ?? 'hand'};
  if (!['hand', 'phaser', 'ship'].includes(config.mode)) throw new RangeError('Invalid combat mode');
  config.attackModifier = integer(Number(setup.attackModifier ?? 0), -1000, 1000);
  config.enemyFirst = preset?.enemyFirst ?? Boolean(setup.enemyFirst);
  config.phaserSetting = setup.phaserSetting === 'stun' ? 'stun' : 'kill';
  const source = setup.opponents ?? preset?.enemies;
  if (!Array.isArray(source) || !source.length || source.length > 100 || preset && source.length !== preset.enemies.length) throw new RangeError('Invalid opponents');
  let enemies = source.map(row => ({displayName: String(row.displayName ?? '').trim().slice(0, 200), skill: integer(Number(row.skill)), stamina: integer(Number(row.stamina)), initial: integer(Number(row.stamina)), destroyed: false}));
  if (config.mode === 'ship' && enemies.length !== 1) throw new RangeError('One enemy ship required');
  if (config.mode !== 'ship' && enemies.some(e => e.stamina < 1)) throw new RangeError('Enemy must be alive');
  let party = [...new Set(config.party ?? setup.party ?? ['captain'])];
  if (config.party) party = party.filter(key => c.crew[key].stamina > 0 && !c.crew[key].replaced);
  if (config.pairedCrew) enemies = enemies.filter((_, i) => party.includes(CREW[i]));
  if (!party.length || party.some(key => ![...CREW, ...COMPANIONS].includes(key) || !c.crew[key].stamina || c.crew[key].replaced)) throw new RangeError('Invalid away team');
  if (config.dividedCaptain) Object.assign(c.crew.captain, {skill: 6, stamina: 7});
  if (config.madCrew) {
    const mad = c.crew[setup.madKey ?? 'guard1'];
    if (!mad || mad.stamina <= 0 || (setup.madKey ?? 'guard1') === 'captain') throw new RangeError('Invalid opponent crew');
    enemies[0] = {...enemies[0], skill: mad.skill + 3, stamina: mad.stamina, initial: mad.stamina};
    config.madKey = setup.madKey ?? 'guard1';
    party = ['captain'];
  }
  const assignments = enemies.map((_, i) => party[i % party.length]);
  return {rulesVersion: 1, section: Number(section), config, character: c, enemies, party, assignments,
    initialStamina: Object.fromEntries(party.map(key => [key, c.crew[key].stamina])), rounds: 0, events: [], outcome: null};
}

function finish(fight) {
  const alive = living(fight), remaining = living(fight, true), c = fight.config;
  if (fight.character.crew.captain.stamina <= 0 || fight.character.ship.destroyed) fight.outcome = 'loss';
  else if (c.firstWound && fight.party.some(key => fight.character.crew[key].stamina < fight.initialStamina[key])) {
    fight.outcome = 'continue'; fight.destination = c.destination;
  } else if (!alive.length) fight.outcome = 'loss';
  else if (c.mode === 'ship' ? fight.enemies[0].destroyed : !remaining.length || c.killOne && remaining.length < fight.enemies.length) {
    fight.outcome = 'win'; fight.destination = c.destination;
  } else if (c.lossLimit && alive.some(key => fight.initialStamina[key] - fight.character.crew[key].stamina >= c.lossLimit)
    || c.stopStamina != null && alive.some(key => fight.character.crew[key].stamina <= c.stopStamina)) {
    fight.outcome = 'continue'; fight.destination = c.lossDestination;
  }
  return fight;
}

function damage(fight, player, enemyIndex, outgoing, random) {
  const c = fight.config, target = outgoing ? fight.enemies[enemyIndex] : fight.character.crew[player];
  let amount = 2, roll;
  if (outgoing && c.revealArmour) {
    c.revealArmour = false; c.armour = true;
    fight.events.push({kind: 'armourRevealed', destination: 183}); return;
  }
  if (outgoing && c.armour) { roll = die(random); amount = roll >= 5 ? 1 : 0; }
  if (!outgoing && c.nerve) { roll = die(random); amount = roll >= 4 ? 4 : 2; }
  target.stamina = Math.max(0, target.stamina - amount);
  fight.events.push({kind: 'damage', player, enemy: enemyIndex, outgoing, amount, roll});
}

function resolveHand(fight, targets, rolls, random) {
  const config = fight.config, players = living(fight);
  const enemies = config.sequential ? living(fight, true).slice(0, 1) : living(fight, true);
  const effective = key => fight.character.crew[key].skill - (OFFICERS.includes(key) && !config.waivePenalty ? 3 : 0)
    + (key === 'captain' && fight.character.helmet ? 1 : 0) + config.attackModifier;
  const pAS = Object.fromEntries(players.map(key => [key, total(rolls.player[key]) + effective(key)]));
  const eAS = Object.fromEntries(enemies.map(i => [i, total(rolls.enemy[i]) + fight.enemies[i].skill + (config.enemyModifier ?? 0)]));
  const pTargets = Object.fromEntries(players.map((key, i) => [key, enemies.includes(Number(targets[key])) ? Number(targets[key]) : enemies[i % enemies.length]]));
  const eTargets = Object.fromEntries(enemies.map(i => [i, players.includes(fight.assignments[i]) ? fight.assignments[i] : pick(players, random)]));
  if (config.passive) for (const i of enemies) if (!Object.values(pTargets).includes(i)) delete eTargets[i];
  if (config.doubleAttack) {
    const i = enemies[0], secondAS = total(dice(random)) + fight.enemies[i].skill;
    let first, second;
    if (config.doubleAttack === 'strongest') {
      const max = Math.max(...players.map(key => fight.character.crew[key].stamina));
      first = second = pick(players.filter(key => fight.character.crew[key].stamina === max), random);
    } else {
      first = pick(players, random); second = players.length > 1 ? pick(players.filter(key => key !== first), random) : first;
    }
    eTargets[i] = first;
    for (const key of players) if (pAS[key] > (key === second ? Math.max(eAS[i], secondAS) : eAS[i])) damage(fight, key, i, true, random);
    if (eAS[i] > pAS[first]) damage(fight, first, i, false, random);
    if (secondAS > pAS[second]) damage(fight, second, i, false, random);
    fight.events.push({kind: 'extraAttack', player: second, enemy: i, attack: secondAS});
  } else {
    for (const key of players) {
      const i = pTargets[key];
      if (pAS[key] > eAS[i]) damage(fight, key, i, true, random);
    }
    for (const i of enemies) {
      const attacked = config.robotEveryone ? players : eTargets[i] ? [eTargets[i]] : [];
      for (const key of attacked) if (eAS[i] > pAS[key]) damage(fight, key, i, false, random);
    }
  }
  fight.events.unshift({kind: 'hand', playerScores: pAS, enemyScores: eAS});
  if (config.conflict) {
    const roll = die(random), options = roll === 1 ? living(fight) : roll === 6 ? living(fight, true) : [];
    fight.pendingConflict = options.length ? {outgoing: roll === 6, options, roll} : null;
    fight.events.push({kind: 'conflict', roll});
  }
  finish(fight);
  if (!fight.outcome && config.restraint && fight.rounds >= 2) {
    const roll = die(random); fight.events.push({kind: 'restraint', roll});
    if (roll >= 5) fight.outcome = 'restrained';
  }
  if (config.madCrew) fight.character.crew[config.madKey].stamina = fight.enemies[0].stamina;
  return fight;
}

function shipHit(fight, target, random) {
  if (target.shields === 0) { target.destroyed = true; return 0; }
  const value = total(dice(random)), amount = value === 12 ? 6 : value <= target.shields ? 2 : 4;
  target.shields = Math.max(0, target.shields - amount);
  return amount;
}

function shipRound(fight, random) {
  const own = fight.character.ship, enemy = fight.enemies[0];
  const foe = {weapons: enemy.skill, shields: enemy.stamina, destroyed: enemy.destroyed};
  for (const outgoing of fight.config.enemyFirst ? [false, true] : [true, false]) {
    if (own.destroyed || foe.destroyed) break;
    const attacker = outgoing ? own : foe, defender = outgoing ? foe : own, roll = total(dice(random));
    const hit = roll < attacker.weapons, amount = hit ? shipHit(fight, defender, random) : 0;
    fight.events.push({kind: 'ship', outgoing, roll, hit, amount, destroyed: defender.destroyed});
  }
  enemy.stamina = foe.shields; enemy.destroyed = foe.destroyed;
  return finish(fight);
}

function phaserRound(fight, targets, random) {
  const c = fight.config, range = c.closingRange ? Math.max(0, 4 - fight.rounds) : 0;
  for (const outgoing of c.enemyFirst ? [false, true] : [true, false]) {
    if (!outgoing && c.noReturnFire) continue;
    const shooters = outgoing ? living(fight) : living(fight, true);
    for (const shooter of shooters) {
      const victims = outgoing ? living(fight, true) : living(fight);
      if (!victims.length || fight.character.crew.captain.stamina <= 0) break;
      const chosen = outgoing ? Number(targets[shooter]) : fight.assignments[shooter];
      const target = victims.includes(chosen) && !(c.randomTargets && !outgoing) ? chosen : pick(victims, random);
      const skill = outgoing ? fight.character.crew[shooter].skill - (OFFICERS.includes(shooter) ? 3 : 0)
        + (shooter === 'captain' && fight.character.helmet ? 1 : 0) + c.attackModifier : fight.enemies[shooter].skill;
      const roll = total(dice(random)) + range + (outgoing ? c.playerRange ?? 0 : c.enemyRange ?? 0), hit = roll < skill;
      if (hit) (outgoing ? fight.enemies[target] : fight.character.crew[target]).stamina = 0;
      fight.events.push({kind: 'phaser', outgoing, shooter, target, roll, skill, hit});
    }
    finish(fight); if (fight.outcome) break;
  }
  if (!fight.outcome && c.roundLimit && fight.rounds >= c.roundLimit) { fight.outcome = 'escaped'; fight.destination = c.lossDestination; }
  return fight;
}

function round(original, targets = {}, random = Math.random) {
  if (!original || original.rulesVersion !== 1 || original.outcome || original.pending || original.pendingConflict) throw new RangeError('Fight not ready');
  const fight = copy(original); fight.rounds++; fight.events = [];
  if (fight.config.mode === 'ship') return shipRound(fight, random);
  if (fight.config.mode === 'phaser') return phaserRound(fight, targets, random);
  const enemies = fight.config.sequential ? living(fight, true).slice(0, 1) : living(fight, true);
  const rolls = {player: Object.fromEntries(living(fight).map(key => [key, dice(random)])), enemy: Object.fromEntries(enemies.map(i => [i, dice(random)]))};
  if (rolls.player.macom) { fight.pending = {targets: copy(targets), rolls}; return fight; }
  return resolveHand(fight, targets, rolls, random);
}

function resolveReroll(original, reroll, random = Math.random) {
  if (!original?.pending || original.outcome) throw new RangeError('No pending reroll');
  const fight = copy(original), {targets, rolls} = fight.pending;
  if (reroll) rolls.player.macom = dice(random);
  fight.pending = null;
  return resolveHand(fight, targets, rolls, random);
}

function resolveConflict(original, target) {
  const fight = copy(original), pending = fight.pendingConflict;
  if (!pending || !pending.options.includes(target) || fight.outcome) throw new RangeError('Invalid conflict target');
  const victim = pending.outgoing ? fight.enemies[target] : fight.character.crew[target];
  victim.stamina = Math.max(0, victim.stamina - 1);
  fight.events = [{kind: 'damage', player: pending.outgoing ? null : target, enemy: pending.outgoing ? target : null, outgoing: pending.outgoing, amount: 1}];
  fight.pendingConflict = null;
  return finish(fight);
}

function surrender(original) {
  const fight = copy(original), c = fight.config;
  if (fight.outcome || !c.surrender || c.surrenderBelow != null && !fight.party.some(key => fight.character.crew[key].stamina < c.surrenderBelow)) throw new RangeError('Cannot surrender');
  fight.outcome = 'surrender'; fight.destination = c.surrender; fight.events = []; fight.pending = fight.pendingConflict = null;
  return fight;
}

return {newCharacter, validateCharacter, recover, startFight, round, resolveReroll, resolveConflict, surrender};
}

import { legendaryInteger, legendaryDie } from './character.js';

export const LEGENDARY_ZONES = Object.freeze(['left', 'centre', 'right']);

function validateFormation(formation, twoFrontLines = false) {
  if (!Array.isArray(formation) || formation.length !== 3) throw new RangeError('Choose three combat zones');
  const units = [];
  for (const zone of formation) {
    if (!Array.isArray(zone) || zone.length > 2) throw new RangeError('At most two units per zone');
    for (const unit of zone) {
      if (twoFrontLines && unit === null) continue;
      if (!unit || typeof unit.name !== 'string' || !unit.name.trim() || unit.routed)
        throw new RangeError('Choose an available army unit');
      legendaryInteger(unit.strength);
      legendaryInteger(unit.morale);
      legendaryInteger(unit.firstRoundBonus ?? 0);
      units.push(unit);
    }
  }
  if (!units.length || new Set(units).size !== units.length) throw new RangeError('Choose distinct army units');
}

function controls(side, other) {
  return side.filter((zone, index) => zone.some(Boolean) && !other[index].some(Boolean)).length;
}

function contestedZones(fight) {
  return fight.player.filter((row,index) => row.some(Boolean) && fight.enemy[index].some(Boolean) &&
    !row.some((unit,position) => unit && fight.enemy[index][position])).length;
}

function concludeArmy(fight) {
  if (controls(fight.player, fight.enemy) >= 2) {
    fight.status = 'won';
    fight.destination = fight.rules.win ?? null;
  } else if (controls(fight.enemy, fight.player) + (fight.rules.twoFrontLines ? contestedZones(fight) : 0) >= 2) {
    fight.status = 'lost';
    fight.destination = fight.rules.loss ?? null;
  } else if (!fight.player.some((zone, index) => fight.rules.twoFrontLines ?
      zone.some((unit,position) => unit && fight.enemy[index][position]) : zone.length && fight.enemy[index].length)) {
    // No printed movement rule can resolve two armies holding separate single zones.
    fight.status = 'stalemate';
  } else return false;
  if (fight.status === 'won' || fight.status === 'lost') {
    const loser = fight.status === 'won' ? 'enemy' : 'player';
    for (const zone of fight[loser]) {
      for (const unit of zone) if (unit) fight.routed[loser].push({ ...unit, routed: true });
      zone.length = 0;
    }
  }
  return true;
}

export function startLegendaryArmy(player, enemy, rules = {}) {
  if (rules.twoFrontLines !== undefined && typeof rules.twoFrontLines !== 'boolean') throw new RangeError('Invalid front-line rules');
  validateFormation(player, rules.twoFrontLines);
  validateFormation(enemy, rules.twoFrontLines);
  const copyFormation = rows => structuredClone(rows).map(row => rules.twoFrontLines ? [row[0] ?? null,row[1] ?? null] : row);
  const fight = { rulesVersion: 1, status: 'active', player: copyFormation(player), enemy: copyFormation(enemy),
    routed: { player: [], enemy: [] }, rules: structuredClone(rules), round: 1, zone: 0, log: [], destination: null };
  if (rules.twoFrontLines) fight.position = 0;
  concludeArmy(fight);
  return fight;
}

function requireArmy(input) {
  if (!input || input.rulesVersion !== 1 || input.status !== 'active') throw new RangeError('No active army battle');
  return structuredClone(input);
}

function moraleCheck(fight, side, zone, roll, position = 0) {
  const unit = fight[side][zone][position];
  const die = legendaryDie(roll);
  const routed = die > unit.morale;
  if (routed) {
    fight.routed[side].push({ ...unit, routed: true });
    if (fight.rules.twoFrontLines) fight[side][zone][position] = null;
    else fight[side][zone].splice(position,1);
  }
  else unit.morale = Math.max(0, unit.morale - 1);
  return { die, routed };
}

export function legendaryArmyStep(input, roll) {
  const fight = requireArmy(input);
  const zone = fight.zone;
  const friendly = fight.rules.friendlySpellSchedule?.find(spell => spell.round === fight.round);
  if (zone === 0 && friendly && fight.friendlySpellRound !== fight.round) {
    fight.pendingArmySpell = {...friendly};
    return fight;
  }
  const scheduled = fight.rules.enemySpellSchedule?.find(spell => spell.round === fight.round);
  if (zone === 0 && scheduled && fight.enemySpellRound !== fight.round) {
    const troop = fight.player[scheduled.zone][0];
    let check = null;
    if (troop) {
      if (scheduled.effect === 'rout') check = moraleCheck(fight,'player',scheduled.zone,roll);
      else if (scheduled.effect === 'enfeeblement') troop.strength = Math.max(0,troop.strength-1);
      else if (scheduled.effect === 'clingingDread') troop.morale = Math.max(0,troop.morale-1);
      else throw new RangeError('Unknown scheduled army spell');
    }
    fight.enemySpellRound = fight.round;
    fight.log = [...fight.log.slice(-59),{round:fight.round,type:'enemyArmySpell',...scheduled,targetPresent:!!troop,check}];
    if (concludeArmy(fight)) return fight;
  }
  if (zone === 0 && fight.rules.descantos && fight.descantosRound !== fight.round && fight.round <= 3) {
    const target = fight.round === 1 ? 1 : 0;
    const unit = fight.player[target][0];
    if (unit) {
      if (fight.round === 1) unit.strength = Math.max(0, unit.strength - 1);
      else if (fight.round === 2) unit.morale = Math.max(0, unit.morale - 1);
      else moraleCheck(fight, 'player', target, roll);
    }
    fight.descantosRound = fight.round;
    fight.log = [...fight.log.slice(-59), { round: fight.round, zone: target, type: 'descantos',
      spell: ['enfeeblement', 'clingingDread', 'rout'][fight.round - 1], targetPresent: !!unit }];
    if (concludeArmy(fight)) return fight;
  }
  const position = fight.rules.twoFrontLines ? fight.position : 0;
  const own = fight.player[zone][position], enemy = fight.enemy[zone][position];
  if (own && enemy) {
    const enemyDie = legendaryDie(roll), ownDie = legendaryDie(roll);
    const bonus = unit => fight.round === 1 && !(fight.rules.defensiveSiege && unit.type === 'cavalry') ? unit.firstRoundBonus ?? 0 : 0;
    let playerModifier = ['missile','longbow'].includes(own.type) ? enemy.missileVulnerability ?? 0 : 0;
    if (fight.rules.flankClimbingPenalty && zone !== 1 && own.type !== 'longbow') playerModifier--;
    if (fight.rules.defensiveSiege) playerModifier += own.type === 'cavalry' ? -1 : zone === 1 ? 0 : 1;
    const enemyModifier = own.type === 'cavalry' ? enemy.antiCavalryBonus ?? 0 : 0;
    const enemyScore = enemy.strength + bonus(enemy) + enemyModifier + enemyDie;
    const playerScore = Math.max(0,own.strength + playerModifier) + bonus(own) + ownDie;
    const loser = enemyScore > playerScore ? 'player' : enemyScore < playerScore ? 'enemy' : null;
    const check = loser ? moraleCheck(fight, loser, zone, roll, position) : null;
    fight.log = [...fight.log.slice(-59), { round: fight.round, zone, enemyDie, ownDie, enemyScore, playerScore, loser, check,
      ...(fight.rules.twoFrontLines ? {position} : {}) }];
  }
  if (!concludeArmy(fight)) {
    if (fight.rules.twoFrontLines && position === 0) fight.position = 1;
    else {
      if (fight.rules.twoFrontLines) fight.position = 0;
      fight.zone = (zone + 1) % 3;
      if (fight.zone === 0) fight.round++;
    }
  }
  return fight;
}

export function legendaryArmyEffect(input, side, zone, effect, roll, { position = 0 } = {}) {
  const fight = requireArmy(input);
  if (!['player', 'enemy'].includes(side)) throw new RangeError('Invalid army side');
  legendaryInteger(zone, 0, 2);
  legendaryInteger(position,0,1);
  const unit = fight[side][zone][position];
  if (!unit) throw new RangeError('No front unit in this zone');
  if (effect === 'enfeeblement') unit.strength = Math.max(0, unit.strength - 1);
  else if (effect === 'clingingDread') unit.morale = Math.max(0, unit.morale - 1);
  else if (effect === 'rout') moraleCheck(fight, side, zone, roll, position);
  else throw new RangeError('Unknown army effect');
  fight.log = [...fight.log.slice(-59), { round: fight.round, zone, type: 'effect', side, effect }];
  concludeArmy(fight);
  return fight;
}

export function legendaryArmyChooseScheduled(input, zone, position = 0, roll) {
  const fight = requireArmy(input);
  const spell = fight.pendingArmySpell;
  if (!spell || spell.round !== fight.round || fight.friendlySpellRound === fight.round)
    throw new RangeError('No allied army spell is waiting for a target');
  const result = legendaryArmyEffect(fight,'enemy',zone,spell.effect,roll,{position});
  result.friendlySpellRound = fight.round;
  delete result.pendingArmySpell;
  return result;
}

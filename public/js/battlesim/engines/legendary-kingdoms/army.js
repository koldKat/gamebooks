import { legendaryInteger, legendaryDie } from './character.js';

export const LEGENDARY_ZONES = Object.freeze(['left', 'centre', 'right']);

function validateFormation(formation) {
  if (!Array.isArray(formation) || formation.length !== 3) throw new RangeError('Choose three combat zones');
  const units = [];
  for (const zone of formation) {
    if (!Array.isArray(zone) || zone.length > 2) throw new RangeError('At most two units per zone');
    for (const unit of zone) {
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
  return side.filter((zone, index) => zone.length > 0 && other[index].length === 0).length;
}

function concludeArmy(fight) {
  if (controls(fight.player, fight.enemy) >= 2) {
    fight.status = 'won';
    fight.destination = fight.rules.win ?? null;
  } else if (controls(fight.enemy, fight.player) >= 2) {
    fight.status = 'lost';
    fight.destination = fight.rules.loss ?? null;
  } else if (!fight.player.some((zone, index) => zone.length && fight.enemy[index].length)) {
    // No printed movement rule can resolve two armies holding separate single zones.
    fight.status = 'stalemate';
  } else return false;
  if (fight.status === 'won' || fight.status === 'lost') {
    const loser = fight.status === 'won' ? 'enemy' : 'player';
    for (const zone of fight[loser]) {
      for (const unit of zone) fight.routed[loser].push({ ...unit, routed: true });
      zone.length = 0;
    }
  }
  return true;
}

export function startLegendaryArmy(player, enemy, rules = {}) {
  validateFormation(player);
  validateFormation(enemy);
  const fight = { rulesVersion: 1, status: 'active', player: structuredClone(player), enemy: structuredClone(enemy),
    routed: { player: [], enemy: [] }, rules: structuredClone(rules), round: 1, zone: 0, log: [], destination: null };
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
  if (routed) fight.routed[side].push({ ...fight[side][zone].splice(position,1)[0], routed: true });
  else unit.morale = Math.max(0, unit.morale - 1);
  return { die, routed };
}

export function legendaryArmyStep(input, roll) {
  const fight = requireArmy(input);
  const zone = fight.zone;
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
  const own = fight.player[zone][0], enemy = fight.enemy[zone][0];
  if (own && enemy) {
    const enemyDie = legendaryDie(roll), ownDie = legendaryDie(roll);
    const bonus = unit => fight.round === 1 ? unit.firstRoundBonus ?? 0 : 0;
    const enemyScore = enemy.strength + bonus(enemy) + enemyDie;
    const playerScore = own.strength + bonus(own) + ownDie;
    const loser = enemyScore > playerScore ? 'player' : enemyScore < playerScore ? 'enemy' : null;
    const check = loser ? moraleCheck(fight, loser, zone, roll) : null;
    fight.log = [...fight.log.slice(-59), { round: fight.round, zone, enemyDie, ownDie, enemyScore, playerScore, loser, check }];
  }
  if (!concludeArmy(fight)) {
    fight.zone = (zone + 1) % 3;
    if (fight.zone === 0) fight.round++;
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

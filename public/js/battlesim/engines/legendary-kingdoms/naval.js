import { legendaryInteger, legendaryPool } from './character.js';

function validateShip(ship, alive = false) {
  if (!ship || typeof ship.name !== 'string' || !ship.name.trim()) throw new RangeError('Invalid ship');
  legendaryInteger(ship.fighting);
  legendaryInteger(ship.health, alive ? 1 : 0);
}

function endFight(fight) {
  if (fight.ship.health === 0) {
    fight.status = 'lost';
    fight.destination = fight.rules.loss ?? null;
  } else if (fight.enemy.health === 0) {
    fight.status = 'won';
    fight.destination = fight.rules.win ?? null;
  }
  if (fight.status !== 'active') fight.phase = 'ended';
}

function active(input) {
  if (!input || input.rulesVersion !== 1 || input.status !== 'active') throw new RangeError('No active naval battle');
  return structuredClone(input);
}

export function startLegendaryNaval(ship, enemy, rules = {}) {
  validateShip(ship, true);
  validateShip(enemy, true);
  const options = { shipFirst: true, fightingPenalty: 0, ...structuredClone(rules) };
  if (typeof options.shipFirst !== 'boolean') throw new RangeError('Invalid naval initiative');
  legendaryInteger(options.fightingPenalty);
  return { rulesVersion: 1, status: 'active', ship: structuredClone(ship), enemy: structuredClone(enemy),
    rules: options, round: 1, phase: options.shipFirst ? 'ship' : 'enemy', spellUsed: false,
    log: [], destination: null };
}

export function legendaryNavalAttack(input, roll) {
  const fight = active(input);
  const own = fight.phase === 'ship';
  const attacker = own ? fight.ship : fight.enemy;
  const target = own ? fight.enemy : fight.ship;
  const count = Math.max(0, attacker.fighting - (own ? fight.rules.fightingPenalty : 0));
  const attack = legendaryPool(Math.min(20, count), 4, roll);
  const damage = Math.min(target.health, attack.successes);
  target.health -= damage;
  fight.log = [...fight.log.slice(-59), { round: fight.round, type: own ? 'shipAttack' : 'enemyAttack', dice: attack.dice, damage }];
  endFight(fight);
  if (fight.status === 'active') {
    const nextRound = fight.rules.shipFirst ? !own : own;
    if (nextRound) fight.round++;
    fight.phase = own ? 'enemy' : 'ship';
    if (!own) fight.spellUsed = false;
  }
  return fight;
}

export function legendaryWarpWood(input) {
  const fight = active(input);
  if (fight.phase !== 'ship' || fight.spellUsed) throw new RangeError('One sea spell before each ship attack');
  const damage = Math.min(3, fight.enemy.health);
  fight.enemy.health -= damage;
  fight.spellUsed = true;
  fight.log = [...fight.log.slice(-59), { round: fight.round, type: 'warpWood', damage }];
  endFight(fight);
  return fight;
}

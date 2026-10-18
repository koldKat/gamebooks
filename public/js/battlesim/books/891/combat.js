import {CHANCE_TABLE, MANOEUVRES, RULES_REVISION} from './definition.js';

const clone = value => structuredClone(value);
const opposite = side => side === 'player' ? 'enemy' : 'player';
function integer(value, minimum = 0, maximum = 1000000) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new RangeError('Invalid combat value');
  return value;
}
function side(value) {
  if (!['player', 'enemy'].includes(value)) throw new RangeError('Invalid side');
  return value;
}
export function sampleChance(random = Math.random) {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('Invalid random value');
  return CHANCE_TABLE[Math.floor(value * CHANCE_TABLE.length)];
}
function chance(value, random) {return value == null ? sampleChance(random) : integer(value, 1, 12);}
export function validateFighter(row) {
  if (!row || typeof row !== 'object' || typeof row.displayName !== 'string' || !row.displayName.trim()) throw new RangeError('Missing fighter');
  const fighter = {displayName: row.displayName.trim().slice(0, 200), hp: integer(row.hp)};
  for (const key of ['attack', 'defence', 'damage', 'energy', 'energyCost', 'feedback', 'range']) {
    fighter[key] = row[key] == null || row[key] === '' ? null : integer(row[key], ['attack', 'defence'].includes(key) ? -1000000 : 0);
  }
  return fighter;
}
function active(fight) {
  if (!fight || fight.rulesRevision !== RULES_REVISION || fight.outcome) throw new RangeError('Inactive fight');
  const next = clone(fight);
  next.player = validateFighter(next.player);
  next.enemy = validateFighter(next.enemy);
  next.events = [];
  return next;
}
export function startFight(player, enemy, {mode = 'easy', domain = 'space', first = 'player', oneHit = false} = {}) {
  if (!['easy', 'hard'].includes(mode) || !['space', 'ground'].includes(domain) || typeof oneHit !== 'boolean') throw new RangeError('Invalid fight setup');
  const fighters = {player: validateFighter(player), enemy: validateFighter(enemy)};
  if (!fighters.player.hp || !fighters.enemy.hp) throw new RangeError('Dead fighter');
  let turn = side(first);
  if (mode === 'hard' && domain === 'ground' && fighters.player.feedback !== null && fighters.enemy.feedback !== null
      && fighters.player.feedback !== fighters.enemy.feedback) turn = fighters.player.feedback > fighters.enemy.feedback ? 'player' : 'enemy';
  return {rulesRevision: RULES_REVISION, mode, domain, oneHit, ...fighters, turn,
    name: fighters.enemy.displayName, exchanges: 0, pendingDamage: null, outcome: null, events: []};
}
function finishExchange(fight) {
  if (!fight.player.hp) fight.outcome = 'loss';
  else if (!fight.enemy.hp) fight.outcome = 'win';
  if (fight.outcome) fight.events.push({kind: fight.outcome});
  else if (fight.mode === 'hard') fight.turn = opposite(fight.turn);
  return fight;
}
function hit(fight, winner, loser, amount) {
  if (fight.mode === 'easy' && fight.oneHit) amount = fight[loser].hp;
  if (amount === null) {
    fight.pendingDamage = {winner, loser};
    fight.events.push({kind: 'manualDamage', winner, loser});
    return fight;
  }
  integer(amount);
  fight[loser].hp = Math.max(0, fight[loser].hp - amount);
  fight.events.push({kind: 'damage', winner, loser, amount});
  return finishExchange(fight);
}
export function exchange(fight, {playerChance, enemyChance, distance = null, playerManoeuvre = 'none', enemyManoeuvre = 'none'} = {}, random = Math.random) {
  const next = active(fight);
  if (next.pendingDamage) throw new RangeError('Damage required');
  if (distance !== null) integer(distance);
  const manoeuvres = {player: MANOEUVRES[playerManoeuvre], enemy: MANOEUVRES[enemyManoeuvre]};
  if (!manoeuvres.player || !manoeuvres.enemy) throw new RangeError('Invalid manoeuvre');
  if (next.mode === 'easy') {
    const one = chance(playerChance, random), two = chance(enemyChance, random);
    const playerTotal = (next.player.attack ?? 0) + one, enemyTotal = (next.enemy.attack ?? 0) + two;
    next.exchanges++;
    next.events.push({kind: 'easy', one, two, playerTotal, enemyTotal});
    if (playerTotal === enemyTotal) {next.events.push({kind: 'tie'}); return next;}
    const winner = playerTotal > enemyTotal ? 'player' : 'enemy', loser = opposite(winner);
    return hit(next, winner, loser, next[winner].damage);
  }
  const attacker = next.turn, defender = opposite(attacker), source = next[attacker], target = next[defender];
  if (next.domain === 'ground' && source.energy !== null && source.energyCost !== null) {
    if (source.energy === 0) throw new RangeError('No energy');
    source.energy = Math.max(0, source.energy - source.energyCost);
  }
  if (next.domain === 'ground' && distance !== null && source.range !== null && distance > source.range) throw new RangeError('Out of range');
  const attackChance = chance(attacker === 'player' ? playerChance : enemyChance, random);
  const defenceChance = distance === null ? chance(defender === 'player' ? playerChance : enemyChance, random) : null;
  const attackModifier = manoeuvres[attacker], defenceModifier = manoeuvres[defender];
  const attack = (attackModifier.zeroAttack ? 0 : (source.attack ?? 0) + attackModifier.attack) + attackChance;
  const defence = (target.defence ?? 0) + defenceModifier.defence + (distance ?? defenceChance);
  next.exchanges++;
  next.events.push({kind: 'hard', attacker, defender, attackChance, defenceChance, distance, attack, defence,
    playerManoeuvre, enemyManoeuvre});
  if (attack === defence) {next.events.push({kind: 'tie'}); return finishExchange(next);}
  return attack > defence ? hit(next, attacker, defender, source.damage) : hit(next, defender, attacker, 4);
}
export function resolveDamage(fight, amount) {
  const next = active(fight);
  if (!next.pendingDamage) throw new RangeError('No pending damage');
  integer(amount);
  const {winner, loser} = next.pendingDamage;
  next.pendingDamage = null;
  return hit(next, winner, loser, amount);
}
export function amendFighter(fight, who, values) {
  side(who);
  return amendFighters(fight, {[who]: values});
}
export function amendFighters(fight, values) {
  const next = active(fight);
  if (next.pendingDamage) throw new RangeError('Damage required');
  if (!values || typeof values !== 'object' || !Object.keys(values).length) throw new RangeError('Missing correction');
  for (const [who, fields] of Object.entries(values)) {
    side(who);
    next[who] = validateFighter({...next[who], ...fields});
    next.events.push({kind: 'amend', side: who});
  }
  if (!next.player.hp) next.outcome = 'loss';
  else if (!next.enemy.hp) next.outcome = 'win';
  if (next.outcome) next.events.push({kind: next.outcome});
  return next;
}
// Printed exceptions (extra manipulator strikes, first shot) remain explicit.
export function setTurn(fight, who) {
  const next = active(fight);
  if (next.pendingDamage || next.mode !== 'hard') throw new RangeError('No turn override');
  next.turn = side(who);
  next.events.push({kind: 'turn', side: who});
  return next;
}
export function abandon(fight) {
  const next = active(fight);
  next.outcome = 'abandoned';
  next.events.push({kind: 'abandoned'});
  return next;
}

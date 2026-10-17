import { RULES_REVISION, SKILLS, PRICES } from './definition.js';

const integer = (value, min, max = Number.MAX_SAFE_INTEGER) => {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError('Invalid combat value');
  return value;
};
export const rollDie = () => Math.floor(Math.random() * 6) + 1;
export const newCharacter = () => ({life: 100, money: 10000000, skills: []});
export function validateCharacter(character) {
  if (!character || !Array.isArray(character.skills) || character.skills.length > 2
      || new Set(character.skills).size !== character.skills.length || character.skills.some(value => !SKILLS.includes(value))) throw new RangeError('Invalid skills');
  integer(character.life, 0, 100); integer(character.money, -Number.MAX_SAFE_INTEGER);
  const next = structuredClone(character);
  if (next.money < 0) next.life = 0;
  return next;
}
export function purchase(character, service) {
  const next = validateCharacter(character), price = PRICES[service];
  if (!next.life || !['codeine', 'subcontractor', 'premonition'].includes(service) || next.money < price
      || service === 'codeine' && next.life === 100) throw new RangeError('Cannot buy service');
  next.money -= price;
  if (service === 'codeine') next.life = 100;
  return next;
}
export function startFight(character, opponent, encounter = null, securityChip = false) {
  const player = validateCharacter(character);
  if (!player.life || !opponent?.displayName?.trim() || typeof securityChip !== 'boolean') throw new RangeError('Invalid fight');
  if (securityChip && !encounter?.securityChipOption) throw new RangeError('Chip not applicable');
  const hp = integer(opponent.hp, 1, 1000000);
  return {rulesRevision: RULES_REVISION, character: player, name: opponent.displayName.trim(), hp,
    multiplier: integer(opponent.multiplier, 0, 1000), bonus: integer(opponent.bonus, 0, 1000),
    encounter: encounter ? structuredClone(encounter) : {}, securityChip,
    seen: [], bonusCounts: 0, phase: 'rolling', turns: 0, completedRounds: 0,
    outcome: null, events: [{kind: 'start', name: opponent.displayName.trim()}]};
}
function fresh(fight) {
  if (!fight || fight.rulesRevision !== RULES_REVISION || fight.outcome) throw new RangeError('Fight inactive');
  const next = structuredClone(fight);
  next.character = validateCharacter(next.character);
  if (!next.character.life || !['rolling', 'repeated', 'enemy'].includes(next.phase)
      || !Array.isArray(next.seen) || next.seen.length > 6 || new Set(next.seen).size !== next.seen.length) throw new RangeError('Invalid fight state');
  for (const value of next.seen) integer(value, 1, 6);
  integer(next.bonusCounts, 0); integer(next.hp, 1, 1000000);
  integer(next.turns, 0); integer(next.completedRounds, 0);
  next.events = [];
  return next;
}
function finish(fight, outcome, destination = null) {
  fight.outcome = outcome; fight.destination = destination;
  fight.events.push({kind: outcome, destination});
  return fight;
}
function beginTurn(fight) {
  fight.phase = 'rolling'; fight.seen = []; fight.bonusCounts = 0;
  return fight;
}
export function rollPlayer(fight, die = rollDie()) {
  const next = fresh(fight);
  if (next.phase !== 'rolling') throw new RangeError('Not rolling');
  integer(die, 1, 6);
  const repeated = next.seen.includes(die);
  if (repeated) next.phase = 'repeated';
  else next.seen.push(die);
  next.events.push({kind: 'roll', die, repeated, count: next.seen.length + next.bonusCounts,
    damage: (next.seen.length + next.bonusCounts) ** 2});
  return next;
}
export function buyInFight(fight, service) {
  const next = fresh(fight), price = PRICES[service];
  if (!['rolling', 'repeated'].includes(next.phase) || !['adrenaline', 'mindhack'].includes(service)
      || next.character.money < price || service === 'adrenaline' && next.phase !== 'repeated') throw new RangeError('Cannot buy service');
  next.character.money -= price;
  if (service === 'adrenaline') next.phase = 'rolling';
  else next.bonusCounts++;
  next.events.push({kind: 'purchase', service, price, money: next.character.money});
  return next;
}
export function resolveAttack(fight) {
  const next = fresh(fight);
  if (next.phase !== 'repeated' || !next.seen.length) throw new RangeError('Attack not ready');
  const damage = integer((next.seen.length + next.bonusCounts) ** 2, 1);
  next.hp -= damage; next.turns++;
  next.events.push({kind: 'attack', damage, hp: Math.max(0, next.hp), turn: next.turns});
  if (next.hp <= 0) {
    const reward = integer(-next.hp * 100000, 0);
    next.character.money = integer(next.character.money + reward, 0);
    next.events.push({kind: 'brutality', reward, money: next.character.money});
    return finish(next, 'win', next.encounter.destination ?? null);
  }
  if (next.encounter.threshold != null && next.hp <= next.encounter.threshold) return finish(next, 'win', next.encounter.destination ?? null);
  if (next.securityChip && next.turns % 2 === 1) return beginTurn(next);
  next.phase = 'enemy';
  return next;
}
export function rollEnemy(fight, die = rollDie()) {
  const next = fresh(fight);
  if (next.phase !== 'enemy') throw new RangeError('Not enemy turn');
  integer(die, 1, 6);
  const damage = integer(die * next.multiplier + next.bonus, 0);
  next.character.life = Math.max(0, next.character.life - damage);
  next.events.push({kind: 'enemy', die, damage, life: next.character.life});
  if (!next.character.life) return finish(next, 'loss');
  if (next.encounter.repeatEnemyOnOne && die === 1) return next;
  next.completedRounds++;
  if (next.encounter.surviveRounds && next.completedRounds >= next.encounter.surviveRounds) return finish(next, 'win', next.encounter.destination ?? null);
  if (next.encounter.deadline && next.turns >= next.encounter.deadline) {
    if (next.encounter.fatalDeadline) next.character.life = 0;
    return finish(next, 'loss', next.encounter.failureDestination ?? null);
  }
  return beginTurn(next);
}
export function cancelFight(fight) { return finish(fresh(fight), 'cancelled'); }

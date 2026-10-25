import { RULES_REVISION, MODES, SCARLET_RULES } from './definition.js';

const integer = (value, min, max) => {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError('Invalid combat value');
  return value;
};
const option = (value, choices) => {
  if (!choices.includes(value)) throw new RangeError('Invalid choice');
  return value;
};
export const rollDie = () => Math.floor(Math.random() * 6) + 1;
export const newCharacter = () => ({speed: 3, stealth: 3, disguise: 0, life: 4, money: 4, darts: 0, medkits: 0});
export function validateCharacter(character) {
  if (!character) throw new RangeError('Missing character');
  for (const field of ['speed', 'stealth', 'disguise', 'money', 'darts', 'medkits']) integer(character[field], 0, 1000);
  integer(character.life, 0, 4);
  return structuredClone(character);
}
export function useMedkit(character) {
  const next = validateCharacter(character);
  if (!next.life || next.life === 4 || !next.medkits) throw new RangeError('Cannot heal');
  next.medkits--; next.life++;
  return next;
}
export function startFight(character, opponent, mode = 'tiger', destination = null) {
  const player = validateCharacter(character);
  option(mode, MODES);
  if (!player.life || !opponent?.displayName?.trim()) throw new RangeError('Invalid encounter');
  const hp = integer(opponent.hp, 1, 1000), attack = integer(opponent.attack, 0, 1000);
  return {rulesRevision: RULES_REVISION, character: player, mode, name: opponent.displayName.trim(), attack,
    hp, initialHp: hp, health: mode === 'persuasion' ? SCARLET_RULES.persuasion.health + player.disguise : player.life + (mode === 'tiger' ? SCARLET_RULES.tiger.healthBonus : 0),
    startingLife: player.life, hours: 0, turns: 0, destinationOnWin: destination,
    outcome: null, events: [{kind: 'start', name: opponent.displayName.trim()}]};
}
function fresh(fight) {
  if (!fight || fight.rulesRevision !== RULES_REVISION || fight.outcome) throw new RangeError('Fight inactive');
  const next = structuredClone(fight);
  option(next.mode, MODES); validateCharacter(next.character);
  integer(next.health, 1, 1000 + SCARLET_RULES.persuasion.health); integer(next.hp, next.mode === 'clock' ? 0 : 1, 1000);
  integer(next.hours, 0, 1000000); integer(next.turns, 0, 1000000);
  next.events = [];
  return next;
}
function finish(fight, outcome) {
  fight.outcome = outcome;
  fight.destination = outcome === 'win' ? fight.destinationOnWin : outcome === 'loss' && fight.mode === 'persuasion' ? SCARLET_RULES.persuasion.lossDestination : null;
  if (fight.mode === 'tiger') {
    fight.character.life = outcome === 'win' ? fight.startingLife : Math.max(0, Math.min(fight.startingLife, fight.health - SCARLET_RULES.tiger.healthBonus));
  }
  fight.events.push({kind: outcome, destination: fight.destination});
  return fight;
}
function hurt(fight, damage) {
  fight.health = Math.max(0, fight.health - damage);
  if (!['tiger', 'persuasion'].includes(fight.mode)) fight.character.life = fight.health;
}
const die = (rolls, key) => integer(rolls[key], 1, 6);
const sizeFor = value => SCARLET_RULES.persuasion.choices[value - 1];
const succeeds = (size, value) => size === 'small' ? value <= 3 : size === 'medium' ? value === 4 || value === 5 : value === 6;
const sizeDamage = size => ({small: 1, medium: 2, large: 3})[size];
const targetFor = value => SCARLET_RULES.tiger.targets[value - 1];
const modifier = target => ({legs: 1, body: 0, head: -1})[target];
const targetDamage = target => ({legs: 1, body: 2, head: 3})[target];

export function playRound(fight, choices, rolls) {
  const next = fresh(fight), player = next.character;
  let damage = 0, dealt = 0, enemyChoice = '', playerScore = null, enemyScore = null;
  const skill = () => player[option(choices.skill, ['speed', 'stealth'])];
  if (next.mode === 'persuasion') {
    const lie = option(choices.lie, ['small', 'medium', 'large']);
    const counter = option(choices.counter, ['small', 'medium', 'large']);
    enemyChoice = sizeFor(die(rolls, 'enemyChoice'));
    dealt = succeeds(lie, die(rolls, 'player')) ? sizeDamage(lie) : 0;
    damage = counter !== enemyChoice && succeeds(enemyChoice, die(rolls, 'enemy')) ? sizeDamage(enemyChoice) : 0;
    // The player's lie resolves first; the printed rule ends the duel at the first zero.
    next.hp = Math.max(0, next.hp - dealt);
    if (!next.hp) damage = 0;
    hurt(next, damage);
  } else if (next.mode === 'tiger') {
    const target = option(choices.target, ['legs', 'body', 'head']);
    const guard = option(choices.guard, ['legs', 'body', 'head']);
    if (typeof choices.dart !== 'boolean' || choices.dart && !player.darts) throw new RangeError('No dart');
    enemyChoice = targetFor(die(rolls, 'enemyChoice'));
    playerScore = skill() + die(rolls, 'player') + modifier(target);
    enemyScore = next.attack + die(rolls, 'enemy') + modifier(enemyChoice);
    if (playerScore > enemyScore) {
      dealt = targetDamage(target);
      if (choices.dart) { player.darts--; dealt += 2; }
    } else if (enemyScore > playerScore && guard !== enemyChoice) damage = targetDamage(enemyChoice);
    next.hp = Math.max(0, next.hp - dealt); hurt(next, damage);
  } else if (['countess', 'emeralds'].includes(next.mode)) {
    const emeralds = next.mode === 'emeralds';
    const rules = SCARLET_RULES[next.mode];
    damage = die(rolls, 'enemy') <= rules.hitMaximum ? rules.damage : 0;
    hurt(next, damage);
    if (next.health && die(rolls, 'player') + (emeralds ? rules.skillPenalty : 0) < skill()) {
      dealt = emeralds || die(rolls, 'dodge') >= rules.dodgeMinimum ? 1 : 0;
    }
    next.hp = Math.max(0, next.hp - dealt);
  } else {
    const work = option(choices.work, ['sphere', 'gears', 'cuckoo']);
    if (work === 'cuckoo' && !next.hp) throw new RangeError('Cuckoo inactive');
    const rules = SCARLET_RULES.clock;
    const success = work !== 'cuckoo' || die(rolls, 'player') + rules.skillPenalty < skill();
    const sphereDamage = die(rolls, 'sphere') <= rules.sphereHitMaximum[work] ? rules.sphereDamage : 0;
    const birdDamage = next.hp && die(rolls, 'enemy') <= rules.birdHitMaximum[work] ? rules.birdDamage : 0;
    damage = sphereDamage + birdDamage;
    hurt(next, damage);
    if (success) {
      next.hours += rules.hours[work];
      if (work === 'cuckoo') { next.hp--; dealt = 1; }
    }
    enemyChoice = work;
  }
  next.turns++;
  next.events.push({kind: 'round', turn: next.turns, damage, dealt, enemyChoice,
    playerScore, enemyScore, health: next.health, hp: next.hp, hours: next.hours, rolls: {...rolls}});
  if (!next.health) return finish(next, 'loss');
  if (next.mode === 'clock' ? next.hours > 0 && next.hours % SCARLET_RULES.clock.cycle === 0 : !next.hp) return finish(next, 'win');
  return next;
}
export function cancelFight(fight) { return finish(fresh(fight), 'cancelled'); }

import { die, integer, rollDice } from '../../engines/sorcery/core.js';
import { customFightingEncounter } from '../../engines/fighting-fantasy/opponents.js';
import { encounterFor, RULES_REVISION } from './definition.js';

export { integer } from '../../engines/sorcery/core.js';

export function validateCharacter(character, alive = false) {
  if (!character || typeof character.dead !== 'boolean' || alive && character.dead) throw new RangeError('Invalid character');
  for (const key of ['skill', 'stamina', 'luck']) {
    integer(character[key + 'Initial'], 1);
    integer(character[key], alive && key === 'stamina' ? 1 : 0, character[key + 'Initial']);
  }
  integer(character.attackModifier, -1000, 1000);
  integer(character.elapsed, 0, 1000000);
  return character;
}

export function newCharacter(random) {
  const skillInitial = die(random) + 6, staminaInitial = rollDice(random) + 12, luckInitial = die(random) + 6;
  return { skillInitial, staminaInitial, luckInitial, skill: skillInitial - 1, stamina: staminaInitial - 3,
    luck: luckInitial, attackModifier: 0, elapsed: 0, dead: false };
}

export function testLuck(character, random) {
  validateCharacter(character, true);
  const next = structuredClone(character), value = rollDice(random), lucky = value <= next.luck;
  next.luck = Math.max(0, next.luck - 1);
  return { character: next, roll: value, lucky };
}

export function medicalStation(character) {
  validateCharacter(character, true);
  return { ...character, skill: character.skillInitial, stamina: character.staminaInitial };
}

function end(fight, outcome, destination) {
  fight.outcome = outcome;
  fight.destination = destination;
  fight.character.dead = fight.character.stamina === 0 || outcome === 'timeout';
  return fight;
}

function finish(fight) {
  if (fight.character.elapsed >= 3600) return end(fight, 'timeout', 33);
  if (fight.character.stamina <= fight.config.threshold) return end(fight, 'loss', fight.config.loss);
  if (fight.enemies[0].stamina <= fight.config.threshold) return end(fight, 'win', fight.config.win);
  return fight;
}

export function startFight(section, character, options = {}) {
  validateCharacter(character, true);
  const preset = encounterFor(section);
  const custom = customFightingEncounter(0, options.opponents);
  if (!preset && (Number(section) !== 0 || !custom)) throw new RangeError('Invalid encounter');
  if (custom && custom.enemies.length !== 1) throw new RangeError('One opponent required');
  const config = structuredClone(preset ?? { section: 0, threshold: 0, stun: false, seconds: 0, win: null, loss: null });
  config.enemies = structuredClone(custom?.enemies ?? preset.enemies);
  config.weapon = options.weapon ?? 'ordinary';
  if (!['ordinary', 'cleaver', 'sword'].includes(config.weapon)) throw new RangeError('Invalid weapon');
  const fight = { rulesRevision: RULES_REVISION, config, character: structuredClone(character),
    enemies: structuredClone(config.enemies), rounds: 0, pendingDoubles: false, events: [], outcome: null, destination: null };
  fight.character.elapsed += config.seconds;
  return finish(fight);
}

function requireFight(fight) {
  if (!fight || fight.rulesRevision !== RULES_REVISION || fight.outcome) throw new RangeError('No active fight');
  validateCharacter(fight.character, true);
}

export function round(input, random) {
  requireFight(input);
  if (input.pendingDoubles) throw new RangeError('Resolve simultaneous doubles first');
  const fight = structuredClone(input), playerDice = [die(random), die(random)], enemyDice = [die(random), die(random)];
  fight.rounds++;
  fight.character.elapsed += 10;
  const playerAttack = playerDice[0] + playerDice[1] + fight.character.skill + fight.character.attackModifier
    + (fight.config.weapon === 'sword' ? 2 : 0);
  const enemyAttack = enemyDice[0] + enemyDice[1] + fight.enemies[0].skill;
  fight.events = [{ kind: 'attack', playerDice, enemyDice, playerAttack, enemyAttack }];
  if (fight.character.elapsed >= 3600) return end(fight, 'timeout', 33);
  const playerDouble = playerDice[0] === playerDice[1], enemyDouble = enemyDice[0] === enemyDice[1];
  if (fight.config.stun && (playerDouble || enemyDouble)) {
    if (playerDouble && enemyDouble) { fight.pendingDoubles = true; return fight; }
    return end(fight, playerDouble ? 'win' : 'loss', playerDouble ? fight.config.win : fight.config.loss);
  }
  if (playerAttack > enemyAttack) {
    const damage = fight.config.weapon === 'sword' ? 6 : fight.config.weapon === 'cleaver' ? 3 : 2;
    fight.enemies[0].stamina = Math.max(0, fight.enemies[0].stamina - damage);
    fight.events.push({ kind: 'enemyDamage', damage });
  } else if (enemyAttack > playerAttack) {
    fight.character.stamina = Math.max(0, fight.character.stamina - 2);
    fight.events.push({ kind: 'playerDamage', damage: 2 });
  } else fight.events.push({ kind: 'tie' });
  return finish(fight);
}

export function resolveDoubles(input, winner) {
  requireFight(input);
  if (!input.pendingDoubles || !['player', 'enemy'].includes(winner)) throw new RangeError('No simultaneous doubles');
  const fight = structuredClone(input);
  fight.pendingDoubles = false;
  fight.events = [{ kind: 'manualDoubles', winner }];
  return end(fight, winner === 'player' ? 'win' : 'loss', winner === 'player' ? fight.config.win : fight.config.loss);
}

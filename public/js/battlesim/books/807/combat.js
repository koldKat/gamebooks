import { die } from '../../engines/sorcery/core.js';
import { RULES_REVISION } from './definition.js';

export function validateCharacter(character) {
  if (!character || !Number.isSafeInteger(character.determination) || typeof character.pills !== 'boolean') {
    throw new RangeError('Invalid character');
  }
  return character;
}

export function newCharacter() { return { determination: 1, pills: false }; }

export function startFight(character, name = '') {
  validateCharacter(character);
  return { rulesRevision: RULES_REVISION, character: structuredClone(character),
    name: String(name).trim().slice(0, 200), phase: 'player', rounds: 0, rerolls: 0,
    playerDice: null, playerTotal: null, enemyDice: null, enemyTotal: null,
    outcome: null, destination: null, events: [] };
}

function requireFight(fight, phase) {
  if (!fight || fight.rulesRevision !== RULES_REVISION || fight.outcome || fight.phase !== phase) {
    throw new RangeError('No active action');
  }
  validateCharacter(fight.character);
}

function finish(fight, outcome, destination) {
  fight.outcome = outcome;
  fight.destination = destination;
  if (destination === 30) fight.character.pills = false;
  return fight;
}

export function rollPlayer(input, roll, reroll = false) {
  if (typeof reroll !== 'boolean') throw new TypeError('Invalid action');
  requireFight(input, reroll ? 'decision' : 'player');
  if (reroll && input.character.determination <= 0) throw new RangeError('No positive Determination');
  const fight = structuredClone(input);
  fight.events = [];
  if (reroll) {
    fight.character.determination--;
    fight.rerolls++;
    fight.events.push({ kind: 'reroll', determination: fight.character.determination });
  } else fight.rounds++;
  fight.playerDice = [die(roll), die(roll)];
  fight.enemyDice = null;
  fight.enemyTotal = null;
  fight.playerTotal = fight.playerDice[0] + fight.playerDice[1] + Math.min(0, fight.character.determination);
  fight.events.push({ kind: 'playerRoll', dice: fight.playerDice, total: fight.playerTotal });
  if (fight.playerDice[0] === fight.playerDice[1]) {
    const cost = fight.character.pills ? 0 : 1;
    fight.character.determination -= cost;
    validateCharacter(fight.character);
    fight.events.push({ kind: 'chronostasis', cost, determination: fight.character.determination });
    return finish(fight, 'escape', 74);
  }
  fight.phase = 'decision';
  return fight;
}

export function rollEnemy(input, roll) {
  requireFight(input, 'decision');
  const fight = structuredClone(input);
  fight.enemyDice = [die(roll), die(roll)];
  fight.enemyTotal = fight.enemyDice[0] + fight.enemyDice[1];
  fight.events = [{ kind: 'enemyRoll', dice: fight.enemyDice, total: fight.enemyTotal }];
  if (fight.playerTotal > fight.enemyTotal) return finish(fight, 'win', 11);
  if (fight.playerTotal < fight.enemyTotal) return finish(fight, 'loss', 30);
  fight.phase = 'player';
  fight.events.push({ kind: 'tie' });
  return fight;
}

export function cancelFight(input) {
  if (!input || input.outcome || input.rulesRevision !== RULES_REVISION) throw new RangeError('No active fight');
  validateCharacter(input.character);
  return { ...structuredClone(input), outcome: 'cancelled', destination: null, events: [] };
}

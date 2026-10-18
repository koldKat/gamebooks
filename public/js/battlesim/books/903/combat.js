// Resolve printed combat codes without inventing dice or enemy hit points.
import {ENCOUNTERS, LOOKUP_ROWS} from './definition.js';

function integer(value, min, max) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) {
    throw new RangeError('Invalid combat value');
  }
  return number;
}

export function createCharacter() {
  return {strength: 5};
}

export function lookupCode(value) {
  const code = String(value ?? '').trim().toUpperCase();
  if (!/^[A-J][1-5]$/.test(code)) throw new RangeError('Invalid combat code');
  const symbol = LOOKUP_ROWS[code.charCodeAt(0) - 65][Number(code[1]) - 1];
  return {code, result: {'.': 'continue', '+': 'win', '-': 'wounded'}[symbol]};
}

export function startFight(character, opponent) {
  const cardId = String(opponent?.cardId ?? opponent?.id ?? opponent ?? '');
  const card = ENCOUNTERS.find(entry => entry.id === cardId);
  if (!card) throw new RangeError('Unknown combat card');
  const name = String(opponent?.displayName ?? card.displayName).trim();
  if (!name || name.length > 200) throw new RangeError('Invalid opponent name');
  return {
    version: 1,
    player: {...structuredClone(character), strength: integer(character?.strength, 1, 5)},
    // Enemy strength describes the printed card's difficulty, not hit points.
    enemy: {...card, displayName: name},
    round: 1,
    turns: [],
    outcome: null,
    destination: null,
    finalContinuation: false,
  };
}

export function applyCode(fight, value) {
  if (!fight || fight.version !== 1 || fight.outcome) {
    throw new RangeError('No active combat');
  }
  const round = integer(fight.round, 1, 5);
  integer(fight.player?.strength, 1, 5);
  const {code, result} = lookupCode(value);
  const next = structuredClone(fight);
  next.finalContinuation = result === 'continue' && round === 5;
  next.turns = [...next.turns, {round, code, result}].slice(-50);
  if (result === 'continue') {
    next.round = Math.min(round + 1, 5);
  } else if (result === 'win') {
    next.outcome = 'win';
    next.destination = next.enemy.win;
  } else {
    next.player.strength -= 1;
    next.outcome = next.player.strength === 0 ? 'dead' : 'wounded';
    next.destination = next.outcome === 'dead' ? null : next.enemy.wounded;
  }
  return next;
}

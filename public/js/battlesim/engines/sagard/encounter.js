// Dispatch isolated Sagard encounters to their declared combat rules without book-specific switches.
import {startSagardFight, validateSagardFight, sagardTurn, resolveSagardTurn, cancelSagardFight, fleeSagardFight} from './core.js';
import {startSagardNaval, validateSagardNavalFight, sagardNavalTurn, resolveSagardNaval, cancelSagardNaval} from './naval.js';
import {startSagardForces, validateSagardForcesFight, sagardForcesTurn, resolveSagardForces, cancelSagardForces, fleeSagardForces} from './forces.js';
import {startSagardBeast, validateSagardBeastFight, sagardBeastTurn, resolveSagardBeast, cancelSagardBeast} from './beast.js';
import {startSagardStrategy, validateSagardStrategy, sagardStrategyTurn, resolveSagardStrategy, cancelSagardStrategy} from './strategy.js';

const engines = {
  strategy: {validate: validateSagardStrategy, turn: sagardStrategyTurn, resolve: resolveSagardStrategy, cancel: cancelSagardStrategy},
  ordinary: {validate: validateSagardFight, turn: sagardTurn, resolve: resolveSagardTurn, cancel: cancelSagardFight},
  naval: {validate: validateSagardNavalFight, turn: sagardNavalTurn, resolve: resolveSagardNaval, cancel: cancelSagardNaval},
  forces: {validate: validateSagardForcesFight, turn: sagardForcesTurn, resolve: resolveSagardForces, cancel: cancelSagardForces},
  beast: {validate: validateSagardBeastFight, turn: sagardBeastTurn, resolve: resolveSagardBeast, cancel: cancelSagardBeast}
};
const engine = fight => {
  const selected = engines[fight?.kind ?? 'ordinary'];
  if (!selected) throw new RangeError('Unknown Sagard encounter rules');
  return selected;
};
export const validateSagardEncounterFight = fight => engine(fight).validate(fight);
export const sagardEncounterTurn = fight => engine(fight).turn(fight);
export const resolveSagardEncounter = (fight, die, options) => engine(fight).resolve(fight, die, options);
export const cancelSagardEncounter = fight => engine(fight).cancel(fight);
export function fleeSagardEncounter(fight, die, options) {
  if (fight.kind === 'forces') return fleeSagardForces(fight, die);
  if (fight.kind) throw new RangeError('This combat type uses its own escape controls');
  return fleeSagardFight(fight, die, options);
}

export function startSagardEncounter(hero, encounter, rules, options = {}) {
  if (encounter.mode === 'manual') throw new RangeError(encounter.manualReason || 'This source needs manual combat values');
  if ([encounter.naval, encounter.forces, encounter.beast, encounter.strategy].filter(Boolean).length > 1) throw new RangeError('Conflicting combat rules');
  if (encounter.strategy) return startSagardStrategy(hero, encounter, rules, options);
  if (encounter.naval) return startSagardNaval(options.ship ?? {hp: rules.maxShipHp, maxHp: rules.maxShipHp}, encounter, options);
  if (encounter.forces) return startSagardForces(hero, encounter, rules, options);
  if (encounter.beast) return startSagardBeast(hero, options.opponents?.length
    ? {...encounter, opponents: options.opponents} : encounter, rules, options);
  if (encounter.opponentsRemovedPerPlunder) {
    const count = options.plundered ?? 0, original = options.opponents ?? encounter.opponents;
    if (!Number.isInteger(count) || count < 0 || count > 4) throw new RangeError('Enter zero to four previously plundered ships');
    const opponents = original.slice(count * encounter.opponentsRemovedPerPlunder);
    if (opponents.length) return startSagardFight(hero, encounter, rules, {...options, opponents});
    const fight = startSagardFight(hero, encounter, rules, {...options, opponents: original});
    for (const row of fight.opponents) row.hp = 0;
    fight.status = 'withdrawn'; fight.destination = encounter.winTarget;
    fight.log.push({kind: 'noOpponents', round: 1}); fight.turnSerial++;
    return validateSagardFight(fight);
  }
  return startSagardFight(hero, encounter, rules, options);
}

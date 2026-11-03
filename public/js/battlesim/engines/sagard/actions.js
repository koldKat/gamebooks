// Apply manually held Sagard combat items to ordinary, group-duel and monster encounters.
import {healSagardFight, useSagardStunStone, throwSagardProjectile, useSagardDagger} from './core.js';
import {healSagardBeast, useSagardBeastStone} from './beast.js';
import {validateSagardForcesFight, resolveSagardForcesDuelAction} from './forces.js';
import {sagardHealedHp} from './recovery.js';

export const sagardMeleeFight = fight => fight?.kind === 'forces' ? fight.duel : fight?.kind && fight.kind !== 'strategy' ? null : fight;

function inDuel(original, change) {
  return resolveSagardForcesDuelAction(original, change);
}

export function healSagardEncounter(fight, item) {
  if (fight.kind === 'beast') return healSagardBeast(fight, item);
  if (fight.kind === 'forces') {
    if (fight.phase === 'duel') return inDuel(fight, duel => healSagardFight(duel, item));
    if (fight.status !== 'fighting' || !['fang', 'moss', 'spiritLuck'].includes(item) || !fight.healing[item]
        || fight.hero.hp === fight.hero.maxHp) throw new RangeError('This healing item cannot be used now');
    const copy = structuredClone(fight), before = copy.hero.hp;
    copy.hero.hp = sagardHealedHp(copy, item); copy.healing[item] = false;
    if (copy.encounter.forces.duelMode === 'round') {
      copy.duel.hero = structuredClone(copy.hero); copy.duel.healing = structuredClone(copy.healing);
    }
    const restored = copy.hero.hp - before;
    copy.log.push({kind: 'heal', round: copy.round, item, restored});
    if (copy.log.length > 500) copy.log.shift(); copy.turnSerial++;
    return validateSagardForcesFight(copy);
  }
  if (fight.kind && fight.kind !== 'strategy') throw new RangeError('Character healing does not repair a ship');
  return healSagardFight(fight, item);
}

export function useSagardEncounterStone(fight, die) {
  if (fight.kind === 'beast') return useSagardBeastStone(fight, die);
  if (fight.kind === 'forces') return inDuel(fight, duel => useSagardStunStone(duel, die));
  if (fight.kind) throw new RangeError('The stun stone cannot be used in this ship encounter');
  return useSagardStunStone(fight, die);
}

export function throwSagardEncounterProjectile(fight, item, die, options) {
  if (fight.kind === 'forces') return inDuel(fight, duel => throwSagardProjectile(duel, item, die, options));
  if (fight.kind && fight.kind !== 'strategy') throw new RangeError('Begin an individual combat turn to use this missile');
  return throwSagardProjectile(fight, item, die, options);
}

export function useSagardEncounterDagger(fight, options) {
  if (fight.kind === 'forces') return inDuel(fight, duel => useSagardDagger(duel, options));
  if (fight.kind && fight.kind !== 'strategy') throw new RangeError('Begin an individual combat turn to use the dagger');
  return useSagardDagger(fight, options);
}

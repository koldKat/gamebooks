import { hasDestinyAbility, destinyStrike, addDestinyStatEffect } from './effects.js';
import { destinyDie } from './damage.js';
import { settleDestinyFight } from './core.js';

export function useDestinyOpening(fight, name, options, roll) {
  if (fight?.status !== 'active' || fight.round !== 0 || fight.phase !== 'start' ||
      !hasDestinyAbility(fight, name) || fight.used[name]) throw new RangeError('Use this ability once before combat');
  const next = structuredClone(fight);
  next.turn ??= { used: { sp: false, co: false, dm: false, backpack: false }, deaths: [], deathMoveDeathsSeen: 0 };
  if (name === 'first-blood' || name === 'first-cut') {
    const target = options.target;
    if (!Number.isInteger(target) || !next.opponents[target] || next.opponents[target].health <= 0) throw new RangeError('Choose a living opponent');
    destinyStrike(next, target, name === 'first-blood' ? 4 : 1, name, 'first-strike');
  } else if (name === 'best-laid-plans') {
    if (!['snap-jack', 'cluster-mine'].includes(options.trap)) throw new RangeError('Choose a trap');
    next.trap = { kind: options.trap, trigger: destinyDie(roll), fired: false };
  } else if (name === 'sweet-spot') {
    if (!Number.isInteger(options.number) || options.number < 1 || options.number > 6) throw new RangeError('Choose a number from one to six');
    next.sweetSpot = options.number;
  } else if (name === 'armour-plating') {
    if (!next.equipment?.transport) throw new RangeError('Requires a transport');
    addDestinyStatEffect(next, 'hero', 'armour', Math.floor(next.equipment.transport.toughness / 2), null, name);
  } else if (name === 'ice-mantle') {
    if (options.bonusAlreadyIncluded !== undefined && typeof options.bonusAlreadyIncluded !== 'boolean') throw new RangeError('Specify whether the permanent bonus is already included');
    if (!options.bonusAlreadyIncluded) {
      next.hero.armour += 2;
      next.hero.normal.armour += 2;
    }
    next.iceMantle = true;
  } else throw new RangeError('Unknown opening ability');
  next.used[name] = 1;
  next.history.push({ type: 'opening', name, round: 0 });
  if (!settleDestinyFight(next) && next.turn.deaths.length > next.turn.deathMoveDeathsSeen) {
    next.phase = 'death-move';
    next.turn.afterDeathMove = 'start';
  }
  return next;
}

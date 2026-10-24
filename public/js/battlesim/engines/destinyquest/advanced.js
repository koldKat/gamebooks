import { destinyStat, addDestinyStatEffect, healDestinyHero, destinyStrike } from './effects.js';
import { prepareDestinyDamage } from './damage.js';

const sum = values => values.reduce((total, value) => total + value, 0);
function draw(roll) {
  const value = roll();
  if (!Number.isInteger(value) || value < 1 || value > 6) throw new RangeError('A die must roll 1-6');
  return value;
}
function index(values, value) {
  if (!Number.isInteger(value) || value < 0 || value >= values.length) throw new RangeError('Choose a die');
  return value;
}

// Called only with an action's owned copy; validation failures never reach a
// saved fight. The ability dispatcher owns charges, category slots and outcomes.
export function applyDestinyAdvancedAbility(fight, name, options, roll) {
  const chosen = options.target ?? fight.target;
  const living = () => fight.opponents.map((opponent, target) => opponent.health > 0 ? target : -1).filter(target => target >= 0);
  const requireLiving = target => {
    if (!Number.isInteger(target) || !fight.opponents[target] || fight.opponents[target].health <= 0) throw new RangeError('Choose a living opponent');
    return target;
  };
  const stat = (target, attribute, amount, duration = 1, delay = 0) =>
    addDestinyStatEffect(fight, target, attribute, amount, duration, name, delay);
  const ongoing = (target, amount) => {
    requireLiving(target);
    fight.effects.push({ kind: 'ongoing-damage', target, amount, from: fight.round,
      until: Number.MAX_SAFE_INTEGER, source: name });
  };
  switch (name) {
    case 'impale': stat(fight.target, 'speed', -1, 1, 1); break;
    case 'frost-guard': for (const target of living()) stat(target, 'speed', -1, 1, 1); break;
    case 'deadly-dance':
      requireLiving(chosen);
      stat(chosen, 'speed', -2);
      stat(chosen, fight.opponents[chosen].damageStat, 1, null);
      break;
    case 'cruel-twist':
      if (!fight.turn.damageDice.includes(6)) throw new RangeError('Requires a damage six');
      fight.turn.damageDice.push(draw(roll));
      break;
    case 'ice-slick':
      if (!fight.turn.heroSpeedDice.includes(6)) throw new RangeError('Requires an attack speed six');
      fight.turn.heroSpeedDice.push(draw(roll));
      break;
    case 'trickster': case 'deceive': {
      const h = index(fight.turn.heroSpeedDice, options.heroDie);
      const e = index(fight.turn.opponentSpeedDice, options.opponentDie);
      [fight.turn.heroSpeedDice[h], fight.turn.opponentSpeedDice[e]] =
        [fight.turn.opponentSpeedDice[e], fight.turn.heroSpeedDice[h]];
      break;
    }
    case 'counter':
      prepareDestinyDamage(fight, name, { category: 'co', hit: 'one', dice: 1 },
        { ...options, target: fight.target }, roll);
      break;
    case 'slam': stat(fight.target, 'speed', -1, 1, 1); break;
    case 'roll-with-it': case 'shoulder-charge': {
      const value = fight.turn.heroSpeedDice[index(fight.turn.heroSpeedDice, options.die)];
      fight.turn.damageDice = [value];
      fight.turn.damageUsesBrawn = name === 'roll-with-it';
      fight.phase = 'damage-rolled';
      break;
    }
    case 'twin-blade': {
      const targets = options.targets;
      if (!Array.isArray(targets) || targets.length !== 2 || Math.abs(targets[0] - targets[1]) !== 1) throw new RangeError('Choose two adjacent opponents');
      targets.forEach(requireLiving);
      for (const target of targets) destinyStrike(fight, target, sum(fight.turn.heroSpeedDice), name);
      fight.turn.combatAbilityDamage = true;
      break;
    }
    case 'wave': {
      const maximum = destinyStat(fight, 'hero', 'magic');
      const allocations = options.allocations;
      if (!Array.isArray(allocations) || allocations.length !== fight.opponents.length ||
          allocations.some((amount, target) => !Number.isInteger(amount) || amount < 0 || amount > Math.ceil(maximum / 2) ||
            amount > 0 && fight.opponents[target].health <= 0) || sum(allocations) > maximum || sum(allocations) === 0) {
        throw new RangeError('Distribute magic damage within the per-opponent limit');
      }
      allocations.forEach((amount, target) => { if (amount) destinyStrike(fight, target, amount, name, 'fixed'); });
      fight.turn.combatAbilityDamage = true;
      break;
    }
    case 'scarlet-strikes': {
      const damage = (fight.equipment?.mainHand?.brawn || 0) + (fight.equipment?.leftHand?.brawn || 0);
      for (const target of living()) destinyStrike(fight, target, damage, name, 'fixed');
      break;
    }
    case 'punch-drunk': stat('hero', 'armour', 4, 1, 1); break;
    case 'rebound': stat('hero', 'speed', 2, 1, 1); break;
    case 'parasite': {
      requireLiving(chosen);
      if (!['speed', 'brawn', 'magic', 'armour'].includes(options.attribute)) throw new RangeError('Choose an attribute');
      const difference = destinyStat(fight, chosen, options.attribute) - destinyStat(fight, 'hero', options.attribute);
      if (difference < 0) throw new RangeError('Choose an attribute that can be raised');
      stat('hero', options.attribute, difference);
      break;
    }
    case 'reaper': healDestinyHero(fight, Math.floor(fight.turn.healthDamage / 5)); break;
    case 'pain-barrier': {
      if (!Number.isInteger(chosen) || !fight.opponents[chosen]) throw new RangeError('Choose an opponent');
      const damage = fight.turn.passiveDamageByTarget?.[chosen];
      if (!(damage > 0)) throw new RangeError('No passive damage to recover this round');
      healDestinyHero(fight, damage);
      break;
    }
    case 'choke-hold': {
      if (!fight.turn.combatAbilityDamage) throw new RangeError('Cause health damage with a combat ability first');
      requireLiving(chosen);
      prepareDestinyDamage(fight, name, { category: 'mo', hit: 'one', dice: 2, slowTargets: true }, options, roll);
      break;
    }
    case 'coup-de-grace':
      requireLiving(chosen);
      if (fight.opponents[chosen].health > 10) throw new RangeError('Opponent must have at most ten health');
      destinyStrike(fight, chosen, fight.opponents[chosen].health, name, 'fixed');
      break;
    case 'murder': case 'petrify':
      ongoing(chosen, 1);
      stat(chosen, 'speed', -1, null);
      break;
    case 'frost-hound': ongoing(chosen, 2); break;
    case 'recuperation':
      fight.effects.push({ kind: 'end-heal', amount: 1, from: fight.round, until: Number.MAX_SAFE_INTEGER, source: name });
      break;
    case 'spirit-call': ongoing(chosen, 2); break;
    case 'poison-cloud': {
      const targets = options.targets;
      if (!Array.isArray(targets) || targets.length !== 2 || Math.abs(targets[0] - targets[1]) !== 1) throw new RangeError('Choose two adjacent opponents');
      targets.forEach(requireLiving);
      targets.forEach(target => ongoing(target, 1));
      break;
    }
    case 'rallying-call': healDestinyHero(fight, 6); stat('hero', 'brawn', 2, 1, 1); break;
    case 'shape-shift':
      stat('hero', 'brawn', 3, null);
      healDestinyHero(fight, 4);
      fight.effects.push({ kind: 'stat', target: 'hero', attribute: 'armour', set: 0,
        from: fight.round, until: Number.MAX_SAFE_INTEGER, source: name });
      fight.bearForm = true;
      fight.abilities['blood-frenzy'] = Math.max(1, fight.abilities['blood-frenzy'] || 0);
      break;
    case 'sure-edge':
      if (![fight.equipment?.mainHand?.type, fight.equipment?.leftHand?.type].some(type => ['axe', 'sword', 'dagger', 'spear'].includes(type))) throw new RangeError('Requires an axe, sword, dagger or spear');
      fight.effects.push({ kind: 'score-per-die', amount: 1, from: fight.round, until: Number.MAX_SAFE_INTEGER, source: name });
      break;
    case 'tactical-manoeuvres':
      if (!(fight.equipment?.transport?.speed >= 5)) throw new RangeError('Requires transport speed five');
      stat('hero', 'speed', 2, 1, 1);
      break;
    case 'blind-strike':
      if (fight.turn.controlledOpponent !== fight.target) throw new RangeError('Use a blinding or disabling speed ability first');
      break;
    case 'power-totem':
      if (fight.powerTotemActive || destinyStat(fight, 'hero', 'magic') < 1) throw new RangeError('Totem requires one magic and must not already be active');
      stat('hero', 'magic', -1, null);
      fight.effects[fight.effects.length - 1].source = 'power-totem-cost';
      fight.powerTotemActive = true;
      fight.effects.push({ kind: 'end-heal', amount: 1, from: fight.round, until: Number.MAX_SAFE_INTEGER, source: name });
      break;
    case 'totem-blast':
      if (!fight.powerTotemActive) throw new RangeError('Activate power totem first');
      fight.powerTotemActive = false;
      fight.effects = fight.effects.filter(effect => effect.source !== 'power-totem');
      break;
    case 'creeping-cold':
      ongoing(chosen, 1);
      break;
    case 'sound-the-charge': fight.turn.soundCharge = true; break;
    case 'upper-hand': fight.autoWinRound = fight.round + 1; break;
    case 'gouge': fight.bleedBonus = (fight.bleedBonus || 0) + 1; break;
    default: throw new RangeError('Unknown advanced ability');
  }
}

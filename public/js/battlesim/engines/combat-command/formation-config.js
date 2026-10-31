// Validate declarative Combat Command formation encounters before creating saved combat state.
import { combatCommandHits } from './core.js';
import { formationUnits } from './formation-rules.js';

export const formationInteger = (value, min = 0) => {
  if (!Number.isSafeInteger(value) || value < min || value > 1000000) throw new RangeError('Invalid formation rule');
  return value;
};
export const formationSide = side => {
  if (!['player', 'enemy'].includes(side)) throw new RangeError('Choose a combat side');
  return side;
};
export const formationSideUnits = (fight, side) => side === 'player' ? fight.player : fight.enemies;

export function validateFormationConfig(input, player, charts) {
  const config = structuredClone(input);
  if (!config || typeof config.label !== 'string' || !config.label.trim()) throw new RangeError('Name this encounter');
  const forces = {player:formationUnits(player), enemy:formationUnits(config.enemies)};
  if (!forces.player.some(unit => unit.count)) throw new RangeError('Enter surviving friendly units');
  if (Object.keys(charts ?? {}).sort().join('') !== 'ABCDEFG') throw new RangeError('Missing combat charts');
  for (const chart of 'ABCDEFG') combatCommandHits(charts, chart, 1, 2);
  const keys = (side, values, allowEmpty = false) => {
    if (!Array.isArray(values) || !allowEmpty && !values.length || values.length > 100
        || new Set(values).size !== values.length || values.some(key => !forces[side].some(unit => unit.key === key))) {
      throw new RangeError('Unknown combat unit');
    }
  };
  for (const side of ['player', 'enemy']) for (const [key, schedule] of Object.entries(config.engagements?.[side] ?? {})) {
    keys(side, [key]);
    formationInteger(schedule.initial);
    formationInteger(schedule.fromRound ?? 1, 1);
    formationInteger(schedule.increment ?? 0);
    formationInteger(schedule.every ?? 1, 1);
  }
  if (config.engagements && Object.keys(config.engagements).some(side => !['player','enemy'].includes(side))) throw new RangeError('Invalid engagement side');
  function attacks(values) {
    if (!Array.isArray(values) || values.length > 100) throw new RangeError('Invalid attack sequence');
    for (const attack of values) {
      const side = formationSide(attack.side), targetSide = side === 'player' ? 'enemy' : 'player';
      combatCommandHits(charts, attack.chart, 1, 2);
      if (attack.fixedStrength !== undefined) formationInteger(attack.fixedStrength);
      if (attack.actors !== undefined) {
        if (!Array.isArray(attack.actors) || !attack.actors.length || attack.actors.length > 100) throw new RangeError('Choose attacking units');
        const actorKeys = [];
        for (const actor of attack.actors) {
          keys(side, [actor.key, ...(actor.fallbackKeys ?? [])]);
          actorKeys.push(actor.key);
          if (!['ordnance','melee'].includes(actor.stat)) throw new RangeError('Choose the attack combat value');
          if (actor.value !== undefined) formationInteger(actor.value);
          else for (const key of [actor.key, ...(actor.fallbackKeys ?? [])]) {
            if (forces[side].find(unit => unit.key === key)[actor.stat] === null) throw new RangeError('Enter the required combat value');
          }
          formationInteger(actor.multiplier ?? 1, 1);
          if (actor.countLimit !== undefined) {
            if (typeof actor.countLimit === 'number') formationInteger(actor.countLimit);
            else {
              formationInteger(actor.countLimit.value);
              if (actor.countLimit.cumulative === true) {
                if (actor.countLimit.lossRound !== undefined) throw new RangeError('Choose one casualty limit basis');
              } else formationInteger(actor.countLimit.lossRound, 1);
              keys(side, actor.countLimit.lossKeys);
            }
          }
        }
        if (new Set(actorKeys).size !== actorKeys.length) throw new RangeError('Duplicate attacking group');
      } else if (attack.fixedStrength === undefined) throw new RangeError('Enter attack strength or attacking units');
      keys(targetSide, attack.targets ?? [], Boolean(attack.reportHitsOnly));
      for (const [key, alternatives] of Object.entries(attack.targetFallbacks ?? {})) {
        if (!attack.targets.includes(key)) throw new RangeError('Unknown fallback target');
        keys(targetSide, [key, ...alternatives]);
      }
      if (!attack.reportHitsOnly && !forces[targetSide].length) throw new RangeError('Enter the opposing force');
      if (attack.targetSelection !== undefined && attack.targetSelection !== 'first') throw new RangeError('Invalid target selection');
      if (attack.casualties !== undefined && !['manual','even','ordered','wipe-on-hit'].includes(attack.casualties)) throw new RangeError('Invalid casualty policy');
      const moraleKeys = [...(attack.alwaysCheckMorale ?? []), ...(attack.moralePenalty ? [attack.moralePenalty.key] : [])];
      keys(targetSide, moraleKeys, true);
      if (attack.moralePenalty) formationInteger(attack.moralePenalty.amount, 1);
      for (const key of moraleKeys) if (forces[targetSide].find(unit => unit.key === key).morale === null) throw new RangeError('Enter current enemy morale');
    }
  }
  attacks(config.opening ?? []);
  if (!Array.isArray(config.rounds) || !config.rounds.length || config.rounds.length > 100) throw new RangeError('Enter combat rounds');
  const ranges = [];
  for (const sequence of config.rounds) {
    formationInteger(sequence.from, 1);
    if (sequence.to !== undefined) formationInteger(sequence.to, sequence.from);
    if (ranges.some(range => sequence.from <= range.to && (sequence.to ?? Infinity) >= range.from)) throw new RangeError('Combat round ranges overlap');
    ranges.push({from:sequence.from,to:sequence.to ?? Infinity});
    attacks(sequence.attacks);
  }
  for (const [name, side] of [['victoryKeys','enemy'], ['defeatKeys','player'], ['loseIfRouted','player']]) {
    if (config[name] !== undefined) keys(side, config[name]);
  }
  if (config.roundLimit !== undefined) formationInteger(config.roundLimit, 1);
  if (config.casualtyGoal) {
    formationSide(config.casualtyGoal.side);keys(config.casualtyGoal.side,config.casualtyGoal.keys);
    formationInteger(config.casualtyGoal.losses, 1);
  }
  if (config.escapeAtStart) {formationSide(config.escapeAtStart.side);keys(config.escapeAtStart.side,config.escapeAtStart.keys);}
  if (!forces.enemy.some(unit => unit.count) && !config.reportOnly) throw new RangeError('Enter surviving opponents');
  return {config,player:forces.player,enemies:forces.enemy};
}

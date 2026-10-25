import { destinyDie } from './damage.js';
import { addDestinyStatEffect, destinyStat, observeDestinyHealth, isDestinyOpponentActive, destinyAttackerTarget } from './effects.js';
import { queueDestinyEncounterEvent } from './encounter-events.js';

const doubles = values => values.length > 1 && new Set(values).size < values.length;
function hurt(fight, amount, name) {
  const damage = Math.min(fight.hero.health, amount);
  fight.hero.health -= damage;
  observeDestinyHealth(fight);
  fight.history.push({ type: 'roll-hazard', name, round: fight.round, damage });
}

// Only newly rolled dice trigger face effects. Doubles inspect the resulting
// complete roll, including an unchanged or saved companion die.
export function onDestinyHeroSpeedRoll(fight, indices, roll) {
  if (!indices.length) return;
  const values = fight.turn.heroSpeedDice;
  const forced = fight.encounter?.heroSpeedRerolls;
  if (forced) for (const index of indices) {
    let attempts = 0;
    while (forced.faces.includes(values[index])) {
      if (++attempts > 1000) throw new RangeError('Forced speed reroll did not produce an allowed face');
      const previous = values[index];
      values[index] = destinyDie(roll);
      fight.history.push({ type: 'forced-speed-reroll', name: forced.name, round: fight.round, index, previous, result: values[index] });
    }
  }
  for (const rule of fight.encounter?.heroSpeedFaces || []) {
    if (rule.requiresAlive?.some(target => !isDestinyOpponentActive(fight, target))) continue;
    hurt(fight, indices.filter(index => rule.faces.includes(values[index])).length * rule.amount, rule.name);
  }
  if (!doubles(values)) return;
  for (const rule of fight.encounter?.heroSpeedDoubles || []) {
    if (rule.requiresAlive?.some(target => !isDestinyOpponentActive(fight, target))) continue;
    if (rule.choiceGroup) {
      const counts = new Map();
      values.forEach(value => counts.set(value, (counts.get(value) || 0) + 1));
      const pairs = [...counts.values()].reduce((total, count) => total + Math.floor(count / 2), 0);
      const available = (fight.encounter.opponentGroups?.[rule.choiceGroup] || []).filter(target => isDestinyOpponentActive(fight, target));
      const returnPhase = fight.phase;
      for (let i = 0; i < Math.min(pairs, available.length); i++) queueDestinyEncounterEvent(fight,
        { kind: 'defeat-choice', name: rule.name, group: rule.choiceGroup }, returnPhase, roll);
    }
    if (rule.amount) hurt(fight, rule.amount, rule.name);
    if (rule.armourLoss) addDestinyStatEffect(fight, 'hero', 'armour', -rule.armourLoss, null, rule.name);
    if (rule.dice && fight.hero.health > 0) queueDestinyEncounterEvent(fight,
      { name: rule.name, kind: 'enemy-dice-damage', dice: rule.dice, owner: 'opponent', damageDice: true }, 'speed-rolled', roll);
  }
}

export function onDestinyOpponentSpeedRoll(fight, values) {
  if (!doubles(values)) return;
  const target = destinyAttackerTarget(fight);
  for (const rule of fight.encounter?.opponentSpeedDoubles || []) {
    if (rule.targets && !rule.targets.includes(target)) continue;
    if (rule.forceLoss) {
      fight.turn.forcedOpponentWin = true;
      if (rule.blockCategories) fight.encounter.blockedRounds = { from: fight.round, until: fight.round, categories: [...rule.blockCategories] };
      if (rule.lockRerolls) fight.turn.rerollsLocked = true;
    }
    if (rule.attribute) hurt(fight, destinyStat(fight, target, rule.attribute), rule.name);
  }
}

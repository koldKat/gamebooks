import { legendaryDie, legendaryInteger } from './character.js';
import { legendaryAutomaticDamage } from './encounter.js';

export function resolveLegendaryEnemySpell(fight, enemyIndex, roll) {
  const enemy = fight.enemies[enemyIndex];
  const book = enemy.spellPlan;
  if (!book || !['roll', 'round'].includes(book.mode)) throw new RangeError('Invalid enemy spell plan');
  const value = book.mode === 'roll' ? legendaryDie(roll) : (enemy.spellTurnsTaken ?? 0) + 1;
  const entry = book.entries.find(entry => value >= entry.min && value <= entry.max) ?? book.fallback;
  if (!entry) throw new RangeError('Missing enemy spell outcome');
  const effects = entry.effects;
  const maximumHealth = effect => legendaryInteger(effect.maximum ?? enemy.maxHealth, 1);
  const repeat = effects.length === 1 && effects[0].type === 'healSelf' && effects[0].rerollIfFull &&
    enemy.health >= maximumHealth(effects[0]);
  fight.log = [...fight.log.slice(-59), { type: 'enemySpell', round: fight.round, enemyIndex, value,
    name: entry.name, ...(repeat ? { reroll: true } : {}) }];
  if (repeat) return { repeat: true, actions: [] };
  if (book.mode === 'round') enemy.spellTurnsTaken = value;
  const heroes = fight.participants.filter(index => fight.party[index].health > 0 &&
    (fight.rules.heroArrivalRounds?.[index] ?? 1) <= fight.round &&
    !(fight.rules.controlledMember === index && fight.enemies[fight.rules.controllerIndex].health > 0));
  const actions = [];
  for (const effect of effects) {
    if (effect.type === 'attack' || effect.type === 'damage') {
      const recipients = effect.recipients ?? 1;
      for (let index = 0; index < recipients; index++) actions.push({ enemyIndex,
        ...(effect.type === 'damage' ? { hits: effect.hits } : { count: effect.count, threshold: effect.threshold ?? 4 }),
        ...(effect.noArmour ? { noArmour: true } : {}),
        ...(recipients > 1 ? { distinctGroup: true, requiredRecipients: recipients } : {}) });
    } else if (effect.type === 'damageParty') {
      for (const forcedMember of heroes) actions.push({ enemyIndex, hits: effect.hits,
        noArmour: !!effect.noArmour, forcedMember, ...(effect.unpreventable ? {unpreventable:true} : {}) });
    } else if (effect.type === 'healSelf') {
      enemy.health = Math.min(maximumHealth(effect), enemy.health + legendaryInteger(effect.amount));
    } else if (effect.type === 'setDefence') {
      fight.playerHitThreshold = effect.value;
    } else if (effect.type === 'halveFightingNextTurn') {
      fight.halfFightingRound = fight.round + (fight.rules.partyFirst ? 1 : 0);
    } else if (effect.type === 'stunStrongest') {
      actions.push({enemyIndex,chooseStun:true,count:Math.min(effect.count,heroes.length)});
    } else if (effect.type === 'sacrificeOthers') {
      let hits = 0;
      for (const [index, other] of fight.enemies.entries()) if (index !== enemyIndex && other.health > 0) {
        other.health--;hits++;
      }
      if (hits) actions.push({enemyIndex,hits,noArmour:true});
    } else if (effect.type === 'healOthers') {
      for (const [index, other] of fight.enemies.entries()) if (index !== enemyIndex)
        other.health += effect.amount;
    } else if (effect.type === 'weaponOpening') {
      enemy.weaponVulnerableRound = fight.round + (fight.rules.partyFirst ? 1 : 0);
    } else if (effect.type === 'vulnerabilityTarget') {
      const armour = index => fight.party[index].armour + (fight.armourBonuses?.[index] ?? 0);
      const maximum = Math.max(...heroes.map(armour));
      const candidates = heroes.filter(index => armour(index) === maximum);
      actions.push({enemyIndex,chooseVulnerability:true,candidates,attackerIndex:effect.attackerIndex,
        threshold:effect.threshold});
    } else if (effect.type === 'ordinary') {
      const automaticDamage = legendaryAutomaticDamage(fight, enemyIndex);
      actions.push({ enemyIndex, count: enemy.attack, threshold: enemy.threshold,
        ...(automaticDamage ? { automaticDamage } : {}) });
    } else if (effect.type !== 'skip') throw new RangeError('Unknown enemy spell effect');
  }
  return { repeat: false, actions };
}

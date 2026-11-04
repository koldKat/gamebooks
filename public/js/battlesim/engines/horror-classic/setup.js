// Read declarative panel choices and source group sizes without changing a saved fight.
import {number,rollDice} from './math.js';

export function panelProfile(rules={}) {
  return {roles:rules.combatRole ?? ['harker','dracula'],
    weapons:rules.weapons ?? ['none','dagger','mace','flintlock'],
    items:rules.items ?? ['hand','paralyser','antidote'],
    naturalHealingRoles:rules.naturalHealingRoles ?? ['harker'],
    extras:rules.combatOptions ?? [],persistentStatuses:rules.persistentStatuses ?? [],
    legacyOptions:rules.combatOptions ? [] : ['garlicOil','partyCard','cursed','bat'],
    createdAlly:rules.createdAlly};
}

export function encounterCount(item,options) {
  if (!item) return options.opponents.length;
  if (item.count.dice && (options.countScore==='' || options.countScore==null)) throw new RangeError('Enter and apply the group-size roll.');
  let count=item.count.fixed ?? Math.ceil(rollDice(item.count.dice,undefined,options.countScore).total/(item.count.divisor || 1));
  const reduction=item.preCombatReduction;
  if (options.useCompanionReduction && reduction) {
    if (reduction.kind==='die') {
      if (options.reductionScore==='' || options.reductionScore==null) throw new RangeError('Enter the companion’s reduction roll.');
      count-=rollDice(reduction.dice,undefined,options.reductionScore).total;
    }
    else if (reduction.kind==='half' && count>(reduction.onlyAbove ?? 0)) count-=Math.floor(count/2);
  }
  return Math.max(0,count);
}

export function configuredOptions(setup,profile) {
  const options=Object.fromEntries(['weapon',...profile.legacyOptions].map(key=>[key,setup[key]]));
  for (const field of profile.extras) options[field.key]=field.type==='checkbox'?setup[field.key]===true:number(setup[field.key] ?? 0);
  options.resurrectionCount=setup.resurrectionCount;
  options.openingDamageApplied=setup.openingDamageApplied===true;
  if (profile.createdAlly) options.createdAlly=structuredClone(profile.createdAlly);
  return options;
}

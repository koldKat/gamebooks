import { damageDestinyHero, destinyStat, destinyStrike, addDestinyStatEffect, healDestinyHero, isDestinyOpponentActive, isDestinyOpponentDead, destinyDamageAllowed, destinyPassiveDamageBonus, onDestinyHeroDice, applyDestinyHeroRoll, destinyArmour, applyDestinyAcceptedHeroRoll, hasDestinyAbility } from './effects.js';
import {reviveDestinyHero} from './core.js';
import {prepareDestinyCancellation,destinyUncancelledDice} from './damage-cancellation.js';
import {destinyPetDamageBonus,destinyPetHasAbility} from './effects.js';

const living = fight => fight.opponents.map((opponent, index) => isDestinyOpponentActive(fight, index) ? index : -1).filter(index => index >= 0);
function target(fight, index) {
  if (!Number.isInteger(index) || !isDestinyOpponentActive(fight, index)) throw new RangeError('Choose a living opponent');
  return index;
}
export function destinyDie(roll) {
  const value = roll();
  if (!Number.isInteger(value) || value < 1 || value > 6) throw new RangeError('A die must roll 1-6');
  return value;
}

// Each separately rolled damage group stays separate. A shared cleave roll
// has several targets; aftershock has two independently editable rolls.
export function prepareDestinyDamage(fight, name, spec, options, roll) {
  if (spec.weaken && options.attribute !== undefined && !['brawn', 'magic'].includes(options.attribute)) throw new RangeError('Choose brawn or magic');
  const chosen = options.target ?? fight.target;
  let targets;
  if (spec.hit === 'all' || spec.hit === 'dragon') targets = living(fight);
  else if (spec.hit === 'below') targets = living(fight).filter(index => index >= target(fight, chosen));
  else if (spec.hit==='selected') {
    targets=options.targets??[chosen];
    const maximum=destinyPetHasAbility(fight,spec.targetLimitPetAbility)?spec.upgradedMaximumTargets:spec.maximumTargets;
    if(!Array.isArray(targets)||targets.length<1||targets.length>maximum||new Set(targets).size!==targets.length) throw new RangeError('Choose distinct opponents within the target limit');
    targets.forEach(index=>target(fight,index));
    if(spec.adjacentTargets&&[...targets].sort((a,b)=>a-b).some((value,i,sorted)=>i>0&&value!==sorted[i-1]+1)) throw new RangeError('Choose adjacent opponents');
  } else if (['two', 'adjacent'].includes(spec.hit)) {
    targets = options.targets;
    if (!Array.isArray(targets) || targets.length !== 2 || targets[0] === targets[1]) throw new RangeError('Choose two opponents');
    targets.forEach(index => target(fight, index));
    if (spec.hit === 'adjacent' && Math.abs(targets[0] - targets[1]) !== 1) throw new RangeError('Choose adjacent opponents');
  } else targets = [target(fight, chosen)];
  if (spec.hit === 'dragon') target(fight, chosen);
  if(spec.hit==='one'&&!spec.adjacentDamage&&(fight.turn?.blockedSingleTargets?.includes(targets[0])||fight.encounter?.damageShieldWhileAlive?.some(rule=>rule.target===targets[0]&&rule.kinds?.includes('single-ability')))&&
      !destinyDamageAllowed(fight,targets[0],'single-ability')) throw new RangeError('Defeat the opponent protecting this single target first');
  if(spec.healPerTarget) healDestinyHero(fight,targets.length*(destinyPetHasAbility(fight,spec.healUpgradePetAbility)?spec.upgradedHealPerTarget:spec.healPerTarget));
  const group = (count, affected) => {
    const dice=applyDestinyHeroRoll(fight,Array.from({length:count},()=>destinyDie(roll)),'damage');onDestinyHeroDice(fight,dice);
    const result={dice,targets:[...affected],bonuses:{}};
    for(const target of affected)prepareDestinyCancellation(fight,target,result,roll);
    return result;
  };
  const abilityDiceBonus = Object.keys(fight.abilities||{}).reduce((sum,ability)=>{
    const bonus=fight.abilityCatalog?.[ability]?.abilityExtraDice;
    return sum+(bonus&&bonus.abilities.includes(name)&&hasDestinyAbility(fight,ability)&&destinyArmour(fight,'hero')>=bonus.minimumArmour?bonus.dice:0);
  },0);
  const countBonus = (fight.turn.torrentFor === name ? 1 : 0)+abilityDiceBonus;
  const groups = spec.fixedDamage !== undefined || spec.fixedDamageEquipmentStats ? [{dice:[],bonuses:{},targets,
    amount:spec.fixedDamage ?? spec.fixedDamageEquipmentStats.reduce((sum,stat)=>sum+(spec.fixedDamageWeaponType?
      ['mainHand','leftHand'].reduce((value,slot)=>value+(fight.equipment?.[slot]?.type===spec.fixedDamageWeaponType?fight.equipment[slot][stat]||0:0),0):
      fight.equipment?.[spec.fixedDamageEquipmentSlot || 'mainHand']?.[stat]||0),0)}] :
    spec.fixedDamageStat ? [{ dice: [], bonuses: {}, targets, amount:
    Math.ceil((spec.fixedDamageOwner==='opponent'&&spec.fixedDamageStat==='armour'?destinyArmour(fight,chosen):destinyStat(fight, spec.fixedDamageOwner === 'opponent' ? chosen : 'hero', spec.fixedDamageStat, {ignoreModifierIncreases:!!spec.unmodified})) / (spec.fixedDamageDivisor || 1)) }] :
    spec.shared ? [group(spec.dice + countBonus, targets)] : targets.map((index, order) => {
    let count = spec.dice + abilityDiceBonus;
    if (spec.hit === 'dragon' && index !== chosen) count = 1;
    if (spec.hit === 'below') count = Math.max(1, 3 - order);
    if (spec.speedDifference) count += Math.max(0, destinyStat(fight, 'hero', 'speed') - destinyStat(fight, index, 'speed'));
    return group(count, [index]);
  });
  const selfDamage=spec.selfDamageDice ? applyDestinyHeroRoll(fight,Array.from({length:spec.selfDamageDice},()=>destinyDie(roll)),'damage') : [];
  const pending = { type: 'damage', name, spec: { ...spec }, options: structuredClone(options), groups, selfDamage, returnPhase: fight.phase };
  if (options.deferDamage && !spec.unmodified && groups.some(group => group.dice.length)) {
    fight.turn.pendingAbility = pending;
    fight.phase = 'ability-rolled';
  } else applyDestinyDamage(fight, pending);
}

export function applyDestinyDamage(fight, pending) {
  const { name, spec, options, groups } = pending;
  const bonus = destinyPassiveDamageBonus(fight)+destinyPetDamageBonus(fight,name,true)+(spec.unmodified ? 0 : fight.effects.filter(effect => effect.kind === 'damage-per-die' &&
    effect.from <= fight.round && effect.until >= fight.round).reduce((sum, effect) => sum + effect.amount, 0));
  for (const group of groups) {
    const healthBeforeHazard = fight.hero.health;
    applyDestinyAcceptedHeroRoll(fight,group.dice,'damage');
    if(fight.encounter?.forcedLoss||fight.encounter?.forcedVictory)return;
    if (fight.hero.health < healthBeforeHazard) {
      reviveDestinyHero(fight);
      if (fight.hero.health <= 0) return;
    }
    const weaponBonus=(spec.addWeaponStat?(fight.equipment?.mainHand?.[spec.addWeaponStat]||0)+(fight.equipment?.leftHand?.[spec.addWeaponStat]||0):0)+
      (spec.mainHandHighestDamageStat?Math.max(fight.equipment?.mainHand?.brawn||0,fight.equipment?.mainHand?.magic||0):0);
    const upgradeBonus=(spec.flatDamageBonus||0)+(spec.usageUpgrade&&hasDestinyAbility(fight,spec.usageUpgrade.ability)?spec.usageUpgrade.damageBonus||0:0)+destinyPetDamageBonus(fight,name);
    const damage = group.dice.reduce((sum, face, index) => sum + face + bonus + (group.bonuses[index] || 0), (group.amount || 0)+weaponBonus+upgradeBonus);
    for (const index of group.targets) {
      // A modifier played during this roll may already have defeated a target.
      // Resolve the remaining targets without striking or debuffing the corpse.
      if (!isDestinyOpponentActive(fight,index)) continue;
      if(fight.encounter?.abilityCategoryImmunityByTarget?.[index]?.includes(spec.category??fight.abilityCatalog?.[name]?.category))continue;
      const extra=spec.bonusAgainstStatus;
      const statusBonus=extra&&fight.effects.some(effect=>effect.target===index&&effect.kind===extra.status&&effect.from<=fight.round&&effect.until>=fight.round&&(!extra.priorRound||effect.from<fight.round))?extra.amount:0;
      const targetDamage=group.cancellationDiceByTarget?.[index]?destinyUncancelledDice(group,index).reduce((sum,i)=>sum+group.dice[i]+bonus+(group.bonuses[i]||0),(group.amount||0)+weaponBonus+upgradeBonus):damage;
      const attributeBonus=spec.targetStatBonus?(spec.targetStatBonus==='armour'?destinyArmour(fight,index):destinyStat(fight,index,spec.targetStatBonus)):0;
      const shielded=fight.encounter?.shieldsByTarget?.[index]?.health>0;
      const adjacentBefore=spec.adjacentDamage?[index-1,index+1].filter(target=>isDestinyOpponentActive(fight,target)):[];
      const lost = spec.passiveAttack && !destinyDamageAllowed(fight, index, 'passive') ? 0 :
        destinyStrike(fight, index, targetDamage+statusBonus+attributeBonus, name, spec.damageKind || (spec.fixedDamageStat ? 'fixed-ability' : 'dice'));
      if(spec.adjacentDamage) for(const adjacent of adjacentBefore) {
        if(isDestinyOpponentActive(fight,adjacent)&&!fight.encounter?.abilityCategoryImmunityByTarget?.[adjacent]?.includes(spec.category)) destinyStrike(fight,adjacent,spec.adjacentDamage,name,'fixed-ability');
      }
      if(shielded)continue;
      if (spec.passive && isDestinyOpponentDead(fight, index)) fight.turn.pendingPassiveDeath = true;
      if (spec.category === 'co' && lost) fight.turn.combatAbilityDamage = true;
      if (spec.ignite && lost && !fight.effects.some(effect=>effect.kind==='burn'&&effect.target===index)) fight.effects.push({kind:'burn',target:index,from:fight.round,until:Number.MAX_SAFE_INTEGER,source:name});
      if (spec.drain && lost) healDestinyHero(fight, 2);
      if (spec.recoil && lost) damageDestinyHero(fight,1);
      if (spec.armourLoss) addDestinyStatEffect(fight, index, 'armour', -spec.armourLoss, null, name);
      if(spec.setArmour!==undefined)fight.effects.push({kind:'stat',target:index,attribute:'armour',set:spec.setArmour,from:fight.round,until:Number.MAX_SAFE_INTEGER,source:name});
      if (spec.weaken) {
        const attribute = options.attribute ?? fight.opponents[index].damageStat;
        if (!['brawn', 'magic'].includes(attribute)) throw new RangeError('Choose brawn or magic');
        addDestinyStatEffect(fight, index, attribute, -1, null, name);
      }
      if (spec.slowTargets) addDestinyStatEffect(fight, index, 'speed', -1, 1, name, 1);
      if (spec.ongoing) fight.effects.push({ kind: 'ongoing-damage', target: index, amount: spec.ongoing,
        from: fight.round, until: Number.MAX_SAFE_INTEGER, source: name });
      if (spec.delayed) fight.effects.push({ kind: 'delayed-dice', target: index,
        from: fight.round + 1, until: fight.round + 1, source: name });
    }
  }
  if (pending.selfDamage?.length) {
    applyDestinyAcceptedHeroRoll(fight,pending.selfDamage,'damage');
    if(fight.encounter?.forcedLoss||fight.encounter?.forcedVictory)return;
    const damage=damageDestinyHero(fight,pending.selfDamage.reduce((sum,face)=>sum+face,0));
    fight.history.push({type:'ability-recoil',round:fight.round,source:name,dice:[...pending.selfDamage],damage});
  }
  if (spec.slowHero) addDestinyStatEffect(fight, 'hero', 'speed', -1, 1, name, 1);
}

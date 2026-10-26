import {hasDestinyAbility,addDestinyStatEffect,healDestinyHero,destinyStrike,isDestinyOpponentActive,damageDestinyHero} from './effects.js';

// Reactions belong to equipped passives. They mutate only the ability action's
// private combat snapshot and never create inventory items or new charges.
export function applyDestinyAbilityReactions(fight,name,activated,options,paidMagic=0) {
  for(const reaction of fight.encounter?.onAbilityCategoryUse||[])if(reaction.categories.includes(activated.category)){
    for(const change of reaction.stats||[])addDestinyStatEffect(fight,change.target,change.attribute,change.amount,change.duration,reaction.name,change.delay||0);
    if(reaction.blockSameCategoryNextRound){
      const previous=fight.encounter.blockedRounds,categories=previous?.from===fight.round+1&&previous.until===fight.round+1?previous.categories:[];
      fight.encounter.blockedRounds={from:fight.round+1,until:fight.round+1,categories:[...new Set([...categories,activated.category])]};
    }
    if(reaction.unrestorable)(fight.encounter.unrestorableAbilities??=[]).push(name);
  }

  for(const rule of fight.encounter?.abilityUseDamage||[])if(rule.categories.includes(activated.category)) {
    const damage=damageDestinyHero(fight,rule.amount);
    fight.history.push({type:'ability-cost',name:rule.name,ability:name,round:fight.round,damage});
  }
  if(paidMagic>0) {
    fight.turn.magicSpent=(fight.turn.magicSpent||0)+paidMagic;
    for(const passive of Object.keys(fight.abilities||{})) {
      const reaction=fight.abilityCatalog?.[passive]?.onMagicSpent;
      if(!reaction||!hasDestinyAbility(fight,passive)) continue;
      if(reaction.roundThreshold) {
        if(fight.turn.magicSpent<reaction.roundThreshold||fight.turn.magicThresholdPassives?.includes(passive)) continue;
        (fight.turn.magicThresholdPassives??=[]).push(passive);
      }
      for(const change of reaction.stats||[]) addDestinyStatEffect(fight,'hero',change.attribute,change.amount,change.duration,passive);
      if(reaction.damagePerPoint) {
        let target=options.magicReactionTarget??fight.target;
        if(options.magicReactionTarget!==undefined&&!isDestinyOpponentActive(fight,target)) throw new RangeError('Choose a living magic reaction target');
        if(!isDestinyOpponentActive(fight,target)) target=fight.opponents.findIndex((_,i)=>isDestinyOpponentActive(fight,i));
        if(target>=0) destinyStrike(fight,target,paidMagic*reaction.damagePerPoint,passive,'passive');
      }
    }
  }
  for(const [passive,spec]of Object.entries(fight.abilityCatalog||{})) {
    const reaction=spec.onAbilityUsed;
    if(!reaction||!hasDestinyAbility(fight,passive)||reaction.categories&&!reaction.categories.includes(activated.category)||
      reaction.names&&!reaction.names.includes(name)) continue;
    for(const change of reaction.stats||[]) addDestinyStatEffect(fight,'hero',change.attribute,change.amount,change.duration,passive);
    if(reaction.heal) healDestinyHero(fight,reaction.heal);
    const damage=reaction.damage??(reaction.damageEquipmentStat?fight.equipment?.[reaction.equipmentSlot||'mainHand']?.[reaction.damageEquipmentStat]||0:0);
    if(damage>0) {
      let target=options.reactionTarget??fight.target;
      if(options.reactionTarget!==undefined&&!isDestinyOpponentActive(fight,target)) throw new RangeError('Choose a living reaction target');
      if(!isDestinyOpponentActive(fight,target)) target=fight.opponents.findIndex((_,i)=>isDestinyOpponentActive(fight,i));
      if(target>=0) destinyStrike(fight,target,damage,passive,'fixed-ability');
    }
  }
}

export function applyDestinyRoundAbilityEffects(fight,options) {
  let applied=false;
  const living=new Set(fight.opponents.map((_,i)=>i).filter(i=>isDestinyOpponentActive(fight,i)));
  for(const name of Object.keys(fight.abilities||{})) {
    const spec=fight.abilityCatalog?.[name];
    if((!spec?.roundStartDamage&&!spec?.roundStartStats)||!hasDestinyAbility(fight,name)) continue;
    const target=options.roundStartTargets?.[name]??fight.target;
    if(!living.has(target)) throw new RangeError('Choose a living opponent for the start-of-round ability');
    if(!isDestinyOpponentActive(fight,target)) continue;
    applied=true;
    for(const change of spec.roundStartStats||[]) addDestinyStatEffect(fight,target,change.attribute,change.amount,change.duration,name);
    if(spec.roundStartDamage) destinyStrike(fight,target,spec.roundStartDamage,name,'passive');
  }
  return applied;
}

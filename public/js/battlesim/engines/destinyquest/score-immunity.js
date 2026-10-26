// Score-only opponents ignore attack contributions from specified categories.
// Keep provenance on the saved turn; build a temporary view for calculation.
const numeric=['extraDamageDice','damageScoreBonus','damagePerDie'];
const flags=['ignoreArmour','halfArmour','damageUsesBrawn'];

export function destinyAbilityCategoryImmune(fight,target,name){
  return !!fight.encounter?.abilityCategoryImmunityByTarget?.[target]?.includes(fight.abilityCatalog?.[name]?.category);
}

export function recordDestinyScoreAbility(before,next,name,spec){
  if(!next.encounter?.abilityCategoryImmunityByTarget||!before.turn||!next.turn)return;
  const entry={name,category:spec.category,numeric:{},flags:{}};
  for(const key of numeric){const delta=(next.turn[key]||0)-(before.turn[key]||0);if(delta)entry.numeric[key]=delta;}
  for(const key of flags)if(next.turn[key]!==before.turn[key])entry.flags[key]=before.turn[key]??false;
  const oldCount=before.turn.damageDice?.length||0,newCount=next.turn.damageDice?.length||0;
  if(newCount>oldCount){
    next.turn.damageDieSources??=Array(oldCount).fill(null);
    while(next.turn.damageDieSources.length<newCount)next.turn.damageDieSources.push(spec.category);
  }
  if(Object.keys(entry.numeric).length||Object.keys(entry.flags).length)(next.turn.scoreAbilityContributions??=[]).push(entry);
}

export function markDestinyScoreDice(fight,count){
  if(!fight.encounter?.abilityCategoryImmunityByTarget)return;
  const extra=fight.turn.extraDamageDice||0,sources=Array(count).fill(null);
  let index=count-extra;
  for(const entry of fight.turn.scoreAbilityContributions||[])for(let n=0;n<(entry.numeric.extraDamageDice||0)&&index<count;n++)sources[index++]=entry.category;
  fight.turn.damageDieSources=sources;
}

export function destinyScoreContext(fight){
  const blocked=fight.encounter?.abilityCategoryImmunityByTarget?.[fight.target];
  if(fight.scoreImmunityView||fight.turn?.winner!=='hero'||!blocked?.length)return fight;
  const next=structuredClone(fight);next.scoreImmunityView=true;
  next.effects=next.effects.filter(effect=>!blocked.includes(next.abilityCatalog?.[effect.source]?.category));
  for(const name of Object.keys(next.abilities||{}))if(blocked.includes(next.abilityCatalog?.[name]?.category))delete next.abilities[name];
  const restored=new Set();
  for(const entry of next.turn.scoreAbilityContributions||[]){
    if(!blocked.includes(entry.category))continue;
    for(const [key,amount] of Object.entries(entry.numeric))next.turn[key]=(next.turn[key]||0)-amount;
    for(const [key,value] of Object.entries(entry.flags))if(!restored.has(key)){next.turn[key]=value;restored.add(key);}
  }
  if(next.turn.damageDice){
    const kept=next.turn.damageDice.map((_,i)=>i).filter(i=>!blocked.includes(next.turn.damageDieSources?.[i]));
    next.turn.damageDice=kept.map(i=>next.turn.damageDice[i]);
    next.turn.damageDieBonuses=Object.fromEntries(kept.map((old,index)=>[index,next.turn.damageDieBonuses?.[old]||0]));
  }
  return next;
}

const specFor=(fight,name)=>fight.encounter?.grantedAbilities?.[name]?.spec??fight.abilityCatalog?.[name];
const automatic=spec=>['pa','mo'].includes(spec?.category)&&spec.phases.length===0&&!spec.quotaStatus;
const owns=(fight,name)=>(fight.abilities?.[name]||0)>0&&!fight.encounter?.disableHeroAbilities&&!fight.encounter?.cancelledAbilities?.includes(name)&&!fight.encounter?.sacrificedAbilities?.includes(name);

// Setup mutates only configureDestinyAbilities' fresh snapshot. Set selections
// describe what the player is wearing; they never create application items.
export function configureDestinyAbilityQuota(fight,{preserveGrants=false}={}){
  const priorGrants=preserveGrants?structuredClone(fight.abilityGrantSources||{}):{};
  delete fight.abilityQuota;delete fight.abilityGrantSources;
  const selected=Object.keys(fight.abilities),catalog=fight.abilityCatalog||{};
  for(const name of selected){
    const granted=catalog[name]?.grantsAbility;
    if(!granted||!catalog[granted])continue;
    if(!fight.abilities[granted]){
      fight.abilities[granted]=1;
      (fight.abilityGrantSources??={})[granted]=[name];
    }else if(fight.abilityGrantSources?.[granted])fight.abilityGrantSources[granted].push(name);
  }
  for(const [name,sources] of Object.entries(priorGrants))if(fight.abilities[name]){
    const retained=sources.filter(source=>fight.abilities[source]&&catalog[source]?.grantsAbility===name);
    if(retained.length)(fight.abilityGrantSources??={})[name]=retained;
  }
  const maxima=selected.map(name=>catalog[name]?.quotaMaximum).filter(Number.isSafeInteger);
  if(!maxima.length)return;
  const bonus=selected.reduce((sum,name)=>sum+(catalog[name]?.quotaIncrease||0),0);
  const maximum=Math.max(...maxima)+bonus;
  if(!Number.isSafeInteger(maximum)||maximum<1||maximum>100)throw new RangeError('Invalid ability quota');
  fight.abilityQuota={maximum,used:[],everUsed:[],activePassives:[],paidExempt:[]};
}

export function destinyQuotaPassiveActive(fight,name){
  const passive=automatic(specFor(fight,name));
  if(passive&&fight.encounter?.abilityChallenge&&!fight.encounter.abilityChallenge.activePassives.includes(name))return false;
  return !fight.abilityQuota||!passive||fight.abilityQuota.activePassives.includes(name);
}

export function destinyAbilityGrantActive(fight,name){
  const sources=fight.abilityGrantSources?.[name];
  return !sources||sources.some(source=>owns(fight,source)&&destinyQuotaPassiveActive(fight,source));
}

export function destinyQuotaExempt(fight,name){
  if(specFor(fight,name)?.quotaExempt||fight.abilityQuota?.paidExempt.includes(name))return true;
  return Object.keys(fight.abilities||{}).some(source=>owns(fight,source)&&destinyQuotaPassiveActive(fight,source)&&specFor(fight,source)?.quotaExemptAbilities?.includes(name));
}

export function checkDestinyAbilityQuota(fight,name){
  if(fight.encounter?.abilityChallenge?.used.includes(name))throw new RangeError('This ability has already been activated during the challenge');
  const quota=fight.abilityQuota;
  if(!quota||destinyQuotaExempt(fight,name)||quota.used.includes(name))return;
  const occupied=new Set(quota.used);
  for(let pending=fight.turn?.pendingAbility;pending;pending=pending.suspendedAbility){
    if(['ability-check','ability-interception'].includes(pending.type)&&typeof pending.ability==='string'&&!destinyQuotaExempt(fight,pending.ability))occupied.add(pending.ability);
  }
  if(!occupied.has(name)&&occupied.size>=quota.maximum)throw new RangeError('The combat ability limit has been reached');
}

export function validateDestinyQuotaOverride(fight,name,spec,options){
  const ability=options.ability,chosen=specFor(fight,ability),quota=fight.abilityQuota;
  if(!quota)throw new RangeError('There is no combat ability quota to override');
  if(!chosen||ability===name||chosen.quotaStatus||chosen.category==='-'||!owns(fight,ability)||!destinyAbilityGrantActive(fight,ability))throw new RangeError('Choose an available unused ability');
  if(quota.everUsed.includes(ability)||quota.paidExempt.includes(ability)||fight.used[ability]>0)throw new RangeError('Choose an unused ability that has not already been funded');
  if(fight.hero.health<spec.payQuotaOverride)throw new RangeError('Not enough Health for the quota override');
  return ability;
}

export function recordDestinyQuotaAbility(fight,name){
  const quota=fight.abilityQuota;
  checkDestinyAbilityQuota(fight,name);
  if(fight.encounter?.abilityChallenge)fight.encounter.abilityChallenge.used.push(name);
  if(!quota)return;
  if(!destinyQuotaExempt(fight,name)&&!quota.used.includes(name))quota.used.push(name);
  if(!quota.everUsed.includes(name))quota.everUsed.push(name);
}

export function setDestinyPassiveActivation(fight,name,enabled=true){
  if(fight?.combatStance)throw new RangeError('The current stance blocks passive changes');
  const spec=specFor(fight,name);
  if(fight?.status!=='active'||!fight.abilityQuota&&!fight.encounter?.abilityChallenge||!owns(fight,name)||!automatic(spec)||typeof enabled!=='boolean')throw new RangeError('Choose an available passive for this ability quota');
  if(spec.activeWithLeftHand&&fight.equipment?.leftHand?.type!==spec.activeWithLeftHand)throw new RangeError('Required left-hand weapon is missing');
  const next=structuredClone(fight),active=next.encounter?.abilityChallenge?.activePassives??next.abilityQuota.activePassives;
  if(active.includes(name)===enabled)return next;
  delete next.sustainedDamage;
  if(enabled){recordDestinyQuotaAbility(next,name);active.push(name);if(next.encounter?.abilityChallenge&&next.abilityQuota)next.abilityQuota.activePassives.push(name);}
  else{
    if(next.encounter?.abilityChallenge)next.encounter.abilityChallenge.activePassives=active.filter(value=>value!==name);
    if(next.abilityQuota)next.abilityQuota.activePassives=next.abilityQuota.activePassives.filter(value=>value!==name);
  }
  next.history.push({type:'passive-activation',round:next.round,name,enabled});
  return next;
}

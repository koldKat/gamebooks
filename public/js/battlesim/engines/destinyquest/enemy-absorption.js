// Queue and description gates for an opponent which copies played abilities.
// Execution uses a separate opponent context; never grant copies to the player.
const weaponCareerKeys=['requires','requiresMainHand','requiresLeftHand','requiresAnyWeaponType','requiresWeaponHands','excludedCareer','exclusiveCareer','requiresCareer'];

export function destinyEnemyAbilityCatalog(catalog,settings){
  const next=structuredClone(catalog);
  if(settings.ignoreWeaponCareerRequirements)for(const spec of Object.values(next))for(const key of weaponCareerKeys)delete spec[key];
  return next;
}

export function captureDestinyAbsorbedAbility(fight,name,spec){
  const rule=fight.encounter?.enemyAbsorption;
  if(!rule||!rule.categories.includes(spec.category))return;
  const state=(fight.enemyAbilityState??={queue:[],usedCategories:{},nextId:1});
  const entry={id:state.nextId++,name,category:spec.category,capturedRound:fight.round,availableRound:fight.round+rule.delayRounds,used:false};
  state.queue.push(entry);
  fight.history.push({type:'enemy-absorption',round:fight.round,ability:name,entry:entry.id,availableRound:entry.availableRound});
}

// These are scheduling gates, not a substitute for the native ability
// validator. Conditional dice, targets and counters are checked at execution.
export function destinyAbsorbedCandidates(fight,phase=fight.phase){
  const rule=fight.encounter?.enemyAbsorption,state=fight.enemyAbilityState;
  if(!rule||!state||fight.status!=='active')return [];
  return state.queue.filter(entry=>{
    const spec=fight.abilityCatalog?.[entry.name];
    if(entry.used||entry.availableRound>fight.round||state.usedCategories[entry.category]===fight.round||!spec?.phases.includes(phase))return false;
    if(spec.firstRound&&fight.round!==1)return false;
    if(spec.heroWon&&fight.turn?.winner!=='opponent'||spec.enemyWon&&fight.turn?.winner!=='hero')return false;
    if(spec.afterHit&&!(fight.turn?.winner==='opponent'&&fight.turn.healthDamage>0))return false;
    if(spec.afterEnemyHit&&!(fight.turn?.winner==='hero'&&fight.turn.healthDamage>0))return false;
    if(spec.requiresCompanion&&!rule.companions?.includes(spec.requiresCompanion))return false;
    return true;
  }).map(entry=>structuredClone(entry));
}

export function consumeDestinyAbsorbedAbility(fight,id){
  const entry=fight.enemyAbilityState?.queue.find(entry=>entry.id===id);
  if(!entry||!destinyAbsorbedCandidates(fight).some(candidate=>candidate.id===id))throw new RangeError('The absorbed ability is not available now');
  entry.used=true;entry.usedRound=fight.round;
  fight.enemyAbilityState.usedCategories[entry.category]=fight.round;
  fight.history.push({type:'enemy-ability',round:fight.round,ability:entry.name,entry:id});
}

// Legion encounter profiles and exceptions are loaded from book_enemies. This
// factory contains no roster names, stats or section-specific rule branches.
import {createDestinyFight,settleDestinyFight} from './core.js';
import {configureDestinyAbilities,destinyNeverUsedAbilities,rerollDestinyPursuit} from './abilities.js';
import {attachDestinyCharacter} from './character.js';
import {destinyEncounterSettings,destinyEncounterAction} from './encounter-settings.js';
import {LEGION_ABILITIES} from './legion-abilities.js';
import {destinyStrike,addDestinyStatEffect,healDestinyHero,destinyStat,damageDestinyHero,hasDestinyAbility} from './effects.js';
import {beginDestinyHeroRelay} from './hero-relay.js';
import {applyDestinyOpponentForm} from './round-events.js';
import {LEGION_CONSUMABLES,useLegionConsumable} from './legion-consumables.js';
import {prepareDestinyDamage} from './damage.js';
import {finishDestinyAbilityAction} from './ability-rolls.js';
import {setDestinyPassiveActivation} from './ability-quota.js';

export const LEGION_BOOK_RULES=Object.freeze({deathMoves:false,deathPenalties:false});

export function legionRosterFor(roster,section){
  if(!Array.isArray(roster))throw new TypeError('Load the book roster first');
  const entry=roster.find(row=>row.section===String(section));
  if(!entry)throw new RangeError('Unknown Legion encounter');
  if(entry.adapter?.implemented!==true)throw new RangeError('This encounter still needs its complete rules adapter');
  return structuredClone(entry);
}

function applyLegionContext(fight,preset,options){
  const allies=Object.entries(preset.adapter.allyOptions||{}).filter(([id,choice])=>{
    const alive=options[choice.option]??fight.character?.companions?.[id]?.alive??choice.defaultAlive;
    if(typeof alive!=='boolean')throw new RangeError('Specify whether each companion is alive');
    return alive;
  }).map(([id])=>id);
  if(preset.adapter.allyOptions)fight.encounter.survivingAllies=allies;
  const rods=preset.adapter.rodContext;if(!rods)return;
  const placements=options.rodPlacements??fight.character?.rodPlacements;
  if(placements!==undefined){
    if(!placements||typeof placements!=='object'||Array.isArray(placements)||Object.keys(placements).length!==rods.directions.length||
      rods.directions.some(direction=>!Object.hasOwn(rods.effects,placements[direction]))||new Set(Object.values(placements)).size!==rods.directions.length)throw new RangeError('Place one different rod in each passage');
    if(fight.character)fight.character.rodPlacements=structuredClone(placements);
  }
  const chosen=options[rods.option]??placements?.[rods.direction];
  if(!Object.hasOwn(rods.effects,chosen))throw new RangeError('Choose the rod placed in this passage');
  fight.encounter.rodChoice=chosen;
  for(let target=0;target<fight.opponents.length;target++)for(const effect of rods.effects[chosen]){
    if(fight.opponents[target][effect.attribute]!==null)addDestinyStatEffect(fight,target,effect.attribute,effect.amount,null,'rod-'+rods.direction);
  }
}

export function createLegionFight(hero,section,{roster,abilities={},equipment={},character=null,encounterOptions={},catalog=LEGION_ABILITIES,bookRules=LEGION_BOOK_RULES}={}){
  const preset=legionRosterFor(roster,section);
  const selection=preset.adapter.abilitySelection;
  if(selection){
    const chosen=encounterOptions[selection.option];
    if(!Array.isArray(chosen)||chosen.length!==selection.count||new Set(chosen).size!==chosen.length||chosen.some(name=>!Object.hasOwn(selection.definitions,name)))throw new RangeError('Choose the required number of distinct encounter abilities');
    catalog={...catalog,...structuredClone(selection.definitions)};
    abilities={...Object.fromEntries(Object.entries(abilities).filter(([name])=>catalog[name]?.quotaStatus)),...Object.fromEntries(chosen.map(name=>[name,1]))};
  }
  if(preset.parts.some(part=>part.role!=='opponent')&&!preset.adapter.allowComponents)throw new RangeError('This encounter needs its component adapter');
  const forms=preset.adapter.rules.roundForms;
  const opponents=preset.parts.filter(part=>part.role!=='hero proxy').map((source,index)=>{
    const part=forms?.target===index?{...source,...forms.profiles.find(form=>form.id===forms.initial).stats}:{...source};
    const mirror=preset.adapter.heroMirror;
    if(mirror?.target===index){
      for(const attribute of mirror.attributes)part[attribute]=hero[attribute]??0;
      part.damageStat=part.magic>part.brawn?'magic':'brawn';
    }
    const opponent={name:part.name,speed:part.speed,armour:part.armour,health:part.health,damageStat:part.damageStat};
    if(part.role!=='opponent')opponent.role=part.speed===null?'resource':part.role;
    for(const attribute of ['brawn','magic'])if(part[attribute]!==undefined)opponent[attribute]=part[attribute];
    return opponent;
  });
  let fight=configureDestinyAbilities(createDestinyFight(hero,opponents),abilities,equipment,{catalog,bookRules});
  if(character)fight=attachDestinyCharacter(fight,character);
  fight.encounter=destinyEncounterSettings(fight,preset,encounterOptions);
  const carried=fight.character?.pendingAbilityLosses;
  if(carried?.section===String(section)){
    for(const [name,count] of Object.entries(carried.abilities||{})){
      if(!Number.isSafeInteger(count)||count<0||count>(fight.abilities[name]||0))throw new RangeError('Invalid carried ability loss');
      fight.used[name]=count;
    }
    delete fight.character.pendingAbilityLosses;
  }else if(carried?.fromSection===String(section))delete fight.character.pendingAbilityLosses;
  if(preset.adapter.challengeResume){
    const settings=preset.adapter.challengeResume,rounds=encounterOptions[settings.roundsOption],used=encounterOptions[settings.usedOption];
    if(!Number.isSafeInteger(rounds)||rounds<0||rounds>=fight.encounter.lossAfterTotalRounds||!Array.isArray(used)||new Set(used).size!==used.length||used.some(name=>!fight.abilities[name]||catalog[name]?.quotaStatus))throw new RangeError('Enter the prior challenge rounds and used abilities');
    fight.encounter.consecutiveCombats.completedRounds=rounds;fight.encounter.abilityChallenge.used=[...used];
    for(const name of used)fight.used[name]=1;
  }
  if(selection){
    fight.encounter.selectedEncounterAbilities=[...encounterOptions[selection.option]];
    if(fight.abilityQuota)for(const name of fight.encounter.selectedEncounterAbilities)if(catalog[name].category==='pa'&&catalog[name].phases.length===0)fight=setDestinyPassiveActivation(fight,name,true);
  }
  for(const rule of preset.adapter.healthBonusesFromOptions||[]){
    const count=encounterOptions[rule.option]??fight.character?.sourceCounters?.[rule.fromCounter],opponent=fight.opponents[rule.target];
    if(!Number.isSafeInteger(count)||count<0||!Number.isSafeInteger(opponent.health+count*rule.amountPer)||opponent.health+count*rule.amountPer>1000000)throw new RangeError('Enter the previous encounter round count');
    opponent.health+=count*rule.amountPer;opponent.maxHealth=opponent.health;
    (fight.encounter.sourceCounters??={})[rule.option]=count;
  }
  for(const rule of preset.adapter.statBonusesFromOptions||[]){
    const count=encounterOptions[rule.option]??fight.character?.sourceCounters?.[rule.fromCounter];
    if(!Number.isSafeInteger(count)||count<0||count>1000000)throw new RangeError('Enter the previous encounter round count');
    const amount=Math.ceil(count/(rule.divisor||1))*rule.amountPer;
    if(!Number.isSafeInteger(amount)||Math.abs(amount)>1000000)throw new RangeError('Invalid encounter attribute bonus');
    addDestinyStatEffect(fight,rule.target,rule.attribute,amount,null,'encounter-context');
    (fight.encounter.sourceCounters??={})[rule.option]=count;
  }
  if(fight.encounter.initialOpponentHealth!==undefined){
    const health=fight.encounter.initialOpponentHealth;
    if(!Number.isSafeInteger(health)||health<1||health>1000000)throw new RangeError('Invalid initial opponent Health');
    for(const opponent of fight.opponents)opponent.health=opponent.maxHealth=health;
  }
  if(preset.adapter.attackAttributeOption){
    const attribute=encounterOptions[preset.adapter.attackAttributeOption];
    if(!['brawn','magic'].includes(attribute))throw new RangeError('Choose Brawn or Magic for this combat');
    fight.encounter.heroDamageStat=attribute;
  }
  for(const [resource,rule] of Object.entries(preset.adapter.resourceOptions||{})){
    const count=encounterOptions[rule.option]??fight.character?.sourceCounters?.[rule.fromCounter]??rule.default;
    if(!Number.isSafeInteger(count)||count<0||count>(rule.maximum??1000000))throw new RangeError('Invalid source consumable count');
    (fight.encounter.resources??={})[resource]=count;
  }
  for(const rule of fight.encounter.blockCategoriesForResource||[]){
    const count=fight.encounter.resources?.[rule.resource];
    if(!Number.isSafeInteger(count)||count<0)throw new RangeError('Enter the source counter for this encounter');
    fight.encounter.blockedRounds={from:1,until:count,categories:[...rule.categories]};
  }
  if(fight.encounter.restoreOnVictory!==undefined)fight.restoreOnVictory=fight.encounter.restoreOnVictory;
  fight.encounter.sourceSection=String(section);
  fight.encounter.implementation='complete';
  fight.encounter.persistHeroHealth=true;
  fight.encounter.recoverOnDefeat=true;
  const available=Object.entries(preset.adapter.itemOptions||{}).filter(([,option])=>encounterOptions[option]===true).map(([item])=>item);
  if(available.length)fight.encounter.availableItems=available;
  if(fight.encounter.initialHeroHealthLoss)fight.hero.health=Math.max(0,fight.hero.health-fight.encounter.initialHeroHealthLoss);
  for(const effect of fight.encounter.initialStats||[])fight.effects.push({kind:'stat',...effect,source:'encounter'});
  applyLegionContext(fight,preset,encounterOptions);
  if(forms)applyDestinyOpponentForm(fight,fight.encounter.roundForms.profiles.find(form=>form.id===forms.initial));
  if(fight.encounter.recoveryCheckpoint){
    fight.character??={};
    fight.character.combatRecovery={...fight.character.combatRecovery,armour:fight.hero.armour};
  }
  if (preset.adapter.heroRelay) {
    const settings=structuredClone(preset.adapter.heroRelay);
    const proxy=preset.parts.find(part=>part.role==='hero proxy');
    if(!proxy)throw new RangeError('Missing companion profile');
    const proxyHero=createDestinyFight({...proxy,armour:proxy.armour??0},opponents).hero;
    if(proxy.armour===null){proxyHero.armour=null;proxyHero.normal.armour=null;}
    if(encounterOptions.medic===true||character?.career==='medic'||abilities.mend){
      (settings.abilities??={}).mend=1;
    }
    beginDestinyHeroRelay(fight,proxyHero,settings);
  }
  settleDestinyFight(fight);
  return fight;
}

export {createLegionFight as createDestinyRosterFight};

export function useLegionAction(fight,action,{roster,...options}={},roll=()=>Math.floor(Math.random()*6)+1){
  if(fight?.status!=='active')throw new RangeError('No active encounter');
  if(Object.hasOwn(LEGION_CONSUMABLES,action))return useLegionConsumable(fight,action,options,roll);
  const settings=destinyEncounterAction(fight,legionRosterFor(roster,fight.encounter?.sourceSection),action);
  if(settings.kind==='pursuit-reroll')return rerollDestinyPursuit(fight,options.ability,options.dice,roll);
  const next=structuredClone(fight);
  if(settings.kind==='arcane-surge'){
    const pending=next.turn?.pendingAbility,rule=next.encounter.arcaneControl,amount=options.amount;
    if(next.phase!=='ability-rolled'||pending?.event?.kind!=='arcane-control'||!Number.isSafeInteger(amount)||amount<1||amount>destinyStat(next,'hero','magic'))throw new RangeError('Spend available Magic before accepting the challenge');
    addDestinyStatEffect(next,'hero','magic',-amount,null,rule.surgeName);pending.event.surgeBonus=(pending.event.surgeBonus||0)+amount;
    const damage=damageDestinyHero(next,amount*rule.healthPerMagic);next.history.push({type:'arcane-surge',round:next.round,amount,damage});return finishDestinyAbilityAction(next,roll);
  }
  if(settings.kind==='spend-ability-avoid-end-test'){
    const name=options.ability;
    if(next.phase!=='end'||next.turn.encounterEndPrepared||!next.encounter[settings.requiresFlag])throw new RangeError('Choose this avoidance before rolling the end hazard');
    if(!hasDestinyAbility(next,name)||next.abilityCatalog?.[name]?.category!==settings.category||(next.used[name]||0)>=(next.abilities[name]||0))throw new RangeError('Choose an unused ability of the required category');
    next.used[name]=(next.used[name]||0)+1;next.turn[settings.turnFlag]=true;
    next.history.push({type:'ability-sacrifice',name,source:action,round:next.round});return next;
  }
  if(settings.kind==='remove-parasite') {
    if(next.phase!=='damage'||next.turn.winner!=='hero'||next.turn.used.co)throw new RangeError('Spend an unused winning combat action to remove the leech');
    const parasite=next.encounter.scheduledParasites?.find(rule=>rule.active&&!rule.removed);
    if(!parasite)throw new RangeError('No leech is attached');
    parasite.active=false;parasite.removed=true;next.turn.used.co=true;next.turn.normalDamageReplaced=true;next.phase='end';
    next.history.push({type:'book-action',name:settings.name,round:next.round});return next;
  }
  if(settings.kind==='resource-reduce-once') {
    if(next.usedBookActions?.[action])throw new RangeError('This aid has already been used');
    next.encounter.resources[settings.resource]=Math.max(0,next.encounter.resources[settings.resource]-settings.amount);
    (next.usedBookActions??={})[action]=1;
    next.history.push({type:'book-action',name:settings.name,round:next.round});return next;
  }
  if(settings.kind==='weak-spot') {
    if(next.phase!=='damage'||next.turn.winner!=='hero'||new Set(next.turn.heroSpeedDice).size===next.turn.heroSpeedDice.length)
      throw new RangeError('Win with Speed doubles before choosing this attack');
    if(next.history.some(event=>event.type==='ability'&&event.round===next.round&&['mo','co'].includes(next.abilityCatalog?.[event.name]?.category)))
      throw new RangeError('This attack cannot follow a combat or modifier ability');
    next.turn.exclusiveScoreAttack=true;next.turn.ignoreArmour=true;
    next.history.push({type:'book-action',name:settings.name,round:next.round});return next;
  }
  if(settings.kind==='damage-component') {
    if(next.phase!=='damage'||next.turn.winner!=='hero')throw new RangeError('Replace a winning damage score with this action');
    if(!Number.isSafeInteger(settings.amount)||settings.amount<0||!next.opponents[settings.target]||next.opponents[settings.target].health<=0)throw new RangeError('Choose a living component');
    destinyStrike(next,settings.target,settings.amount,action,'book-action');
    next.turn.normalDamageReplaced=true;next.phase='end';
    next.history.push({type:'book-action',name:settings.name,round:next.round});settleDestinyFight(next,roll);return next;
  }
  if(settings.kind==='sacrifice-unused-for-stat'){
    if(next.phase!=='damage'||next.turn.winner!=='hero')throw new RangeError('Replace a winning damage score with this action');
    if(!destinyNeverUsedAbilities(next).includes(options.ability))throw new RangeError('Choose an ability never used in this combat');
    (next.encounter.sacrificedAbilities??=[]).push(options.ability);
    addDestinyStatEffect(next,settings.target??next.target,settings.attribute,settings.amount,null,action);
    next.turn.normalDamageReplaced=true;next.phase='end';
    next.history.push({type:'ability-sacrifice',round:next.round,name:options.ability,source:action});return next;
  }
  if(settings.requiresItem&&![...(next.character?.items||[]),...(next.encounter.availableItems||[])].includes(settings.requiresItem))throw new RangeError('The required source item is not available');
  if(settings.kind==='opponent-debuff'){
    if(next.phase!=='damage'||next.turn.winner!=='hero')throw new RangeError('Replace a winning damage score with this action');
    const target=settings.target??next.target;
    if(next.encounter.inactiveTargets?.includes(target)||next.opponents[target]?.health<=0)throw new RangeError('This opponent is not exposed');
    for(const attribute of settings.attributes)addDestinyStatEffect(next,target,attribute,-settings.amount,null,action);
    next.turn.normalDamageReplaced=true;next.phase='end';
    next.history.push({type:'book-action',name:settings.name,round:next.round});return next;
  }
  if(settings.kind==='companion-sequence'){
    if(next.phase!=='damage'||next.turn.winner!=='hero')throw new RangeError('Replace a winning damage score with this action');
    const prior=next.encounter.actionSequences?.[action];
    if(prior?.exhausted)throw new RangeError('The companion attack is exhausted');
    const index=prior?.round===next.round-1?prior.index+1:0;
    const dice=settings.dice[index];
    (next.encounter.actionSequences??={})[action]={round:next.round,index,exhausted:index===settings.dice.length-1};
    prepareDestinyDamage(next,action,{hit:'one',dice,replacement:true,damageKind:'companion'},options,roll);
    next.turn.normalDamageReplaced=true;if(next.phase!=='ability-rolled')next.phase='end';
    next.history.push({type:'book-action',name:settings.name,round:next.round,dice});return finishDestinyAbilityAction(next,roll);
  }
  if(settings.kind==='companion-sacrifice'){
    if(!['damage','damage-rolled'].includes(next.phase)||next.turn.winner!=='opponent'||!next.encounter[settings.flag])throw new RangeError('Choose an available companion before enemy damage');
    next.encounter[settings.flag]=false;next.turn.avoidDamage=true;next.turn.normalDamageReplaced=true;next.phase='end';
    next.history.push({type:'book-action',name:settings.name,round:next.round});return next;
  }
  if(settings.kind==='winning-stat-buff'){
    if(next.phase!=='damage'||next.turn.winner!=='hero')throw new RangeError('Replace a winning damage score with this action');
    if(settings.refresh)next.effects=next.effects.filter(effect=>effect.source!==action);
    for(const attribute of settings.attributes)addDestinyStatEffect(next,'hero',attribute,settings.amount,settings.duration,action,settings.delay||0);
    next.turn.normalDamageReplaced=true;next.phase='end';
    next.history.push({type:'book-action',name:settings.name,round:next.round});return next;
  }
  if(settings.kind==='winning-end-damage'){
    if(next.phase!=='damage'||next.turn.winner!=='hero')throw new RangeError('Replace a winning damage score with this action');
    if(next.usedBookActions?.[action])throw new RangeError('This effect is already applied');
    (next.usedBookActions??={})[action]=1;
    (next.encounter.endEffects??=[]).push({...structuredClone(settings.effect),source:action});
    next.turn.normalDamageReplaced=true;next.phase='end';
    next.history.push({type:'book-action',name:settings.name,round:next.round});return next;
  }
  if(settings.kind==='spend-stat-shield'){
    if(next.phase!=='end'||next.turn.suppressedEndEffects?.includes(settings.effectSource))throw new RangeError('Use this shield once before the round ends');
    if(destinyStat(next,'hero',settings.attribute)<settings.cost)throw new RangeError('Not enough Magic for this shield');
    addDestinyStatEffect(next,'hero',settings.attribute,-settings.cost,null,action);
    (next.turn.suppressedEndEffects??=[]).push(settings.effectSource);
    if(destinyStat(next,'hero',settings.attribute)===0)next.encounter.forcedLoss=true;
    next.history.push({type:'book-action',name:settings.name,round:next.round});settleDestinyFight(next);return next;
  }
  if(settings.kind==='heal-per-round') {
    if(next.phase!=='end'||next.round<settings.fromRound||next.round>settings.untilRound)throw new RangeError('This healing is unavailable in this combat round');
    if(next.turn.usedBookActions?.includes(action))throw new RangeError('This healing has already been used this round');
    healDestinyHero(next,settings.amount);(next.turn.usedBookActions??=[]).push(action);
    next.history.push({type:'book-action',name:settings.name,round:next.round});return next;
  }
  if(settings.kind==='heal-once'){
    if(settings.requiresFlag&&!next.encounter[settings.requiresFlag])throw new RangeError('This ally is not available');
    if(next.usedBookActions?.[action])throw new RangeError('This healing has already been used');
    if(settings.chooseAttribute&&!settings.chooseAttribute.includes(options.attribute))throw new RangeError('Choose an allowed attribute');
    healDestinyHero(next,settings.amount);(next.usedBookActions??={})[action]=1;
    if(settings.chooseAttribute)addDestinyStatEffect(next,'hero',options.attribute,settings.attributeAmount,settings.duration,action);
    next.history.push({type:'book-action',name:settings.name,round:next.round});return next;
  }
  if(settings.kind==='retreat'&&fight.encounter.retreatSection){
    next.status='retreat';next.phase='finished';if(next.turn)delete next.turn.pendingAbility;
    next.history.push({type:'outcome',round:next.round,status:'retreat',section:next.encounter.retreatSection});
    return next;
  }
  if(settings.kind==='enter-stomach'){
    if(next.phase!=='damage'||next.turn.winner!=='hero'||next.turn.enteredStomach)throw new RangeError('Choose the stomach once after winning a round, before rolling damage');
    next.hero.health=Math.max(0,next.hero.health-settings.healthCost);next.turn.ignoreArmour=true;next.turn.enteredStomach=true;
    next.history.push({type:'book-action',name:settings.name,round:next.round,damage:settings.healthCost});
    settleDestinyFight(next);return next;
  }
  if(settings.kind==='reduce-armour'){
    if(next.phase!=='damage'||next.turn.winner!=='hero')throw new RangeError('Replace a winning damage score with this action');
    if(settings.requiresFlag&&!next.encounter[settings.requiresFlag])throw new RangeError('This action is not available yet');
    if(settings.requirePositive&&destinyStat(next,next.target,'armour')<=0)throw new RangeError('No armour remains to reduce');
    addDestinyStatEffect(next,next.target,'armour',-settings.amount,null,action);next.turn.normalDamageReplaced=true;next.phase='end';
    if(settings.healthCost)damageDestinyHero(next,settings.healthCost);
    (next.usedBookActions??={})[action]=(next.usedBookActions?.[action]||0)+1;
    next.history.push({type:'book-action',name:settings.name,round:next.round});settleDestinyFight(next);return next;
  }
  if(settings.kind==='reset-armour'){
    if(next.phase!=='damage'||next.turn.winner!=='hero')throw new RangeError('Replace a winning damage score with this action');
    next.opponents[next.target].armour=settings.value??next.opponents[next.target].normal.armour;
    next.turn.normalDamageReplaced=true;next.phase='end';
    next.history.push({type:'book-action',name:settings.name,round:next.round});return next;
  }
  if(settings.kind==='clear-resource'){
    if(next.phase!=='damage'||next.turn.winner!=='hero')throw new RangeError('Replace a winning damage score with this action');
    if(!Number.isSafeInteger(next.encounter.resources?.[settings.resource]))throw new RangeError('Missing encounter resource');
    next.encounter.resources[settings.resource]=0;next.turn.normalDamageReplaced=true;next.phase='end';
    next.history.push({type:'book-action',name:settings.name,round:next.round});return next;
  }
  if(settings.kind==='spend-resource-strike'){
    if(next.phase!=='damage'||next.turn.winner!=='hero')throw new RangeError('Replace a winning damage score with this action');
    if(!(next.encounter.resources?.[settings.resource]>0))throw new RangeError('No source consumables remain');
    next.encounter.resources[settings.resource]--;
    destinyStrike(next,next.target,settings.damage,action,'fixed-ability');
    if(settings.armourReduction)addDestinyStatEffect(next,next.target,'armour',-settings.armourReduction,null,action);
    next.turn.normalDamageReplaced=true;next.phase='end';
    next.history.push({type:'book-action',name:settings.name,round:next.round});settleDestinyFight(next,roll);return next;
  }
  if(settings.kind==='spend-resource-debuff'){
    if(next.phase!=='damage'||next.turn.winner!=='hero')throw new RangeError('Replace a winning damage score with this action');
    if(!(next.encounter.resources?.[settings.resource]>0))throw new RangeError('No source objects remain');
    for(const attribute of settings.attributes)addDestinyStatEffect(next,settings.target,attribute,-settings.amount,null,action);
    next.encounter.resources[settings.resource]--;next.turn.normalDamageReplaced=true;next.phase='end';
    next.history.push({type:'book-action',name:settings.name,round:next.round});return next;
  }
  if(settings.kind!=='rune')throw new RangeError('Unknown encounter action');
  if(![...(next.character?.items||[]),...(next.encounter.availableItems||[])].includes(settings.item))throw new RangeError('You do not have this rune');
  if(next.usedBookActions?.[action])throw new RangeError('This rune has already been used');
  if(settings.replaceDamage&&(next.phase!=='damage'||next.turn.winner!=='hero'))throw new RangeError('Use this rune instead of a winning damage score');
  if(settings.attribute)addDestinyStatEffect(next,'hero',settings.attribute,settings.amount,null,action);
  if(settings.fullHeal)healDestinyHero(next,next.hero.maxHealth);
  if(settings.damage){destinyStrike(next,next.target,settings.damage,action,'fixed-ability');next.turn.normalDamageReplaced=true;next.phase='end';}
  (next.usedBookActions??={})[action]=1;
  next.history.push({type:'book-action',name:settings.name,round:next.round});
  settleDestinyFight(next);
  return next;
}


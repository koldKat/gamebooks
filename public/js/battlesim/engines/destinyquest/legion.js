// Legion encounter profiles and exceptions are loaded from book_enemies. This
// factory contains no roster names, stats or section-specific rule branches.
import {createDestinyFight,settleDestinyFight} from './core.js';
import {configureDestinyAbilities} from './abilities.js';
import {attachDestinyCharacter} from './character.js';
import {destinyEncounterSettings,destinyEncounterAction} from './encounter-settings.js';
import {LEGION_ABILITIES} from './legion-abilities.js';
import {destinyStrike,addDestinyStatEffect,healDestinyHero,destinyStat} from './effects.js';
import {beginDestinyHeroRelay} from './hero-relay.js';
import {applyDestinyOpponentForm} from './round-events.js';
import {LEGION_CONSUMABLES,useLegionConsumable} from './legion-consumables.js';

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

export function createLegionFight(hero,section,{roster,abilities={},equipment={},character=null,encounterOptions={}}={}){
  const preset=legionRosterFor(roster,section);
  if(preset.parts.some(part=>part.role!=='opponent')&&!preset.adapter.allowComponents)throw new RangeError('This encounter needs its component adapter');
  const forms=preset.adapter.rules.roundForms;
  const opponents=preset.parts.filter(part=>part.role!=='hero proxy').map((source,index)=>{
    const part=forms?.target===index?{...source,...forms.profiles.find(form=>form.id===forms.initial).stats}:source;
    const opponent={name:part.name,speed:part.speed,armour:part.armour,health:part.health,damageStat:part.damageStat};
    if(part.role!=='opponent')opponent.role=part.speed===null?'resource':part.role;
    for(const attribute of ['brawn','magic'])if(part[attribute]!==undefined)opponent[attribute]=part[attribute];
    return opponent;
  });
  let fight=configureDestinyAbilities(createDestinyFight(hero,opponents),abilities,equipment,{catalog:LEGION_ABILITIES,bookRules:LEGION_BOOK_RULES});
  if(character)fight=attachDestinyCharacter(fight,character);
  fight.encounter=destinyEncounterSettings(fight,preset,encounterOptions);
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

export function useLegionAction(fight,action,{roster,...options}={},roll=()=>Math.floor(Math.random()*6)+1){
  if(fight?.status!=='active')throw new RangeError('No active encounter');
  if(Object.hasOwn(LEGION_CONSUMABLES,action))return useLegionConsumable(fight,action,options,roll);
  const settings=destinyEncounterAction(fight,legionRosterFor(roster,fight.encounter?.sourceSection),action);
  const next=structuredClone(fight);
  if(settings.kind==='spend-stat-shield'){
    if(next.phase!=='end'||next.turn.suppressedEndEffects?.includes(settings.effectSource))throw new RangeError('Use this shield once before the round ends');
    if(destinyStat(next,'hero',settings.attribute)<settings.cost)throw new RangeError('Not enough Magic for this shield');
    addDestinyStatEffect(next,'hero',settings.attribute,-settings.cost,null,action);
    (next.turn.suppressedEndEffects??=[]).push(settings.effectSource);
    if(destinyStat(next,'hero',settings.attribute)===0)next.encounter.forcedLoss=true;
    next.history.push({type:'book-action',name:settings.name,round:next.round});settleDestinyFight(next);return next;
  }
  if(settings.kind==='heal-once'){
    if(settings.requiresFlag&&!next.encounter[settings.requiresFlag])throw new RangeError('This ally is not available');
    if(next.usedBookActions?.[action])throw new RangeError('This healing has already been used');
    healDestinyHero(next,settings.amount);(next.usedBookActions??={})[action]=1;
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
    addDestinyStatEffect(next,next.target,'armour',-settings.amount,null,action);next.turn.normalDamageReplaced=true;next.phase='end';
    (next.usedBookActions??={})[action]=(next.usedBookActions?.[action]||0)+1;
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


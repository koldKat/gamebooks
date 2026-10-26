import {destinyDieLocked,destinyRollOpponentDice,applyDestinyHeroRoll,onDestinyHeroDice,destinyStat,destinyAttackerTarget,hasDestinyAbility,destinyScoreExtraDice} from './effects.js';
import {destinyDie} from './damage.js';
import {markDestinyScoreDice} from './score-immunity.js';
import {destinyOpponentSpeedResult} from './effects.js';

const index=(values,i)=>{
  if(!Array.isArray(values)||!Number.isInteger(i)||i<0||i>=values.length)throw new RangeError('Choose an available die');
  return i;
};

// A persistent modifier permits one accepted reroll per selected score die.
// It never rerolls an opponent's score or a replacement ability's damage dice.
export function rerollDestinyScoreDice(fight,selected,roll){
  if(fight?.status!=='active'||fight.phase!=='damage-rolled'||fight.turn.winner!=='hero'||!fight.scoreRerollAbility||!hasDestinyAbility(fight,fight.scoreRerollAbility))throw new RangeError('Score rerolls are unavailable');
  if(!Array.isArray(selected)||!selected.length||new Set(selected).size!==selected.length)throw new RangeError('Choose score dice to reroll');
  for(const i of selected){index(fight.turn.damageDice,i);if(destinyDieLocked(fight,'hero','damage',i))throw new RangeError('Accepted or saved dice cannot be rerolled');}
  const next=structuredClone(fight),fresh=applyDestinyHeroRoll(next,selected.map(()=>destinyDie(roll)),'damage');
  selected.forEach((i,j)=>next.turn.damageDice[i]=fresh[j]);
  next.turn.damageDice.push(...destinyScoreExtraDice(next,fresh,roll));
  next.turn.lockedDamageDice=[...new Set([...(next.turn.lockedDamageDice||[]),...selected])];
  onDestinyHeroDice(next,next.turn.damageDice);
  next.history.push({type:'score-reroll',round:next.round,name:next.scoreRerollAbility,indices:[...selected],dice:[...fresh]});
  return next;
}

// Runs on the action's private copy. Changing a face does not invent a new roll
// or retrigger passive effects which explicitly require rolling a die.
export function validateDestinyCatalogDice(fight,spec){
  if(fight.encounter?.immutableOpponentDiceTargets?.includes(destinyAttackerTarget(fight))&&
      (spec.opponentSpeedDieReduction||spec.opponentSpeedDiceReduction||spec.fewerOpponentDice||spec.opponentDamageFaceMap||spec.rerollOpponentDamageFaces))
    throw new RangeError('Abilities cannot change this opponent dice');
  if(spec.pendingRollBonus&&(fight.turn.pendingAbility?.type!=='catalog-table'||fight.turn.pendingAbility.name!==spec.pendingRollBonus.ability))throw new RangeError('Use this modifier with its matching ability roll');
  if(!spec.requiresLosingSpeedDoubles)return;
  const values=fight.turn.heroSpeedDice;
  const own=values.reduce((sum,face)=>sum+face,0)+destinyStat(fight,'hero','speed')+(fight.turn.heroSpeedResultBonus||0);
  const enemy=destinyOpponentSpeedResult(fight);
  if(values.length<2||new Set(values).size===values.length||own>=enemy)throw new RangeError('Requires losing Speed doubles');
}

export function applyDestinyCatalogDice(fight,name,spec,options,roll){
  if(spec.scoreDieFromSpeed) {
    const from=index(fight.turn.heroSpeedDice,options.speedDie),to=index(fight.turn.damageDice,options.die);
    if(destinyDieLocked(fight,'hero','damage',to)) throw new RangeError('Saved dice cannot be changed');
    fight.turn.damageDice[to]=fight.turn.heroSpeedDice[from];
  }
  if(spec.pendingRollBonus)fight.turn.pendingAbility.resultBonus=(fight.turn.pendingAbility.resultBonus||0)+spec.pendingRollBonus.amount;
  if(spec.heroDieFace){
    let values,kind='damage',pending=false;
    if(fight.phase==='speed-rolled'){values=fight.turn.heroSpeedDice;kind='speed';}
    else if(fight.phase==='damage-rolled'){
      if(fight.turn.winner!=='hero')throw new RangeError('Choose a hero die');
      values=fight.turn.damageDice;
    }else if(fight.phase==='ability-rolled'){
      const current=fight.turn.pendingAbility;
      if(current.event?.owner==='opponent'||current.spec?.unmodified)throw new RangeError('Choose a modifiable hero die');
      if(current.type==='damage'){
        const group=options.group??0;index(current.groups,group);values=current.groups[group].dice;
      }else values=current.dice;
      pending=true;
    }
    const i=index(values,options.die);
    if(!pending&&destinyDieLocked(fight,'hero',kind,i))throw new RangeError('Saved dice cannot be changed');
    values[i]=spec.heroDieFace;
  }
  if(spec.heroSpeedFaceMap){
    const values=fight.turn.heroSpeedDice,change=spec.heroSpeedFaceMap;
    const selected=options.dice??values.map((face,i)=>face===change.from?i:-1).filter(i=>i>=0);
    if(!Array.isArray(selected)||!selected.length||new Set(selected).size!==selected.length)throw new RangeError('Choose matching Speed dice');
    for(const i of selected){index(values,i);if(values[i]!==change.from||destinyDieLocked(fight,'hero','speed',i))throw new RangeError('Choose unlocked matching Speed dice');}
    for(const i of selected)values[i]=change.to;
  }
  if(spec.opponentDamageFaceMap||spec.rerollOpponentDamageFaces){
    if(fight.turn.winner!=='opponent')throw new RangeError('Choose an opponent damage roll');
    const values=fight.turn.damageDice,faces=spec.rerollOpponentDamageFaces||[spec.opponentDamageFaceMap.from];
    const selected=values.map((face,i)=>faces.includes(face)?i:-1).filter(i=>i>=0);
    if(!selected.length)throw new RangeError('The opponent has no matching damage dice');
    if(spec.opponentDamageFaceMap)for(const i of selected)values[i]=spec.opponentDamageFaceMap.to;
    else{
      const fresh=destinyRollOpponentDice(fight,selected.length,roll,'damage');
      selected.forEach((i,j)=>values[i]=fresh[j]);values.push(...fresh.slice(selected.length));
    }
    const healing=(fight.encounter?.damageFaceTriggers||[]).filter(rule=>rule.target===destinyAttackerTarget(fight)&&values.some(face=>rule.faces.includes(face))).reduce((sum,rule)=>sum+(rule.healOnHealthHit||0),0);
    if(healing)fight.turn.faceTriggeredHealing=healing;else delete fight.turn.faceTriggeredHealing;
  }
  if(spec.opponentSpeedDieReduction) {
    const values=fight.turn.opponentSpeedDice;
    if(!Array.isArray(values)||values.some((_,i)=>destinyDieLocked(fight,'opponent','speed',i))) throw new RangeError('Saved dice cannot be changed');
    fight.turn.opponentSpeedDice=values.map(face=>Math.max(1,face-spec.opponentSpeedDieReduction));
  }
  if(spec.useHeroSpeedDiceForDamage){
    const speed=fight.turn.heroSpeedDice;
    const selected=spec.useHeroSpeedDiceForDamage==='one'?[index(speed,options.die)]:speed.map((_,i)=>i);
    if(!selected.length)throw new RangeError('No hero Speed dice are available');
    fight.turn.damageDice=selected.map(i=>speed[i]);
    fight.turn.lockedDamageDice=selected.map((i,j)=>spec.lockCopiedSpeedDice||destinyDieLocked(fight,'hero','speed',i)?j:-1).filter(i=>i>=0);
    fight.turn.damageFromSpeedDiceCount=selected.length;
    const extra=applyDestinyHeroRoll(fight,Array.from({length:fight.turn.extraDamageDice||0},()=>destinyDie(roll)),'damage');
    fight.turn.damageDice.push(...extra);if(extra.length)onDestinyHeroDice(fight,fight.turn.damageDice);
    markDestinyScoreDice(fight,fight.turn.damageDice.length);
    fight.turn.damageUsesBrawn=true;fight.phase='damage-rolled';
  }
  if(spec.opponentSpeedResultBonus)fight.turn.opponentSpeedBonus=(fight.turn.opponentSpeedBonus||0)+spec.opponentSpeedResultBonus;
}

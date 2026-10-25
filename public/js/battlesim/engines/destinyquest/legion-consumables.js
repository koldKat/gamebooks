// Combat-use counters only. These never create or consume universal inventory.
import {addDestinyStatEffect,destinyStrike,isDestinyOpponentActive} from './effects.js';
import {prepareDestinyDamage} from './damage.js';
import {settleDestinyFight} from './core.js';

export const LEGION_MUSHROOMS=Object.freeze({
  glittercap:'magic',
  marshstick:'speed',
});

export const LEGION_CONSUMABLES=Object.freeze({
  glittercap:{kind:'mushroom'},marshstick:{kind:'mushroom'},
  'arthurian-horn':{kind:'strike'},'oil-flask':{kind:'damage-replacement'},
  'portable-shield':{kind:'shield'},'stink-bomb':{kind:'slow'},'spirit-tincture':{kind:'stat-cost'},
});

export function useLegionMushroom(fight,name){
  if(!Object.hasOwn(LEGION_MUSHROOMS,name))throw new RangeError('Choose a mushroom effect');
  return useLegionConsumable(fight,name);
}

export function useLegionConsumable(fight,name,options={},roll=()=>Math.floor(Math.random()*6)+1){
  const spec=LEGION_CONSUMABLES[name];
  if(!Object.hasOwn(LEGION_CONSUMABLES,name))throw new RangeError('Choose a combat effect');
  if(fight?.status!=='active'||fight.encounter?.disableBackpack||!fight.turn||fight.turn.used.backpack||
    !['speed','speed-rolled','damage','damage-rolled','ability-rolled','end','death-move'].includes(fight.phase))throw new RangeError('A backpack effect is unavailable this round');
  const uses=fight.character?.combatConsumables?.[name];
  if(!Number.isSafeInteger(uses)||uses<1)throw new RangeError('No uses of this effect remain');
  if(spec.kind==='mushroom'&&fight.used['consumable:'+name])throw new RangeError('Use each mushroom only once per combat');
  const target=options.target??fight.target;
  if(['strike','damage-replacement','slow'].includes(spec.kind)&&(!Number.isInteger(target)||!isDestinyOpponentActive(fight,target)))throw new RangeError('Choose a living opponent');
  if(spec.kind==='damage-replacement'&&(fight.phase!=='damage'||fight.turn.winner!=='hero'))throw new RangeError('Use oil instead of rolling a winning damage score');
  if(spec.kind==='slow'&&fight.phase!=='speed')throw new RangeError('Use a stink bomb at the start of the round before rolling Speed');
  if(spec.kind==='stat-cost'&&!['brawn','magic'].includes(options.attribute))throw new RangeError('Choose Brawn or Magic');
  if(spec.kind==='shield'&&fight.portableShieldHealth>0)throw new RangeError('The portable shield is already active');
  const next=structuredClone(fight);
  if(spec.kind==='mushroom'){
    addDestinyStatEffect(next,'hero',LEGION_MUSHROOMS[name],3,2,name);
    addDestinyStatEffect(next,'hero',LEGION_MUSHROOMS[name],-1,null,name,2);
  }else if(spec.kind==='strike')destinyStrike(next,target,20,name,'fixed-ability');
  else if(spec.kind==='damage-replacement'){
    prepareDestinyDamage(next,name,{dice:2,hit:'one'},{target},roll);
    next.turn.normalDamageReplaced=true;
    next.phase='end';
  }else if(spec.kind==='shield')next.portableShieldHealth=10;
  else if(spec.kind==='slow')addDestinyStatEffect(next,target,'speed',-2,1,name);
  else if(spec.kind==='stat-cost'){
    next.hero.health=Math.max(0,next.hero.health-4);
    addDestinyStatEffect(next,'hero',options.attribute,2,null,name);
  }
  next.character.combatConsumables[name]--;
  next.used['consumable:'+name]=true;
  next.turn.used.backpack=true;
  next.history.push({type:'backpack',name,round:next.round});
  settleDestinyFight(next,roll);
  return next;
}

import {settleDestinyFight,resolveDestinyDamage} from './core.js';

const fields=['itemId','qty','label','note','visible'];
const info=entry=>typeof entry==='number'?{itemId:entry,qty:1}:entry;
const same=(entry,saved)=>fields.every(key=>entry?.[key]===saved?.[key]);

// These short-lived choices reference the current shared run, never a book's
// simulator inventory. Panels discard them on close or after a successful save.
export function captureDestinyItemChoices(run){
  if(!run)return [];
  const choices=[];
  const add=(source,key,entry,collection)=>{
    const value=info(entry);if(!Number.isSafeInteger(value?.itemId)||value.itemId<1)return;
    choices.push({source,key,entry,collection,run,saved:{...value},itemId:value.itemId,label:value.label||'',quantity:value.qty??1});
  };
  for(const [key,entry] of (run.inventory||[]).entries())if(entry!=null)add('inventory',key,entry,run.inventory);
  for(const [key,entry] of Object.entries(run.equipment||{}))if(entry!=null)add('equipment',key,entry,run.equipment);
  return choices;
}

export function planDestinyItemLoss(run,choice){
  if(!run)return null;
  if(choice===null)return captureDestinyItemChoices(run).length?null:{patch:{},receipt:{source:'none',reason:'no-items'}};
  if(choice?.run!==run||!['inventory','equipment'].includes(choice.source))return null;
  const collection=run[choice.source],entry=collection?.[choice.key],value=info(entry);
  if(collection!==choice.collection||entry!==choice.entry||!same(value,choice.saved)||!Number.isSafeInteger(value?.qty??1)||(value.qty??1)<1)return null;
  const qty=value.qty??1,patch={};
  if(choice.source==='inventory'){
    patch.inventory=[...run.inventory];
    if(qty>1)patch.inventory[choice.key]={...entry,qty:qty-1};else patch.inventory.splice(choice.key,1);
  }else{
    patch.equipment={...run.equipment};
    if(qty>1)patch.equipment[choice.key]={...entry,qty:qty-1};else{
      delete patch.equipment[choice.key];
      if(run.equipmentVisible){patch.equipmentVisible={...run.equipmentVisible};delete patch.equipmentVisible[choice.key];}
    }
  }
  return {patch,receipt:{source:choice.source,key:choice.key,itemId:value.itemId,label:value.label||'',quantity:1}};
}

const attributes=['speed','brawn','magic','armour','health'];
function subtractStats(target,losses){
  if(!target)return;
  for(const attribute of attributes)if(typeof target[attribute]==='number')target[attribute]=Math.max(0,target[attribute]-(losses[attribute]||0));
  if(typeof target.maxHealth==='number')target.maxHealth=Math.max(0,target.maxHealth-(losses.health||0));
}

export function resolveDestinyItemLoss(fight,receipt,{statLosses={},lostAbilities={}}={},roll){
  if(fight?.status!=='active'||fight.phase!=='ability-choice'||fight.turn?.pendingAbility?.type!=='shared-item-loss')throw new RangeError('No shared item loss is pending');
  if(!receipt||!['inventory','equipment','none'].includes(receipt.source)||receipt.source==='none'&&receipt.reason!=='no-items'||receipt.source!=='none'&&(!Number.isSafeInteger(receipt.itemId)||receipt.itemId<1||receipt.quantity!==1))throw new RangeError('Choose a removed shared item');
  for(const [name,amount] of Object.entries(statLosses))if(!attributes.includes(name)||!Number.isSafeInteger(amount)||amount<0||amount>1000000)throw new RangeError('Enter valid lost stat modifiers');
  for(const [name,count] of Object.entries(lostAbilities))if(!Object.hasOwn(fight.abilities,name)||!Number.isSafeInteger(count)||count<0||count>fight.abilities[name])throw new RangeError('Choose valid lost ability copies');
  if(receipt.source==='none'&&(Object.values(statLosses).some(Boolean)||Object.values(lostAbilities).some(Boolean)))throw new RangeError('No item was removed');
  const next=structuredClone(fight),pending=next.turn.pendingAbility;
  delete next.turn.pendingAbility;next.phase=pending.returnPhase;next.turn.sharedItemLossResolved=true;
  subtractStats(next.hero,statLosses);subtractStats(next.hero.normal,statLosses);
  if(next.character){subtractStats(next.character.attributes,statLosses);for(const [name,count] of Object.entries(lostAbilities))if(next.character.abilities?.[name])next.character.abilities[name]=Math.max(0,next.character.abilities[name]-count);}
  for(const [name,count] of Object.entries(lostAbilities))next.abilities[name]-=count;
  next.history.push({type:'shared-item-loss',round:next.round,item:structuredClone(receipt),statLosses:structuredClone(statLosses),lostAbilities:structuredClone(lostAbilities)});
  settleDestinyFight(next,roll);
  return next.status==='active'&&next.phase===pending.returnPhase?resolveDestinyDamage(next,roll):next;
}

export function applyDestinyItemLossToSetup(setup,options={}){
  subtractStats(setup.hero,options.statLosses||{});
  for(const [name,count] of Object.entries(options.lostAbilities||{}))if(setup.abilities?.[name])setup.abilities[name]=Math.max(0,setup.abilities[name]-count);
}

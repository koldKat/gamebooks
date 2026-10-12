import {changeUrowenExperience} from './core.js';
const clone=value=>structuredClone(value);
export function recoverUrowenDefeat(state,{penalty='experience',armorLocation=6,item='net',potionIndex=0}={}) {
  if(state.fight?.status!=='loss')throw new RangeError('No defeated encounter');
  const next=clone(state);
  if(penalty==='experience')next.character=changeUrowenExperience(next.character,-1);
  else if(penalty==='armor') {
    if(![1,2,3,4,5,6].includes(armorLocation)||next.character.armor[armorLocation-1]<=0)throw new RangeError('No armour to damage');
    const indices=[2,3,4].includes(armorLocation)?[1,2,3]:[armorLocation-1];
    for(const index of indices) {
      next.character.armor[index]=Math.max(0,next.character.armor[index]-1);
      if(next.temporary)next.temporary.player.armor[index]=Math.max(0,next.temporary.player.armor[index]-1);
    }
  } else if(penalty==='item') {
    if(item==='net') {
      if(!next.character.net)throw new RangeError('No net to discard');
      next.character.net=false;if(next.temporary)next.temporary.player.net=false;
    } else if(item==='potion') {
      if(!Number.isInteger(potionIndex)||potionIndex<0||!next.character.potions?.[potionIndex]||next.character.potions[potionIndex].quantity<1)throw new RangeError('No potion to discard');
      next.character.potions[potionIndex].quantity--;
    } else throw new RangeError('Unknown tracked bag item');
  } else throw new RangeError('Choose the printed defeat consequence');
  next.character.life=next.character.maxLife;
  if(next.temporary)next.temporary.player.life=next.temporary.player.maxLife;
  next.fight=null;
  return next;
}

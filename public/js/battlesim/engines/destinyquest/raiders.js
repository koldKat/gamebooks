import {createDestinyRosterFight} from './legion.js';
import {RAIDERS_ABILITIES} from './raiders-abilities.js';
import {attachDestinyPet} from './pets.js';

export const RAIDERS_BOOK_RULES=Object.freeze({deathMoves:false,deathPenalties:false});
export const getRaidersPetCatalog=roster=>roster.find(entry=>entry.petCatalog)?.petCatalog||[];
export function createRaidersFight(hero,section,options={}){
  return createDestinyRosterFight(hero,section,{...options,catalog:RAIDERS_ABILITIES,bookRules:RAIDERS_BOOK_RULES});
}
export function prepareRaidersFight(fight,setup,{roster=[]}={}){
  let next=structuredClone(fight);next.encounter??={};next.encounter.sourceBookId=1288;
  next.encounter.carryHeroAttributes=next.restoreOnVictory===false;
  next.encounter.carryCompanion=true;
  const chosen=setup.pet;if(!chosen?.id)return next;
  const source=chosen.id==='custom'?chosen:getRaidersPetCatalog(roster).find(pet=>pet.id===chosen.id);
  if(!source)throw new RangeError('Choose a pet from the loaded source catalog');
  const pet={...source,...Object.fromEntries(['armour','health','maxHealth'].filter(key=>chosen[key]!==undefined).map(key=>[key,chosen[key]])),
    [source.damageStat]:chosen.power??source[source.damageStat],abilities:[...source.abilities]};
  next=attachDestinyPet(next,pet,{stance:chosen.stance||'passive',target:chosen.target??0});
  for(const name of pet.abilities)if(next.abilityCatalog[name]?.phases.length)next.abilities[name]=Math.max(1,next.abilities[name]||0);
  if(chosen.carriedHealth!==undefined){
    if(!Number.isSafeInteger(chosen.carriedHealth)||chosen.carriedHealth<0)throw new RangeError('Invalid carried pet Health');
    next.pet.health=Math.min(next.pet.maxHealth,chosen.carriedHealth);
  }
  return next;
}

import {loadDestinyRoster} from '../../engines/destinyquest/winters-fury-roster.js';
import {LEGION_ABILITIES} from '../../engines/destinyquest/legion-abilities.js';
import {LEGION_BOOK_RULES} from '../../engines/destinyquest/legion.js';

export const definition=Object.freeze({id:1286,title:'The Legion of Shadow',family:'destinyquest',stateKey:'sim1286',i18nPrefix:'battlesim1286',
  defaultHero:Object.freeze({speed:0,brawn:0,magic:0,armour:0,health:30,maxHealth:30}),
  equipmentSlots:Object.freeze(['mainHand','leftHand','feet','head','chest','cloak','gloves','talisman','necklace','ring1','ring2']),
  equipmentStats:Object.freeze(['speed','brawn','magic','armour','health']),showSynsHeart:false,
  abilityCatalog:LEGION_ABILITIES,bookRules:LEGION_BOOK_RULES});
let roster,pending;
export const getRoster=()=>roster||[];
export function loadRoster(fetcher){
  if(roster)return Promise.resolve(roster);
  if(!pending)pending=loadDestinyRoster(definition.id,fetcher).then(value=>roster=value).finally(()=>{pending=null;});
  return pending;
}

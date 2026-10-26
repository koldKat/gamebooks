import {loadDestinyRoster} from '../../engines/destinyquest/winters-fury-roster.js';
import {RAIDERS_ABILITIES} from '../../engines/destinyquest/raiders-abilities.js';
import {RAIDERS_BOOK_RULES} from '../../engines/destinyquest/raiders.js';

export const definition=Object.freeze({id:1288,title:'The Raiders of Dune Sea',family:'destinyquest',stateKey:'sim1288',i18nPrefix:'battlesim1288',
  defaultHero:Object.freeze({speed:0,brawn:0,magic:0,armour:0,health:30,maxHealth:30}),
  equipmentSlots:Object.freeze(['mainHand','leftHand','feet','head','chest','cloak','gloves','talisman','necklace','ring1','ring2']),
  equipmentStats:Object.freeze(['speed','brawn','magic','armour','health']),showSynsHeart:false,allowTeam:false,
  equipmentTypes:Object.freeze(['','axe','sword','dagger','spear','mace','hammer','bow','crossbow','shield','horn','totem','grapple','staff','wand','fist','fist weapon','spell book','snake','pistol','club','cleaver','whip','doll']),
  abilityCatalog:RAIDERS_ABILITIES,bookRules:RAIDERS_BOOK_RULES});
let roster,pending;
export const getRoster=()=>roster||[];
export function loadRoster(fetcher){
  if(roster)return Promise.resolve(roster);
  if(!pending)pending=loadDestinyRoster(definition.id,fetcher).then(value=>roster=value).finally(()=>{pending=null;});
  return pending;
}

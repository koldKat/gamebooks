import {loadDestinyRoster} from '../../engines/destinyquest/winters-fury-roster.js';

export const definition = Object.freeze({id:1285, title:"The Eye of Winter's Fury", family:'destinyquest', stateKey:'sim1285', i18nPrefix:'battlesim1285',
  defaultHero:Object.freeze({speed:0,brawn:0,magic:0,armour:0,health:30,maxHealth:30}),
  equipmentSlots:Object.freeze(['mainHand','leftHand','feet','head','chest','cloak','gloves','talisman','necklace','ring1','ring2','transport'])});
let roster, pending;
export const getRoster = () => roster || [];
export function loadRoster(fetcher) {
  if (roster) return Promise.resolve(roster);
  if (!pending) pending = loadDestinyRoster(definition.id, fetcher).then(value => roster = value).finally(() => {pending = null;});
  return pending;
}

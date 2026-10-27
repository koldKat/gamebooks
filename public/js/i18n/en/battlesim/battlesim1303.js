import shared from './battlesim1291.js';
const labels=Object.fromEntries(Object.entries(shared).map(([key,value])=>[key.replace(/^battlesim1291\./,'battlesim1303.'),value.replaceAll('Robinton','Alex')]));
Object.assign(labels,Object.fromEntries(Object.entries({
  shot:'Shot at {name}: {dice} = {total}; {result}.',
  targetRoll:'{name}: target roll {dice}, aiming at {recipient}.',
  allyHits:'{name}: {n} hits taken.',
  allyHitLimit:'{name}: {n}/{max} hits',
  weaponChoice:'Entry',
  noHeroAttack:'Follow this encounter’s printed shooting or dodge sequence. No weapon damage is rolled.',
}).map(([key,value])=>['battlesim1303.'+key,value])));
export default labels;

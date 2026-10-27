import shared from './battlesim1291.js';
const labels=Object.fromEntries(Object.entries(shared).map(([key,value])=>[key.replace(/^battlesim1291\./,'battlesim1302.'),value.replaceAll('Robinton','Max')]));
Object.assign(labels, Object.fromEntries(Object.entries({
  age:'Age',sourceExit:'Use printed item',sourceItem:'Item you have',
  counterRule:'Two successful tire-iron hits retire each elder. Each elder hit ages Max twenty years; three hits end the fight. No HP damage is rolled.',
  counterAttack:'Max: {dice} = {total}; {result}. {name}: {n}/{max} tiring hits.',
  agingAttack:'{name}: {dice} = {total}; {result}. Aging hits: {n}/{max}; age {age}.',
  agingHits:'Aging hits {n}/{max}; age {age}',enemyHits:'{name}: {n}/{max} tiring hits',retired:'Retired',
  vanished:'{name} rolls {total} and vanishes after striking. Max cannot hit this round.'
}).map(([key,value])=>['battlesim1302.'+key,value])));
export default labels;

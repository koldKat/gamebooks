// English labels for New Gaia's shared combat panel and equipment.
import original from './battlesim409.js';
const base=Object.fromEntries(Object.entries(original).map(([key,value])=>[key.replace('battlesim409.','battlesim410.'),value]));
const extra={
  title:'New Gaia: Combat', equipment:'Combat equipment', weapon:'Weapon',
  'weapon.none':'No weapon bonus', 'weapon.crowbar':'Crowbar (+1 attack)',
  'weapon.twins':'Pablo Twins (+2 attack)', 'weapon.rpg':'Dammler Micro RPG (all opponents)',
  shield:'Virtual shield (−1 incoming damage)', vest:'Bulletproof vest (4–6 absorbs up to 4 damage)',
  healingPatch:'Rapid healing patch (halve combat damage)', vestDie:'Vest die',
  equipmentOrder:'Damage reductions apply before halving. Half-point SPIRIT is retained without rounding.',
  supportDamage:'Supporting opponents', 'support.none':'No supporting damage',
  'support.others':'+1 per other surviving opponent', 'support.all':'+1 per surviving opponent, including the attacker',
  manualStory:'Apply the story consequences yourself. Equipment settings affect this combat only; codewords, travel and skill checks stay manual.',
};
export default {...base,...Object.fromEntries(Object.entries(extra).map(([key,value])=>['battlesim410.'+key,value]))};

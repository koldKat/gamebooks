import shared from './battlesim1291.js';
const labels=Object.fromEntries(Object.entries(shared).map(([key,value])=>[key.replace(/^battlesim1291\./,'battlesim1298.'),value.replaceAll('Robinton','Scatha')]));
Object.assign(labels,{'battlesim1298.healingSips':'Healing sips left','battlesim1298.healing':'Potion sips to drink','battlesim1298.heal':'Drink potion','battlesim1298.healingNote':'Each sip restores 1 HP. Use up to five remaining sips in one healing round, replacing your attack. Potion stock carries between fights; shared inventory is unchanged.','battlesim1298.phaseChanged':'The demon’s temporary power fades; its combat values change.'});
export default labels;

import shared from './battlesim1286.js';
const labels={
  title:'Battle Simulator - The Heart of Fire',
  'condition.goldenMirror':'Carry the Golden Mirror','condition.bookOfBinding':'Carry the Book of Binding',
  'condition.hasRhinosaurPheromone':'Carry Rhinosaur Pheromone','condition.rhinosaurFreed':'The rhinosaur was freed',
  'condition.fireQuencher':'Fire Quencher is active','condition.windBreaker':'Wind Breaker is active',
  spriteRounds:'Rounds spent fighting the sprites',priorChallengeRounds:'Challenge rounds already completed',
  priorChallengeAbilities:'Abilities already used in this challenge',chooseEncounterAbilities:'Choose {n} distinct totem abilities',
  gridPosition:'Choose a clear grid square',unusedAbility:'Unused ability to sacrifice',
  storyActions:'Story rewards and lasting bonuses',discoverGold:'Discover gold',rewardGold:'Receive gold reward',
  lootInstead:'Take gold instead of loot',spellbooks:'Spellbooks discovered',applyPermanentBonus:'Apply lasting bonus',
  sourceCounter:'Completed source objectives',saveSourceCounter:'Save objective count',
};
export default {...Object.fromEntries(Object.entries(shared).map(([key,value])=>[key.replace(/^battlesim1286\./,'battlesim1287.'),value])),
  ...Object.fromEntries(Object.entries(labels).map(([key,value])=>['battlesim1287.'+key,value]))};

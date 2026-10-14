import common from './battlesim674.js';
const labels = Object.fromEntries(Object.entries(common).filter(([key])=>!key.startsWith('battlesim674.enemy.'))
  .map(([key,value])=>[key.replace('battlesim674.',''),value]));
Object.assign(labels,{
  title:'Battle Simulator - The Court of Hidden Faces',
  created:'Character created: Rank 5, STAMINA 23, chain mail and 65 Shards.',
  note:'Wounds carry between fights. Enter effective abilities, including equipment. Apply story rewards, curses and ship losses yourself. Special combat checks and temporary drains are handled here.',
  specialCheck:'{ability}: {total} against Difficulty {difficulty}.',
  abilityDrain:'Lost {amount} {ability}.',
  defenceThroughFaith:'Use Defence through Faith in the next fight (+3 Defence)',
  defenceBlessingUsed:'Defence through Faith consumed: +3 Defence for this fight.',
  winChoices:'After winning, choose section {sections} in the reader.',
  'effect.choking':'Before every round, make SANCTITY 17; a failed roll costs the shortfall in STAMINA.',
  'effect.champion':'MAGIC 13 before combat; failure halves COMBAT (round up) for this fight only.',
  'effect.vampires':'Each wound drains 1 COMBAT as well as STAMINA. COMBAT returns after the fight. Vampire death cannot be resurrected.',
  'effect.strangling':'Before combat, repeat COMBAT 12 checks. Each failure costs 3 STAMINA until you escape or die.',
  'effect.tripling':'Three enemy attacks per player attack. The tripling scatters at 3 STAMINA.',
  'effect.abilityDrain':'Enemy hits cost no STAMINA: each removes 1 random ability permanently. Reaching zero is fatal.',
  'effect.lightning':'After each round, MAGIC 12; failure costs one die of STAMINA.',
  'effect.spectre':'Each wound triggers SANCTITY 11; failure drains 1 COMBAT for this fight only.',
  'effect.underwater':'No armour bonus to Defence. Entry SCOUTING 10 and after-round SCOUTING 9 subtract armour; failure drowns you.',
  'seaKind.coastal':'Coastal encounter','seaKind.passage':'Passenger voyage','seaKind.rescue':'Passing rescue ship',
  'seaKind.harbour':'Enter Aku harbour','seaKind.shipwreck':'Survive the shipwreck',
  'seaKind.drift':'Find your position','seaKind.boarding':'Repel pirate boarders',
});
for(const name of ['Hangman','Priest','Warrior','Bylewyn Buskle','Bandit','Troll','The Champion','Three Vampires',
  'Winged Predator','Wight','Toad-demon','Tripling','The Hangman','Giant Chameleon','Storm Demon',
  'Grindel the Ripper','Black Wolves','Water Drake',"Irmak's Spectre",'Snow Wolves','Unseen enemy']) labels['enemy.'+name]=name;
export default Object.fromEntries(Object.entries(labels).map(([key,value])=>['battlesim678.'+key,value]));

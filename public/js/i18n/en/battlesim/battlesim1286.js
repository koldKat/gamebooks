import shared from './battlesim1285.js';
const labels={title:'Battle Simulator - The Legion of Shadow',
  equipment:'Equipment modifiers',loadoutNote:'Enter the combat modifiers for the items you are using.',
  storyConditions:'Encounter choices',
  potionEffects:'Potion effects',potionNote:'Enter the effect and remaining uses from your potion. One potion per combat round.',
  effectAmount:'Effect strength',remainingUses:'Uses remaining',effectRounds:'Rounds (0: whole combat)',effect:'Effect',usePotion:'Use potion',
  'potion.health':'Healing potion','potion.speed':'Speed potion','potion.brawn':'Brawn potion','potion.magic':'Magic potion','potion.armour':'Armour potion',
  chooseRod:'Choose a rod','rod.enfeeblement':'Enfeeblement','rod.slowing':'Slowing','rod.rending':'Rending',
  'passage.north':'North passage','passage.east':'East passage','passage.west':'West passage',
  'condition.crownOfCommand':'Wearing the Crown of Command','condition.necromancer':'Use Necromancer control',
  'condition.shadowInfusion':'Snaide absorbed the shadow magic','condition.torchWebBurned':'Web burned with a torch',
  'condition.runeAllura':'Carry the Rune of Allura','condition.runeVoldring':'Carry the Rune of Voldring',
  'condition.runeMalachi':'Carry the Rune of Malachi','condition.runeTalos':'Carry the Rune of Talos',
  'condition.jannaAlive':'Janna survived','condition.gullAlive':'Gull survived','condition.laineAlive':'Laine survived','condition.klaretAlive':'Klaret survived',
};
export default {...Object.fromEntries(Object.entries(shared).map(([key,value])=>[key.replace(/^battlesim1285\./,'battlesim1286.'),value])),
  ...Object.fromEntries(Object.entries(labels).map(([key,value])=>['battlesim1286.'+key,value]))};

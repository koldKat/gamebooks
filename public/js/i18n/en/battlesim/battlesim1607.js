// English controls for independent Kingfisher combat encounters.
const prefix = 'battlesim1607.';
export default Object.fromEntries(Object.entries({
  title:'Aztec Quest: Combat', rules:'Roll initiative, then alternate attacks. Group timing is not specified in the book: choose the active opponent explicitly. Presets are optional.',
  maxHp:'Maximum Life Points', hp:'Current Life Points', experience:'Current experience', meleeBonus:'Melee weapon bonus', rangedBonus:'Ranged weapon bonus',
  damageModifier:'Other damage modifier', armour:'Armor reduction', ammo:'Arrows / ammunition', spells:'Death Spells available', prayers:'Ocelotl Prayers available', antidotes:'Antidote doses',
  weapon:'Player weapon', activeWeapon:'Current weapon', 'weapon.melee':'Melee', 'weapon.bow':'Bow', 'weapon.firearm':'Firearm', 'weapon.poison':'Poison bite', 'weapon.thrown':'Thrown weapon',
  poisonImmune:'Immune to poison', projectileProtection:'Vest cancels thrown-weapon / arrow bonuses', preset:'Encounter', custom:'Custom fight',
  enemyHp:'Opponent Life Points', count:'Number of opponents', enemyBonus:'Attack bonus', human:'Human opponent (1 = yes, 0 = no)', enemyWeapon:'Opponent attack',
  unknownHp:'Enter your current stats. Blank opponent Life Points are not printed in the source and must be supplied.',
  'context.foodBonus':'Section 41: +10 damage in this fight', 'context.beforeEating':'Section 18: attack before eating (-3 damage)',
  'context.suckerPunch':'Section 55: take the first attack', 'context.read108':'Read section 108: one priest attacks first',
  start:'Start fight', cancel:'Cancel fight', cancelConfirm:'Cancel this encounter?', invalid:'Enter valid current Life Points, opponent stats and dice values. Check available ammunition and encounter options.',
  activeOpponent:'Active opponent', automatic:'Automatic', die1:'Die 1', die2:'Die 2', roll:'Roll', spell:'Use a Death Spell', prayer:'Use Ocelotl Prayer', antidote:'Use antidote', healEnemy:'Priest drinks pulque', escape:'Try to escape (two dice)',
  'phase.initiative':'Roll one die for the first attack. An escape attempt uses two dice.', 'phase.player':'Your attack: roll two dice.', 'phase.enemy':'Opponent attack: roll two dice.', 'phase.spray':'Roll two dice for the skunk spray.',
  'status.fighting':'Fight in progress', 'status.win':'Victory', 'status.loss':'Defeat', 'status.fled':'Escaped', 'status.ended':'Encounter resolved', 'status.cancelled':'Canceled', ready:'Ready',
  totals:'Life Points: {hp} / {maxHp} · Exp: {experience} · Ammo: {ammo} · Spells: {spells}', remaining:'Opponents remaining: {count}', enemyTotals:'{name}: {hp} Lp · {count} remaining', poisoned:'Poison: {amount} Lp at the start of each turn',
  destination:'Continue in the reader at section {section}.', manualStory:'Apply story instructions in the reader. Equipment, healing outside combat and character progression stay under your control.', log:'Combat log', history:'Recent fights',
  event:'{action} · {name} · {dice} · damage / healing {amount} · your Lp {hp}',
  'action.initiative':'Initiative', 'action.attack':'Attack', 'action.target':'Opponent changed', 'action.weapon':'Weapon changed', 'action.healEnemy':'Enemy healing',
  'action.antidote':'Antidote', 'action.prayer':'Prayer', 'action.spell':'Death Spell', 'action.spray':'Skunk spray', 'action.escape':'Escape attempt', 'action.cancel':'Canceled',
}).map(([key,value]) => [prefix + key,value]));

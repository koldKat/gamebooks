import { legendaryInteger } from './character.js';
import { startLegendaryNaval } from './naval.js';
import { startLegendaryArmy } from './army.js';

const unit = (name,strength,morale,extra = {}) => Object.freeze({name,strength,morale,...extra});
const formation = rows => Object.freeze(rows.map(row => Object.freeze(row)));
const walterSpells = Object.freeze([
  Object.freeze({round:1,effect:'enfeeblement'}),Object.freeze({round:2,effect:'clingingDread'}),
]);

export const CROWN_ARMIES = Object.freeze({
  145:Object.freeze({garrison:'beverstone',win:246,loss:30,enemy:formation([
    [unit('Orc Irregulars',3,3)],
    [unit('Orc Pikemen',3,4,{antiCavalryBonus:1})],
    [unit('Orc Archers',2,2)],
  ])}),
  196:Object.freeze({garrison:'fosterly',win:402,loss:354,twoFrontLines:true,enemy:formation([
    [unit('Crownward madmen',4,3),unit('Harbourward netters',3,3)],
    [unit('Gateward Lunatics',4,4),unit('Gateward Cannibals',2,3)],
    [unit('Steelward Beserkers',5,3),unit('Cutthroat Harridans',3,2)],
  ])}),
  349:Object.freeze({garrison:'beverstone',win:559,flankClimbingPenalty:true,enemy:formation([
    [unit('Orc Reserves',2,2)],
    [unit('Orc Infantry',2,3)],
    [unit('Orc Archers',2,1)],
  ])}),
  532:Object.freeze({garrison:'fosterly',win:671,loss:1063,enemySpellSchedule:Object.freeze([
    Object.freeze({round:1,zone:1,effect:'rout'}),
    Object.freeze({round:2,zone:2,effect:'enfeeblement'}),
    Object.freeze({round:3,zone:0,effect:'clingingDread'}),
  ]),enemy:formation([
    [unit('Joria Knights',5,4,{firstRoundBonus:1}),unit('Bailey Billmen',4,3)],
    [unit('Bailey Knights',6,4,{firstRoundBonus:1}),unit('Crossbowmen',3,3)],
    [unit('Whitechurch Knights',6,3,{firstRoundBonus:1}),unit('Men-at-arms',4,4)],
  ])}),
  545:Object.freeze({garrison:'brightsands',win:697,loss:1047,defensiveSiege:true,friendlySpellSchedule:walterSpells,enemy:formation([
    [unit('Orc Berserkers',4,5),unit('Orc Archers',2,2)],
    [unit('Orc Heavy Infantry',5,3),unit('Maw Hounds',5,2)],
    [unit('Death Ravens',4,3,{missileVulnerability:2}),unit('Orc Pikemen',3,4)],
  ])}),
  705:Object.freeze({garrison:'brightsands',win:192,loss:900,friendlySpellSchedule:walterSpells,enemy:formation([
    [unit('Orc Heavy Infantry',5,3),unit('Death Ravens',4,3,{missileVulnerability:2})],
    [unit('Orc Pikemen',3,4,{antiCavalryBonus:1}),unit('Maw Hounds',5,2)],
    [unit('Orc Berserkers',4,5),unit('Orc Archers',2,2)],
  ])}),
  1114:Object.freeze({garrison:'highpoint',win:249,loss:398,enemy:formation([
    [unit('Beverstone Knights',6,4,{firstRoundBonus:1}),unit('Obsidian Spears',4,3)],
    [unit('Dayne Knights',6,5,{firstRoundBonus:1}),unit('Obsidian Archers',3,3)],
    [unit('Brightsands Knights',5,4,{firstRoundBonus:1}),unit('Obsidian Blades',5,3)],
  ])}),
});

export function startCrownArmy(player, section) {
  legendaryInteger(section,1);
  const battle = Object.hasOwn(CROWN_ARMIES,section) && CROWN_ARMIES[section];
  if (!battle) throw new RangeError('Choose a Crown & Tower army battle');
  if (battle.pendingRules) throw new RangeError('Army rules pending: ' + battle.pendingRules);
  if (!Array.isArray(player) || player.some(row => !Array.isArray(row))) throw new RangeError('Choose an army formation');
  for (const troop of player.flat().filter(Boolean)) {
    if (troop.garrison !== battle.garrison || !['infantry','cavalry','missile','longbow'].includes(troop.type))
      throw new RangeError('Choose troop types and units from the required garrison');
  }
  if (section === 349 && player[1]?.some(troop => troop.name === 'Mounted Sergeants'))
    throw new RangeError('Mounted Sergeants cannot operate the ram in the Centre');
  const {enemy,...rules} = battle;
  return startLegendaryArmy(player,enemy,{section,...rules});
}

export const CROWN_NAVAL = Object.freeze({
  604:Object.freeze({name:'Pirate Carrack',fighting:7,health:12,win:372,loss:938}),
  628:Object.freeze({name:'Pirate Carrack',fighting:7,health:11,win:172,loss:297}),
  730:Object.freeze({name:'Giant Squid',fighting:9,health:15,win:925,loss:53,seaSpellsForbidden:true}),
  802:Object.freeze({name:'Pirate Cog',fighting:4,health:7,win:878,cargoSurrender:878}),
  1053:Object.freeze({name:'Pirate Cog',fighting:4,health:7,win:172,loss:297}),
});

export function startCrownNaval(ship, section) {
  legendaryInteger(section,1);
  const battle = Object.hasOwn(CROWN_NAVAL,section) && CROWN_NAVAL[section];
  if (!battle) throw new RangeError('Choose a Crown & Tower ship battle');
  const {name,fighting,health,...rules} = battle;
  return startLegendaryNaval(ship,{name,fighting,health},{section,...rules,uncappedAttack:true});
}

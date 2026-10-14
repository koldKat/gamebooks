import { VALLEY_ROSTER } from './valley-roster.js';
import { startLegendaryArmy } from './army.js';
import { startLegendaryNaval } from './naval.js';
import { legendaryInteger, legendarySkill, validateLegendaryCharacter } from './character.js';
import { startLegendaryFight } from './combat.js';

const victories = {
  2:478,16:811,20:881,28:63,58:623,60:391,67:168,101:71,102:178,111:68,117:431,
  133:790,149:115,150:579,166:804,170:236,213:707,214:309,223:161,237:197,238:840,
  239:157,257:125,264:555,279:635,296:135,297:840,306:816,308:775,356:395,367:874,
  386:9,389:650,406:611,422:115,446:135,449:618,457:345,483:611,497:298,500:882,
  501:763,506:184,518:251,529:833,538:748,550:71,554:357,563:311,564:509,580:773,
  587:606,604:734,636:278,648:95,660:341,666:219,702:334,706:75,708:72,723:669,
  733:777,739:135,744:418,749:431,766:68,782:619,787:841,835:107,846:15,869:651,
  885:669,889:328,901:477,
};

const exceptions = {
  2:{flee:515},
  16:{special:'skallos'},20:{special:'fallingRocks',hygliph:true},28:{special:'zealotHealer'},
  60:{team:'chase',loss:450},67:{noArmour:true},111:{hero:'jessica',loss:468},
  117:{special:'lateDaisy'},170:{spellsForbidden:true},213:{special:'slaveAllies'},
  214:{special:'ironKing'},239:{solo:true,unarmed:true,excludeWeapon:true,stopRound:3,stop:157},
  264:{special:'archers'},279:{hero:'akihiro',special:'yuYan'},297:{special:'openingSpells'},
  306:{flee:736,precombatSpells:true},386:{hero:'akihiro',excludeWeapon:true,unarmed:false,loss:596,nonfatalLossHealth:1},
  406:{team:'weapons',unarmed:true,excludeWeapon:true,loss:292,special:'guardWeapon'},
  449:{partyFirst:false},457:{special:'doubleAttack'},
  483:{team:'weapons',unarmed:true,excludeWeapon:true,loss:292,special:'guardWeapon'},
  497:{partyFirst:false,hygliph:true},500:{hero:'akihiro',loss:320,special:'enlightenment'},
  501:{special:'jungle'},518:{special:'beetles',excludeWeapon:true,unarmed:false},
  529:{team:'wall',loss:75},538:{hygliph:true},554:{flee:75},563:{special:'imopposh'},
  564:{special:'unbraaki'},580:{noArmour:true,flee:395,fleeAttack:true},
  587:{special:'backstab'},604:{conditionalFlee:851},636:{special:'sorcerer'},
  648:{team:'guards',special:'assassinObjective',objectiveLoss:254},
  702:{special:'fastilon'},706:{stopRound:2,stop:55,special:'bronzeguard'},708:{hygliph:true},
  733:{special:'doubleAttack'},744:{solo:true,loss:502},749:{special:'lateSkullcracker'},
  766:{special:'doubleAttack'},782:{hero:'akihiro',stopRound:2,stop:619},787:{special:'saltDragon'},
  846:{special:'archers'},885:{partyFirst:false},
};

export const VALLEY_FIGHTS = Object.freeze([...Object.entries(victories).map(([key,win]) => {
  const section=Number(key);
  return Object.freeze({section,win,...exceptions[section],
    enemies:Object.freeze(VALLEY_ROSTER.filter(enemy=>enemy.section===section))});
}),Object.freeze({section:771,special:'doubleAttack',dynamic:true,win:267,loss:321,enemies:Object.freeze([])})]
  .sort((a,b)=>a.section-b.section));

export function startValleyFight(party,section,{participants,codes=[],hygliph=false,enlightened=false,shipInMordain=false,
  rage=false,slaveDamage=1,stealthHero,stealthOutcome,cursedMember,knockout=false,undercover=false}={}) {
  legendaryInteger(section,1);
  const battle=VALLEY_FIGHTS.find(fight=>fight.section===section);
  if (!battle || !Array.isArray(party) || !Array.isArray(codes) || codes.some(code=>typeof code!=='string'))
    throw new RangeError('Choose a Valley of Bones fight and party');
  if (section===771) {
    legendaryInteger(cursedMember,0,party.length-1);
    validateLegendaryCharacter(party[cursedMember],true);
  }
  const selected=participants ?? (battle.hero ? party.flatMap((hero,index)=>hero.profileId===battle.hero && hero.health>0 ? [index] : []) :
    party.flatMap((hero,index)=>hero.health>0 && !(section===771 && index===cursedMember) ? [index] : []));
  if (!Array.isArray(selected) || !selected.length || ((battle.hero || battle.solo) && selected.length!==1))
    throw new RangeError('Choose the required hero for this duel');
  if (battle.hero && party[selected[0]]?.profileId!==battle.hero) throw new RangeError('This duel requires its named hero');
  const enemies=battle.enemies.filter(enemy=>section!==214 ||
    !(codes.includes('A8') && /Bronzeguard/i.test(enemy.name)) && !(codes.includes('A13') && /Malronac/.test(enemy.name)))
    .map(enemy=>({...enemy}));
  for (const enemy of enemies) {
    if (battle.hygliph && hygliph) enemy.threshold++;
    if (section===500 && enlightened) {enemy.threshold=4;enemy.defence=4;}
    if ((section===117 && enemy.name==='Daisy') || (section===749 && enemy.name==='Skullcracker')) enemy.arrivalRound=3;
    if (section===782) enemy.stony=true;
  }
  const {enemies:unused,...rules}=battle;
  rules.rage=!!rage;
  if (section===213) rules.slaveDamage=legendaryInteger(slaveDamage,0,2);
  if (section===706 && undercover) {rules.noArmour=true;rules.excludeTwoHanded=true;}
  if (section===771) {
    if (selected.includes(cursedMember)) throw new RangeError('The cursed hero cannot fight on both sides');
    const hero=party[cursedMember];
    enemies.push({name:hero.name,attack:legendarySkill(hero,'fighting')-(hero.armed?0:1),threshold:4,
      defence:4,health:hero.health,attackType:'dice'});
    enemies[0].attack=Math.max(0,enemies[0].attack);
    rules.cursedMember=cursedMember;
    rules.knockout=!!knockout;
    rules.win=knockout?850:267;
    if (knockout) {rules.unarmed=true;rules.excludeWeapon=true;rules.damageSpellsForbidden=true;}
  }
  if (stealthOutcome!==undefined && [2,213].includes(section)) {
    legendaryInteger(stealthHero,0,party.length-1);
    if (!selected.includes(stealthHero)) throw new RangeError('The stealth hero must participate in this fight');
    if (section===2 && stealthOutcome==='success') rules.surpriseHero=stealthHero;
    else if (stealthOutcome==='failure') rules.openingStrike={memberIndex:stealthHero,
      enemyIndex:section===2?0:enemies.findIndex(enemy=>enemy.name==='Orc Leader')};
    else if (section!==213 || stealthOutcome!=='success') throw new RangeError('Choose the actual stealth outcome');
  }
  if (battle.conditionalFlee && shipInMordain) rules.flee=battle.conditionalFlee;
  return startLegendaryFight(party,enemies,rules,selected);
}

const unit = (name,strength,morale,extra={}) => Object.freeze({name,strength,morale,...extra});
const formation = zones => Object.freeze(zones.map(zone=>Object.freeze(zone)));
export const VALLEY_ARMIES = Object.freeze({
  162:Object.freeze({win:316,loss:220,descantos:true,enemy:formation([
    [unit('Cursite Zealots',4,5),unit('Cursite Infantry',4,4)],
    [unit('Mercenary Knights',5,3,{firstRoundBonus:1}),unit('Citizen Archers',2,4)],
    [unit('Cursite Riders',5,4),unit('Mercenary Spears',3,2)],
  ])}),
  316:Object.freeze({win:363,loss:220,enemy:formation([
    [unit('Mercenary Men-at-Arms',4,2),unit('Cursite Citizens',2,3)],
    [unit('Temple Guard',5,4),unit('Citizen Archers',2,4)],
    [unit('Cursite Zealots',4,5),unit('Mercenary Crossbows',2,2)],
  ])}),
  376:Object.freeze({win:214,loss:670,enemy:formation([
    [unit('Spearmen of Saltdad',2,2)],
    [unit('Bronzeguard',5,5),unit('Peasant Levies',1,1)],
    [unit('Mercenary Swords',3,2)],
  ])}),
  610:Object.freeze({win:342,loss:48,enemy:formation([
    [unit('Landsmen Cavalry',4,2),unit('Field Overseers',2,2)],
    [unit('Cursite Fanatics',3,5),unit('Slave Levies',1,1)],
    [unit('Clifftop Infantry',3,3),unit('Thalsian Mercenaries',2,3)],
  ])}),
});

export function startValleyArmy(player,section,codes=[]) {
  legendaryInteger(section,1);
  const battle=Object.hasOwn(VALLEY_ARMIES,section) && VALLEY_ARMIES[section];
  if (!battle || !Array.isArray(codes) || codes.some(code=>typeof code!=='string'))
    throw new RangeError('Choose a Valley of Bones army battle and codes');
  const absent=unit => {
    if ([162,316].includes(section)) {
      if (codes.includes('A40') && unit.name==='Cursite Zealots') return true;
      if (codes.includes('A96') && /mercenary/i.test(unit.name)) return true;
    }
    return section===376 && codes.includes('A8') && unit.name==='Bronzeguard';
  };
  const enemy=battle.enemy.map(zone=>zone.filter(unit=>!absent(unit)));
  return startLegendaryArmy(player,enemy,{section,win:battle.win,loss:battle.loss,
    descantos:!!battle.descantos && !codes.includes('A95')});
}

export const VALLEY_NAVAL = Object.freeze({
  429:Object.freeze({name:'Pirate Pinnace',fighting:5,health:6,win:690,loss:741}),
  679:Object.freeze({name:'War Canoes',fighting:3,health:10,win:774,loss:52,fightingPenalty:1}),
  721:Object.freeze({name:'Ork Hulk',fighting:3,health:5,win:796}),
});

export function startValleyNaval(ship,section) {
  legendaryInteger(section,1);
  const enemy=Object.hasOwn(VALLEY_NAVAL,section) && VALLEY_NAVAL[section];
  if (!enemy) throw new RangeError('Choose a Valley of Bones naval battle');
  return startLegendaryNaval(ship,{name:enemy.name,fighting:enemy.fighting,health:enemy.health},
    {section,win:enemy.win,loss:enemy.loss,fightingPenalty:enemy.fightingPenalty??0});
}

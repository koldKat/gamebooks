import { installValleyRoster } from './valley-roster.js';
import { createRosterLoader } from '../../roster-data.js';
import { startLegendaryArmy } from './army.js';
import { startLegendaryNaval } from './naval.js';
import { legendaryInteger, legendarySkill, validateLegendaryCharacter } from './character.js';
import { startLegendaryFight } from './combat.js';

export let VALLEY_FIGHTS = Object.freeze([]);
export let VALLEY_ARMIES = Object.freeze({});
export let VALLEY_NAVAL = Object.freeze({});
function freezeCatalog(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeCatalog);
    Object.freeze(value);
  }
  return value;
}
export const loadRoster = createRosterLoader(689, 'CATALOG', entries => {
  const fights = entries.filter(entry => entry.kind === 'fight').map(entry => entry.spec);
  installValleyRoster(fights.flatMap(fight => fight.enemies));
  VALLEY_FIGHTS = freezeCatalog(fights);
  VALLEY_ARMIES = freezeCatalog(Object.fromEntries(entries.filter(entry => entry.kind === 'army').map(entry => [entry.section, entry.spec])));
  VALLEY_NAVAL = freezeCatalog(Object.fromEntries(entries.filter(entry => entry.kind === 'naval').map(entry => [entry.section, entry.spec])));
});

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

export function startValleyNaval(ship,section) {
  legendaryInteger(section,1);
  const enemy=Object.hasOwn(VALLEY_NAVAL,section) && VALLEY_NAVAL[section];
  if (!enemy) throw new RangeError('Choose a Valley of Bones naval battle');
  return startLegendaryNaval(ship,{name:enemy.name,fighting:enemy.fighting,health:enemy.health},
    {section,win:enemy.win,loss:enemy.loss,fightingPenalty:enemy.fightingPenalty??0});
}

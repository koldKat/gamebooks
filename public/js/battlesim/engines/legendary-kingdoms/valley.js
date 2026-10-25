import { installValleyRoster, VALLEY_SETTINGS } from './valley-roster.js';
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
  const settings = entries.find(entry => entry.support)?.support.rules;
  if (!settings) throw new Error('Incomplete Valley settings');
  const fights = entries.filter(entry => entry.kind === 'fight').map(entry => entry.spec);
  installValleyRoster(fights.flatMap(fight => fight.enemies), settings);
  VALLEY_FIGHTS = freezeCatalog(fights);
  VALLEY_ARMIES = freezeCatalog(Object.fromEntries(entries.filter(entry => entry.kind === 'army').map(entry => [entry.section, entry.spec])));
  VALLEY_NAVAL = freezeCatalog(Object.fromEntries(entries.filter(entry => entry.kind === 'naval').map(entry => [entry.section, entry.spec])));
});

export function startValleyFight(party,section,{participants,codes=[],hygliph=false,enlightened=false,shipInMordain=false,
  rage=false,slaveDamage,stealthHero,stealthOutcome,cursedMember,knockout=false,undercover=false}={}) {
  legendaryInteger(section,1);
  const battle=VALLEY_FIGHTS.find(fight=>fight.section===section);
  const settings=VALLEY_SETTINGS,sections=settings.sections;
  if (!battle || !Array.isArray(party) || !Array.isArray(codes) || codes.some(code=>typeof code!=='string'))
    throw new RangeError('Choose a Valley of Bones fight and party');
  if (section===sections.cursed) {
    legendaryInteger(cursedMember,0,party.length-1);
    validateLegendaryCharacter(party[cursedMember],true);
  }
  const selected=participants ?? (battle.hero ? party.flatMap((hero,index)=>hero.profileId===battle.hero && hero.health>0 ? [index] : []) :
    party.flatMap((hero,index)=>hero.health>0 && !(section===sections.cursed && index===cursedMember) ? [index] : []));
  if (!Array.isArray(selected) || !selected.length || ((battle.hero || battle.solo) && selected.length!==1))
    throw new RangeError('Choose the required hero for this duel');
  if (battle.hero && party[selected[0]]?.profileId!==battle.hero) throw new RangeError('This duel requires its named hero');
  const enemies=battle.enemies.filter(enemy=>section!==sections.ironKing ||
    !(codes.includes(settings.codes.bronzeguard) && new RegExp(settings.names.bronzeguardPattern,'i').test(enemy.name)) && !(codes.includes(settings.codes.malronac) && new RegExp(settings.names.malronacPattern).test(enemy.name)))
    .map(enemy=>({...enemy}));
  for (const enemy of enemies) {
    if (battle.hygliph && hygliph) enemy.threshold+=settings.hygliphPenalty;
    if (section===sections.enlightenment && enlightened) Object.assign(enemy,settings.enlightened);
    if ((section===sections.lateDaisy && enemy.name===settings.names.daisy) || (section===sections.lateSkullcracker && enemy.name===settings.names.skullcracker)) enemy.arrivalRound=settings.arrivalRound;
    if (section===sections.statue) enemy.stony=true;
  }
  const {enemies:unused,...rules}=battle;
  rules.rage=!!rage;
  if (section===sections.slaves) rules.slaveDamage=legendaryInteger(slaveDamage===undefined?settings.slaves.default:slaveDamage,0,settings.slaves.maximum);
  if (section===sections.undercover && undercover) {rules.noArmour=true;rules.excludeTwoHanded=true;}
  if (section===sections.cursed) {
    if (selected.includes(cursedMember)) throw new RangeError('The cursed hero cannot fight on both sides');
    const hero=party[cursedMember];
    enemies.push({name:hero.name,attack:legendarySkill(hero,'fighting')-(hero.armed?0:1),threshold:settings.cursed.threshold,
      defence:settings.cursed.defence,health:hero.health,attackType:'dice'});
    enemies[0].attack=Math.max(0,enemies[0].attack);
    rules.cursedMember=cursedMember;
    rules.knockout=!!knockout;
    rules.win=knockout?settings.cursed.knockoutWin:battle.win;
    if (knockout) {rules.unarmed=true;rules.excludeWeapon=true;rules.damageSpellsForbidden=true;}
  }
  if (stealthOutcome!==undefined && sections.stealth.includes(section)) {
    legendaryInteger(stealthHero,0,party.length-1);
    if (!selected.includes(stealthHero)) throw new RangeError('The stealth hero must participate in this fight');
    if (section===sections.surprise && stealthOutcome==='success') rules.surpriseHero=stealthHero;
    else if (stealthOutcome==='failure') rules.openingStrike={memberIndex:stealthHero,
      enemyIndex:section===sections.surprise?0:enemies.findIndex(enemy=>enemy.name===settings.names.orcLeader)};
    else if (section!==sections.slaves || stealthOutcome!=='success') throw new RangeError('Choose the actual stealth outcome');
  }
  if (battle.conditionalFlee && shipInMordain) rules.flee=battle.conditionalFlee;
  return startLegendaryFight(party,enemies,rules,selected);
}

export function startValleyArmy(player,section,codes=[]) {
  legendaryInteger(section,1);
  const battle=Object.hasOwn(VALLEY_ARMIES,section) && VALLEY_ARMIES[section];
  if (!battle || !Array.isArray(codes) || codes.some(code=>typeof code!=='string'))
    throw new RangeError('Choose a Valley of Bones army battle and codes');
  const settings=VALLEY_SETTINGS;
  const absent=unit => {
    if (settings.sections.codeArmies.includes(section)) {
      if (codes.includes(settings.codes.zealots) && unit.name===settings.names.zealots) return true;
      if (codes.includes(settings.codes.mercenaries) && new RegExp(settings.names.mercenaryPattern,'i').test(unit.name)) return true;
    }
    return section===settings.sections.bronzeArmy && codes.includes(settings.codes.bronzeguard) && unit.name===settings.names.bronzeArmy;
  };
  const enemy=battle.enemy.map(zone=>zone.filter(unit=>!absent(unit)));
  return startLegendaryArmy(player,enemy,{section,win:battle.win,loss:battle.loss,
    descantos:!!battle.descantos && !codes.includes(settings.codes.descantos)});
}

export function startValleyNaval(ship,section) {
  legendaryInteger(section,1);
  const enemy=Object.hasOwn(VALLEY_NAVAL,section) && VALLEY_NAVAL[section];
  if (!enemy) throw new RangeError('Choose a Valley of Bones naval battle');
  return startLegendaryNaval(ship,{name:enemy.name,fighting:enemy.fighting,health:enemy.health},
    {section,win:enemy.win,loss:enemy.loss,fightingPenalty:enemy.fightingPenalty??0});
}

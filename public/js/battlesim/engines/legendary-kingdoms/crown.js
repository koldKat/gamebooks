import { installCrownRoster, CROWN_SETTINGS } from './crown-roster.js';
import { installCrownStrategy } from './crown-strategy.js';
import { createRosterLoader } from '../../roster-data.js';
import { legendaryInteger, legendarySkill } from './character.js';
import { startLegendaryFight, legendaryEntryDamage } from './combat.js';
import { legendaryArmourParts } from './equipment.js';

export let CROWN_FIGHTS = Object.freeze([]);
function freezeCatalog(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeCatalog);
    Object.freeze(value);
  }
  return value;
}
export const loadRoster = createRosterLoader(690, 'CATALOG', entries => {
  const settings = entries.find(entry => entry.support)?.support.rules;
  if (!settings) throw new Error('Incomplete Crown settings');
  const fights = entries.filter(entry => entry.kind === 'fight').map(entry => entry.spec);
  installCrownRoster(fights.flatMap(fight => fight.enemies), settings);
  CROWN_FIGHTS = freezeCatalog(fights);
  installCrownStrategy(
    freezeCatalog(Object.fromEntries(entries.filter(entry => entry.kind === 'army').map(entry => [entry.section, entry.spec]))),
    freezeCatalog(Object.fromEntries(entries.filter(entry => entry.kind === 'naval').map(entry => [entry.section, entry.spec]))));
});

export function startCrownFight(party, section, { participants, codes = [], ogreVisits = 0,
  defeatedEnemies = [], vesselType, trappedHero, entryDamageHero, entryDamageAlreadyApplied = false,
  skipFirstEnemyTurn = false, wizardWounded = false, titanEyesHit = false,
  guardApproach = 'ordinary', heroArrivalOrder, guardArrivalOrder, assassinationSuccesses = 0,
  rooftopAssassin, boyFreed, spareBryce = false, armourParts, grappleRolls, freeHero, silver,
  heroZones, pitVictim, abbessSlain = false, goddessCaress = false, controlledMember } = {}) {
  legendaryInteger(section, 1);
  const battle = CROWN_FIGHTS.find(fight => fight.section === section);
  const settings = CROWN_SETTINGS, sections = settings.sections;
  if (!battle || !Array.isArray(party) || !Array.isArray(codes) || codes.some(code => typeof code !== 'string'))
    throw new RangeError('Choose a Crown & Tower encounter and party');
  // Unfinished rules must never silently become ordinary fights.
  if (battle.pendingRules) throw new RangeError('Encounter implementation pending: ' + battle.pendingRules);
  if (battle.team && !participants) throw new RangeError('Select the team assigned to this encounter');
  const selected = participants ?? party.flatMap((hero, index) => hero.health > 0 &&
    (!battle.hero || hero.profileId === battle.hero) && !battle.excludedProfiles?.includes(hero.profileId) ? [index] : []);
  if (!Array.isArray(selected)) throw new RangeError('Select participating heroes');
  if (selected.some(index => battle.excludedProfiles?.includes(party[index]?.profileId)))
    throw new RangeError('An absent or captured hero cannot join this encounter');
  if ((battle.hero || battle.solo) && (selected.length !== 1 ||
      (battle.hero && party[selected[0]]?.profileId !== battle.hero)))
    throw new RangeError('Select the required hero for this duel');
  legendaryInteger(ogreVisits);
  legendaryInteger(assassinationSuccesses);
  if (!Array.isArray(defeatedEnemies) || defeatedEnemies.some(name =>
    !battle.enemies.some(enemy => enemy.name === name)) ||
    (defeatedEnemies.length && !settings.defeated.sections.includes(section)))
    throw new RangeError('Choose only opponents already defeated on this approach');
  if (section === sections.priorDuel && defeatedEnemies.some(name => !settings.defeated.restrictedNames.includes(name)))
    throw new RangeError('Only Sir Walter and Sar Lidia can have been defeated on this approach');
  const enemies = battle.enemies.filter(enemy => !defeatedEnemies.includes(enemy.name) &&
    !(section === sections.ogres && settings.ogres.some(rule=>enemy.name===rule.name && ogreVisits<rule.minimumVisits)) &&
    !(section === sections.rioters && settings.rioters.some(rule=>codes.includes(rule.code) && enemy.name===rule.name)) &&
    !(section === sections.guards && guardApproach === 'assassination' &&
      assassinationSuccesses >= (settings.guards.assassination[enemy.name] ?? Infinity)))
    .map(enemy => ({ ...enemy }));
  const { enemies: unused, ...rules } = battle;
  rules.healingPotionAction = true;
  if (typeof goddessCaress !== 'boolean') throw new RangeError('Choose whether the goddess caressed the party');
  if (section === sections.controlled && controlledMember !== undefined) {
    if (!selected.includes(controlledMember) || selected.length < settings.controlled.minimumParticipants)
      throw new RangeError('Choose the controlled hero from a party with other living heroes');
    rules.controlledMember = controlledMember;rules.controllerIndex = settings.controlled.controllerIndex;
    enemies.push({name:party[controlledMember].name,attack:legendarySkill(party[controlledMember],'fighting'),
      threshold:settings.controlled.threshold,defence:settings.controlled.defence,health:party[controlledMember].health,attackType:'dice',partyMember:controlledMember});
  }
  if (typeof abbessSlain !== 'boolean') throw new RangeError('Choose whether the Abbess was already slain');
  if (section === sections.abbess && party.some((hero,index) => hero.health > 0 && !selected.includes(index))) rules.loss = settings.abbess.reserveLoss;
  if (section === sections.walkway) {
    if (!Array.isArray(heroZones) || heroZones.length !== party.length ||
        selected.some(index => !['walkway','pool'].includes(heroZones[index])))
      throw new RangeError('Choose whether each participating hero is on the walkway or in the pool');
    rules.initialZones = [...heroZones];
  }
  if (section === sections.pit) {
    if (!selected.includes(pitVictim)) throw new RangeError('Choose the hero who fell into the sewer pit');
    rules.initialZones = party.map((_,index) => index === pitVictim ? 'pool' : 'outside');
  }
  if (rules.halveSilverOnLoss) rules.startingSilver = legendaryInteger(silver);
  if (section === sections.grapple) {
    if (!Array.isArray(grappleRolls) || grappleRolls.length !== party.length ||
        selected.length !== party.filter(hero => hero.health > 0).length)
      throw new RangeError('Roll once for each party member before the tentacle attack');
    grappleRolls.forEach(value => legendaryInteger(value, 1, 6));
    const maximum = Math.max(...selected.map(index => grappleRolls[index]));
    const candidates = selected.filter(index => grappleRolls[index] === maximum);
    freeHero ??= candidates.length === 1 ? candidates[0] : undefined;
    if (!candidates.includes(freeHero)) throw new RangeError('Choose the ungrappled hero among the highest rolls');
    rules.initialGrappled = selected.filter(index => index !== freeHero);
  }
  if (rules.noShield || rules.capturedEquipment || rules.armourErosion) {
    rules.armourParts = {};
    for (const index of selected) rules.armourParts[index] = legendaryArmourParts(party[index], armourParts?.[index]);
  }
  if (section === sections.doors) {
    const doorHolders = party.flatMap((hero,index) => hero.health > 0 && !selected.includes(index) ? [index] : []);
    if (!settings.doors.participants.includes(selected.length) || doorHolders.length + selected.length !== settings.doors.partySize)
      throw new RangeError('Assign two or three of the four heroes to hold the doors after the skill check');
    rules.defeatOnLoss = doorHolders;
  }
  if (typeof spareBryce !== 'boolean') throw new RangeError('Choose whether to spare Sir Bryce');
  let grappledTasha;
  if (section === sections.rescue) {
    if (typeof boyFreed !== 'boolean') throw new RangeError('Choose the result of the rescue check');
    grappledTasha = selected.find(index => party[index].profileId === settings.rescue.profile);
    if (grappledTasha === undefined) throw new RangeError('Tasha must participate in the rescue');
    if (!boyFreed) {
      rules.disabledParticipants = [grappledTasha];
      rules.winGroups = structuredClone(settings.rescue.winGroups);
      rules.defeatOnVictory = [...settings.rescue.defeatOnVictory];
    }
  }
  if (section === sections.rooftop && rooftopAssassin !== undefined) {
    if (!selected.includes(rooftopAssassin)) throw new RangeError('Choose the assassin from the participating party');
    rules.heroArrivalRounds = party.map((_, index) => settings.rooftopRounds[index === rooftopAssassin ? 0 : 1]);
  }
  if (section === sections.guards) {
    if (!settings.guards.approaches.includes(guardApproach))
      throw new RangeError('Choose the manor guard approach');
    if (guardApproach === 'walls') {
      if (!Array.isArray(heroArrivalOrder) || heroArrivalOrder.length !== selected.length ||
          new Set(heroArrivalOrder).size !== selected.length || heroArrivalOrder.some(index => !selected.includes(index)) ||
          !Array.isArray(guardArrivalOrder) || guardArrivalOrder.length !== enemies.length ||
          new Set(guardArrivalOrder).size !== enemies.length || guardArrivalOrder.some(name => !enemies.some(enemy => enemy.name === name)))
        throw new RangeError('Choose the arrival order of every participating hero and guard');
      rules.heroArrivalRounds = party.map((_, index) => selected.includes(index) ? heroArrivalOrder.indexOf(index) + 1 : 1);
      for (const enemy of enemies) enemy.arrivalRound = guardArrivalOrder.indexOf(enemy.name) + 1;
    } else if (guardApproach === 'basement') {
      for (const enemy of enemies) enemy.arrivalRound = settings.guards.basementRounds[enemy.name === settings.guards.basementFirst ? 0 : 1];
    }
  }
  if ([entryDamageAlreadyApplied,skipFirstEnemyTurn,wizardWounded,titanEyesHit].some(value => typeof value !== 'boolean'))
    throw new RangeError('Choose explicit entry-wound and surprise options');
  if (section === sections.surprise) rules.skipFirstEnemyTurn = skipFirstEnemyTurn;
  if (Object.hasOwn(settings.reactions,section)) rules.thresholdReactions = structuredClone(settings.reactions[section]);
  if (section === sections.trapped) {
    const lowest = Math.min(...selected.map(index => legendarySkill(party[index], settings.trap.ability)));
    const candidates = selected.filter(index => legendarySkill(party[index], settings.trap.ability) === lowest);
    trappedHero ??= candidates.length === 1 ? candidates[0] : undefined;
    if (!candidates.includes(trappedHero)) throw new RangeError('Choose the trapped hero with the lowest Survival');
    rules.disabledParticipants = [trappedHero];
  }
  if (section === sections.pirates) {
    if (typeof vesselType!=='string' || !Object.hasOwn(settings.pirates.wins,vesselType)) throw new RangeError('Choose the pirate ship being boarded');
    rules.win = settings.pirates.wins[vesselType];
  }
  const flags = {goddessCaress,wizardWounded,titanEyesHit,spareBryce,boyFreed};
  const effects = settings.enemyEffects.filter(effect=>effect.section===section);
  for (const enemy of enemies) {
    enemy.maxHealth = enemy.health;
    for (const effect of effects) {
      if (!effect.names.includes(enemy.name) || effect.when && flags[effect.when.flag]!==effect.when.value) continue;
      Object.assign(enemy,structuredClone(effect.properties));
      if (effect.healthLoss) enemy.health-=effect.healthLoss;
    }
    if (section===sections.rescue && !boyFreed && enemy.name===settings.rescue.fastThug)
      enemy.forcedDamage={hits:settings.rescue.damage,forcedMember:grappledTasha};
    if (section===sections.trapped) enemy.beforeAttackDamage={hits:settings.trap.damage,
      forcedMember:trappedHero,unpreventable:settings.trap.unpreventable};
  }
  let fight = startLegendaryFight(party, enemies, rules, selected);
  if (section === sections.abbess && abbessSlain) fight.enemies.find(enemy => enemy.name === settings.abbess.name).health = 0;
  if (section === sections.pit && !entryDamageAlreadyApplied) fight = legendaryEntryDamage(fight, [pitVictim], settings.pit.entryDamage);
  if (rules.grappleEscape && !rules.initialGrappled.length) {
    fight.status = 'won';fight.phase = 'ended';fight.destination = rules.win;
  }
  if (!entryDamageAlreadyApplied && Object.hasOwn(settings.entryDamage,section)) {
    const entry=settings.entryDamage[section];
    if (entry.recipient==='chosen' && !selected.includes(entryDamageHero)) throw new RangeError('Choose the hero clawed on entry');
    fight = legendaryEntryDamage(fight, entry.recipient==='all'?selected:[entry.recipient==='chosen'?entryDamageHero:selected[0]], entry.hits);
  }
  return fight;
}

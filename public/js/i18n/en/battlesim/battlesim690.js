import valley from './battlesim689.js';

const labels = {
  title:'Battle Simulator - Crown & Tower',
  fleetManual:'Fleet combat in section 555 is manual. Use your fleet sheet and the fleet rules in Pirates of the Splintered Isles, section 400. The sea encounters here are single-ship battles.',
  note:'Use your current adventure-sheet values. Select the encounter, participating heroes and any story conditions before starting. Temporary combat restrictions do not discard your saved equipment.',
  ogreVisits:'Previous ogre visits',vesselType:'Pirate vessel',cog:'Cog',carrack:'Carrack',
  trappedHero:'Trapped hero (choose tied lowest Survival)',entryDamageHero:'Hero wounded on entry',
  rooftopAssassin:'Rooftop assassin (none for normal approach)',controlledMember:'Hero controlled by Narakath',
  pitVictim:'Hero who fell into the pit',freeHero:'Ungrappled hero (choose a tied highest roll)',frozenHero:'Frozen hero (excluded)',
  abbessSlain:'Abbess already slain',goddessCaress:'Caressed by the goddess',titanEyesHit:'Titan wounded in the eyes',
  wizardWounded:'Keraknorn already wounded',skipFirstEnemyTurn:'Successful opening surprise',
  spareBryce:'Knock out Sir Bryce instead of killing him',entryDamageAlreadyApplied:'Entry wounds already recorded',
  boyFreed:'Tasha freed the boy',chooseOutcome:'Choose the check result',guardApproach:'Manor approach',
  assassinationSuccesses:'Assassination successes',defeatedEnemies:'Opponents already defeated on this approach',
  'approach.ordinary':'Normal battle','approach.walls':'Climbing the walls','approach.basement':'Open basement door',
  'approach.assassination':'Assassination attempt',walkway:'Walkway',pool:'Pool',rollGrapple:'Roll initial grapple dice',
  unitType:'Troop type',unitGarrison:'Garrison',unitChargeBonus:'First-round charge bonus',
  editUnitType:'Troop type',editUnitGarrison:'Garrison',editUnitChargeBonus:'First-round charge bonus',
  'troop.infantry':'Infantry','troop.cavalry':'Cavalry','troop.missile':'Missile troops','troop.longbow':'Longbowmen',
  'garrison.beverstone':'Beverstone','garrison.fosterly':'Fosterly Castle','garrison.brightsands':'Brightsands',
  'garrison.highpoint':'Highpoint Castle',shipCargo:'Cargo units',apprenticeBook:'Learn from apprentice book: starts drained',
  releaseMember:'Hero to free',releaseMemberAction:'Free hero',stunnedMembers:'Highest-Fighting heroes',
  chooseStunned:'Confirm stunned heroes',vulnerableMember:'Highest-Armour hero',chooseVulnerable:'Confirm vulnerable hero',
  companionAttack:'Ally attacks selected opponent',takeFallenWeapon:'Take Sword of Ages',movingMember:'Hero',
  moveDestination:'Move to',moveHero:'Move hero',leaveHorror:'Leave the horror alive',alliedArmySpell:'Walter casts on selected unit',
  surrenderCargo:'Surrender cargo',armourAllocationNote:'Allocate save dice before rolling. Only successful worn-armour and shield saves damage that equipment.',
  armourDie:'Save die {number}','armourPart.body':'Worn armour','armourPart.shield':'Shield','armourPart.magic':'Rings / amulets',
  'armourPart.spell':'Spell armour',releasePrompt:'Choose a grappled hero to free.',
  stunPrompt:'Choose {count} heroes with the highest Fighting; you decide ties.',
  vulnerabilityPrompt:'Choose a hero with the highest Armour; you decide ties.',
  alliedSpellPrompt:'Choose an enemy zone and front/support unit for {spell}.',
  sameRecipient:'Party too small: allow a repeated recipient where the story requires distinct heroes',
  'army.145':'Teardrop Hill','army.196':'Longport street battle','army.349':'Storming the barricade',
  'army.532':'The Bailey army','army.545':'Defending Brightsands','army.705':'Attack beyond the lake',
  'army.1114':'The Dayne army','status.surrendered':'Cargo surrendered',
  'spell.nightcrawler':'Nightcrawler','spell.teleportCircle':'Teleport Circle','spell.tilt':'Tilt',
  'spell.wither':'Wither','spell.enfeeblement':'Enfeeblement','spell.teleport':'Teleport',
  'spell.orbOfAnnihilation':'Orb of Annihilation','spell.stingtailRune':'Stingtail Rune',
  'spell.vulnerability':'Vulnerability','spell.whipsnake':'Whipsnake',
  'event.enemySpell':'{enemy} casts a spell (result {value}).','event.thresholdReaction':'{enemy} reacts to its wounds.',
  'event.companionAttack':'Your ally inflicts {damage} damage.','event.companionInjured':'Your ally intercepts {hits} hits and can no longer attack.',
  'event.heroReleased':'{name} is freed.','event.heroesStunned':'The selected heroes are stunned next turn.',
  'event.vulnerabilityChosen':'{name} must receive Valahiem’s attack.',
  'event.heroMoved':'{name} changes location.','event.horrorLeftAlive':'The party escapes, leaving the horror alive.',
  'event.fallenWeaponTaken':'{name} takes the Sword of Ages.','event.silverRobbed':'The party is robbed: {remaining} silver remains.',
  'event.entryDamage':'{name} loses {hits} Health on entry.','event.noEligibleRecipient':'No hero can receive another attack this round.',
  'event.playerTurnDeadline':'Time runs out.','event.undamagedOpponentFailure':'An opponent raises the alarm.',
  'event.decayAura':'The decay aura harms heroes not wounded by the demon.',
  'event.spellRecharge':'{name} rolls {die} to recharge a spell.','event.enemyArmySpell':'The enemy casts a war spell.',
  'event.tilt':'Tilt reduces the next enemy ship attack by two dice.','event.cargoSurrendered':'The cargo is surrendered to the pirates.',
  'event.armourErosion':'{name} loses {eroded} points of physical Armour.',
};
for (let index=0;index<4;index++) {
  labels['heroArrival-'+index] = 'Hero arrival #'+(index+1);
  labels['grappleRoll-'+index] = 'Initial grapple roll';
  labels['heroZone-'+index] = 'Location';
  for (const part of ['body','shield','magic']) labels['armour-'+index+'-'+part] = labels['armourPart.'+part];
  labels['heroExtra-'+index+'-magicalWeapon'] = 'Magical weapon';
  labels['heroExtra-'+index+'-attackDieBonus'] = 'Weapon: bonus to each attack die';
  labels['heroExtra-'+index+'-spellDamageBonus'] = 'Extra damage per damaging spell';
}
for (let index=0;index<6;index++) labels['guardArrival-'+index] = 'Guard arrival #'+(index+1);
export default {
  "battlesim690.opponent.attack": "Attack dice",
  "battlesim690.opponent.threshold": "Enemy hit threshold",
  "battlesim690.opponent.defence": "Defence",
  "battlesim690.opponent.health": "Health",

  ...Object.fromEntries(Object.entries(valley).map(([key,value]) => [key.replace('battlesim689.','battlesim690.'),value])),
  ...Object.fromEntries(Object.entries(labels).map(([key,value]) => ['battlesim690.'+key,value])),
};

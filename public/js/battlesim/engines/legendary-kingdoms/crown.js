import { CROWN_ROSTER } from './crown-roster.js';
import { legendaryInteger, legendarySkill } from './character.js';
import { startLegendaryFight, legendaryEntryDamage } from './combat.js';
import { legendaryArmourParts } from './equipment.js';

const victories = {
  5:861,22:1165,33:261,47:877,82:1026,89:180,94:630,114:1011,130:364,136:375,
  182:568,186:824,198:1136,224:745,240:588,243:746,254:657,256:884,265:415,
  270:476,318:788,350:87,351:439,364:873,370:940,381:504,399:1021,417:11,
  421:622,423:752,437:559,438:213,447:175,468:817,469:262,477:142,496:342,
  505:751,506:692,543:588,546:76,564:432,571:551,574:639,596:290,600:337,
  611:24,621:431,626:823,631:809,643:798,655:256,691:633,695:1038,709:327,
  738:624,740:993,762:57,777:167,824:186,834:896,847:1186,870:68,880:295,
  905:301,911:519,931:1167,932:561,940:770,949:981,954:578,970:259,980:219,
  992:429,1023:536,1037:139,1072:1174,1126:522,1139:390,1146:624,1165:234,
  1175:948,1185:833,1191:1054,1193:99,
};

const options = {
  47:{hero:'jessica',loss:620},82:{spellsForbidden:true,noShield:true,excludeTwoHanded:true},89:{team:'pursuit',loss:780},
  114:{borrowedWeapon:true,loss:760},
  182:{winGroups:[[0],[1,2,3]]},186:{flee:359},224:{partyFirst:false,distinctRoundRecipients:true},
  240:{loss:832},
  370:{hero:'jessica',loss:566,capturedEquipment:'unarmed',spellsForbidden:true},
  399:{pickupWeapon:{enemyIndex:1,weaponBonus:3,attackDieBonus:1,magicalWeapon:true}},
  438:{team:'assassination',loss:330},468:{team:'not-holding-doors'},
  477:{team:'rescue',loss:594},496:{winGroups:[[0]],stopRound:3,stop:703},
  506:{playerTurnLimit:1,playerTurnLimitDestination:443},543:{loss:832},564:{undamagedFailure:946},
  571:{team:'katherine',loss:551},574:{partyFirst:false},596:{flee:504},
  621:{grappleEscape:true},
  631:{team:'ladders',loss:194,nonfatalLossHealth:1,halveSilverOnLoss:true},
  643:{hero:'jessica',loss:551},655:{stopRound:6,stop:1014},
  691:{hero:'tiquon',loss:228,weaponAttacksForbidden:true,rechargeSpellsAtRoundEnd:5},695:{locationBattle:'walkway',escapeDestination:627},
  762:{locationBattle:'pit',lossWhenZoneEmpty:'pool',loss:1086},777:{stopRound:3,stop:676},
  834:{team:'stewart',loss:896},847:{partyFirst:false},880:{team:'melee'},
  931:{endRoundPartyDamage:1,excludedProfiles:['jessica']},
  940:{hero:'jessica',loss:59,companion:{name:'Sar Wilmot',attack:8}},
  949:{companion:{name:'Prince Robyn',attack:5}},
  970:{team:'montague',loss:541},
  1072:{solo:true,loss:484},
  1175:{loss:18,armourErosion:true},
  1191:{hero:'jessica',loss:314,capturedEquipment:'knife',spellsForbidden:true},
};

export const CROWN_FIGHTS = Object.freeze(Object.entries(victories).map(([id, win]) => {
  const section = Number(id);
  return Object.freeze({ section, win, ...options[section],
    enemies: Object.freeze(CROWN_ROSTER.filter(enemy => enemy.section === section)) });
}).sort((a,b) => a.section-b.section));

export function startCrownFight(party, section, { participants, codes = [], ogreVisits = 0,
  defeatedEnemies = [], vesselType, trappedHero, entryDamageHero, entryDamageAlreadyApplied = false,
  skipFirstEnemyTurn = false, wizardWounded = false, titanEyesHit = false,
  guardApproach = 'ordinary', heroArrivalOrder, guardArrivalOrder, assassinationSuccesses = 0,
  rooftopAssassin, boyFreed, spareBryce = false, armourParts, grappleRolls, freeHero, silver,
  heroZones, pitVictim, abbessSlain = false, goddessCaress = false, controlledMember } = {}) {
  legendaryInteger(section, 1);
  const battle = CROWN_FIGHTS.find(fight => fight.section === section);
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
    (defeatedEnemies.length && ![136,911].includes(section)))
    throw new RangeError('Choose only opponents already defeated on this approach');
  if (section === 136 && defeatedEnemies.some(name => !['Sir Walter','Sar Lidia'].includes(name)))
    throw new RangeError('Only Sir Walter and Sar Lidia can have been defeated on this approach');
  const enemies = battle.enemies.filter(enemy => !defeatedEnemies.includes(enemy.name) &&
    !(section === 738 && ((enemy.name === 'Sly Ogre' && ogreVisits === 0) ||
      (enemy.name === 'Wild Ogre' && ogreVisits < 2))) &&
    !(section === 880 && ((codes.includes('B3') && enemy.name === 'Flanking Rioters') ||
      (codes.includes('B4') && enemy.name === 'Angry Rioters'))) &&
    !(section === 94 && guardApproach === 'assassination' &&
      assassinationSuccesses >= ({'Lief of Joria':2,'Robyn Spyre':4,'Krea Brocas':6,'Quinn Marshall':8}[enemy.name] ?? Infinity)))
    .map(enemy => ({ ...enemy }));
  const { enemies: unused, ...rules } = battle;
  rules.healingPotionAction = true;
  if (typeof goddessCaress !== 'boolean') throw new RangeError('Choose whether the goddess caressed the party');
  if (section === 399 && controlledMember !== undefined) {
    if (!selected.includes(controlledMember) || selected.length < 2)
      throw new RangeError('Choose the controlled hero from a party with other living heroes');
    rules.controlledMember = controlledMember;rules.controllerIndex = 0;
    enemies.push({name:party[controlledMember].name,attack:legendarySkill(party[controlledMember],'fighting'),
      threshold:4,defence:4,health:party[controlledMember].health,attackType:'dice',partyMember:controlledMember});
  }
  if (typeof abbessSlain !== 'boolean') throw new RangeError('Choose whether the Abbess was already slain');
  if (section === 469 && party.some((hero,index) => hero.health > 0 && !selected.includes(index))) rules.loss = 760;
  if (section === 695) {
    if (!Array.isArray(heroZones) || heroZones.length !== party.length ||
        selected.some(index => !['walkway','pool'].includes(heroZones[index])))
      throw new RangeError('Choose whether each participating hero is on the walkway or in the pool');
    rules.initialZones = [...heroZones];
  }
  if (section === 762) {
    if (!selected.includes(pitVictim)) throw new RangeError('Choose the hero who fell into the sewer pit');
    rules.initialZones = party.map((_,index) => index === pitVictim ? 'pool' : 'outside');
  }
  if (rules.halveSilverOnLoss) rules.startingSilver = legendaryInteger(silver);
  if (section === 621) {
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
  if (section === 468) {
    const doorHolders = party.flatMap((hero,index) => hero.health > 0 && !selected.includes(index) ? [index] : []);
    if (![1,2].includes(selected.length) || doorHolders.length + selected.length !== 4)
      throw new RangeError('Assign two or three of the four heroes to hold the doors after the skill check');
    rules.defeatOnLoss = doorHolders;
  }
  if (typeof spareBryce !== 'boolean') throw new RangeError('Choose whether to spare Sir Bryce');
  let grappledTasha;
  if (section === 1185) {
    if (typeof boyFreed !== 'boolean') throw new RangeError('Choose the result of the rescue check');
    grappledTasha = selected.find(index => party[index].profileId === 'tasha');
    if (grappledTasha === undefined) throw new RangeError('Tasha must participate in the rescue');
    if (!boyFreed) {
      rules.disabledParticipants = [grappledTasha];
      rules.winGroups = [[1,2,3]];
      rules.defeatOnVictory = [0];
    }
  }
  if (section === 240 && rooftopAssassin !== undefined) {
    if (!selected.includes(rooftopAssassin)) throw new RangeError('Choose the assassin from the participating party');
    rules.heroArrivalRounds = party.map((_, index) => index === rooftopAssassin ? 1 : 2);
  }
  if (section === 94) {
    if (!['ordinary','walls','basement','assassination'].includes(guardApproach))
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
      for (const enemy of enemies) enemy.arrivalRound = enemy.name === 'Sir Barda' ? 1 : 2;
    }
  }
  if ([entryDamageAlreadyApplied,skipFirstEnemyTurn,wizardWounded,titanEyesHit].some(value => typeof value !== 'boolean'))
    throw new RangeError('Choose explicit entry-wound and surprise options');
  if (section === 932) rules.skipFirstEnemyTurn = skipFirstEnemyTurn;
  if (section === 182) rules.thresholdReactions = [{ enemyIndex:1,
    checks:[{index:0,below:20},{index:1,below:10}], hits:3, recipients:2, noArmour:true }];
  if (section === 611) rules.thresholdReactions = [{ enemyIndex:0,
    checks:[{index:0,atMost:25}], hits:4, recipients:2, noArmour:true }];
  if (section === 1146) {
    const lowest = Math.min(...selected.map(index => legendarySkill(party[index], 'survival')));
    const candidates = selected.filter(index => legendarySkill(party[index], 'survival') === lowest);
    trappedHero ??= candidates.length === 1 ? candidates[0] : undefined;
    if (!candidates.includes(trappedHero)) throw new RangeError('Choose the trapped hero with the lowest Survival');
    rules.disabledParticipants = [trappedHero];
  }
  if (section === 1193) {
    if (!['cog','carrack'].includes(vesselType)) throw new RangeError('Choose the pirate ship being boarded');
    rules.win = vesselType === 'cog' ? 704 : 99;
  }
  for (const enemy of enemies) {
    enemy.maxHealth = enemy.health;
    if (section === 399 && enemy.name === 'Narakath') {
      enemy.magicOnly = true;
      if (!goddessCaress) enemy.spellPlan = {mode:'round',entries:[
        {min:1,max:1,name:'Vulnerability',effects:[{type:'vulnerabilityTarget',attackerIndex:1,threshold:2}]},
        {min:2,max:2,name:'Dazing Lights',effects:[{type:'setDefence',value:6}]},
        {min:3,max:3,name:'Stingtail Rune',effects:[{type:'damageParty',hits:3}]},
      ],fallback:{name:'Spectral Dagger',effects:[{type:'ordinary'}]}};
    }
    if (section === 469 && enemy.name === 'The Abbess') {
      enemy.weaponGuard = {indices:[0,1,2,3],minimum:1};
      enemy.spellPlan = {mode:'roll',entries:[
        {min:1,max:2,name:'Tendrils of Terror',effects:[{type:'stunStrongest',count:2}]},
        {min:3,max:4,name:'Bolt of Sacrifice',effects:[{type:'sacrificeOthers'}]},
        {min:5,max:5,name:'Bloody Restoration',effects:[{type:'healOthers',amount:3}]},
        {min:6,max:6,name:'Manic Stabbing',effects:[{type:'weaponOpening'},{type:'ordinary'}]},
      ]};
    }
    if (section === 695) enemy.zone = enemy.name === 'Tentacled Horror' ? 'pool' : 'walkwayOrPool';
    if (section === 762) { enemy.zone = 'pool';enemy.attackEveryoneInZone = true;enemy.outsideSpellsAllowed = true; }
    if (section === 114) enemy.spellPlan = {
      mode:'roll',entries:[
        {min:1,max:4,name:'Claws',effects:[{type:'ordinary'}]},
        {min:5,max:6,name:'Burning Blood',effects:[{type:'damageParty',hits:2,unpreventable:true},
          {type:'halveFightingNextTurn'}]},
      ],
    };
    if (section === 954 && spareBryce && enemy.name === 'Sir Bryce') {
      enemy.nonlethal = true;enemy.spellTargetForbidden = true;
    }
    if (section === 949 && enemy.name === 'Gareth Mulgate') {
      enemy.weaponGuard = {indices:[0,1,2,3],minimum:2};
      enemy.undamagedAttack = {hits:3};
    }
    if (section === 1185 && !boyFreed) {
      if (enemy.name === 'Lead Thug') { enemy.inactive = true;enemy.untargetable = true; }
      if (enemy.name === 'Fast Thug') enemy.forcedDamage = {hits:4,forcedMember:grappledTasha};
    }
    if (section === 94 && enemy.name === 'Robyn Spyre') enemy.spellPlan = {
      mode:'round',entries:[
        {min:1,max:1,name:'Poison Spray',effects:[{type:'attack',count:5,recipients:2}]},
        {min:2,max:2,name:'Ice Bolt',effects:[{type:'attack',count:8}]},
        {min:3,max:3,name:'Wither',effects:[{type:'damageParty',hits:1,noArmour:true}]},
      ],fallback:{name:'Attack',effects:[{type:'ordinary'}]},
    };
    if (section === 543 && wizardWounded) enemy.health -= 3;
    if (section === 318) {
      enemy.retaliationDamage = 1;
      if (titanEyesHit) { enemy.health -= 5;enemy.threshold = 5;enemy.automaticDamage = 0; }
    }
    if (section === 417) enemy.counterattack = true;
    if (section === 611) enemy.attacksPerTurn = 2;
    if (section === 626) { enemy.attacksPerTurn = 2;enemy.undamagedHeroAura = 2; }
    if (section === 240 && enemy.name === 'Keraknorn the Wise')
      enemy.weaponGuard = {indices:[1],minimum:1};
    if (section === 33 && enemy.name === 'Roof Goblins') {
      enemy.weaponGuard = { indices: [1], minimum: 1 };
      enemy.automaticDamageGuard = 1;
    }
    if (section === 243 && /Archer/.test(enemy.name)) {
      enemy.weaponGuard = { indices: [0,1,2], minimum: 2 };
      enemy.undamagedAttack = { hits: 3 };
    }
    if ([265,546,980].includes(section) && /Archers/.test(enemy.name))
      enemy.undamagedAttack = { hits: 2, recipients: 2, noArmour: true };
    if ([600,1165].includes(section) && /Archer/.test(enemy.name)) enemy.undamagedAttack = { hits: 3 };
    if (section === 350) enemy.extraDamageOnSix = 1;
    if (section === 351 && enemy.name === 'Lord Luthor Swan') enemy.weaponGuard = { indices: [0], minimum: 1 };
    if (section === 421) enemy.extraAttacksOnTriple = true;
    if (section === 447) enemy.halveAttackAtHalfHealth = true;
    if (section === 1193 && enemy.name === 'Pirate Netter') enemy.netWhileOthersAlive = true;
    if (section === 1139) enemy.iceBoltDefence = 2;
    if (section === 1146) enemy.beforeAttackDamage = { hits: 1, forcedMember: trappedHero, unpreventable: true };
    if (section === 1126 && enemy.name === 'Hell Drone') enemy.endRoundPartyDamage = 1;
    if (section === 1126 && enemy.name === 'Shaddish Ooze') enemy.ignoreArmour = true;
    if ([254,905].includes(section)) enemy.spellPlan = {
      mode:'roll',afterAttack:true,entries:[
        {min:1,max:2,name:section===254?'Invigorate':'Soothing Touch',effects:[{type:'healSelf',amount:section===254?8:5}]},
        {min:3,max:4,name:'Stingtail Rune',effects:[{type:'damageParty',hits:3}]},
        {min:5,max:6,name:'Ice Bolt',effects:[{type:'attack',count:8}]},
      ],
    };
    if (section === 381 && enemy.name === 'Skeleton') enemy.spellPlan = {
      mode:'roll',entries:[
        {min:1,max:2,name:'Deathly Armour',effects:[{type:'setDefence',value:6}]},
        {min:3,max:4,name:'Poison Stream',effects:[{type:'attack',count:5,recipients:2}]},
        {min:5,max:6,name:'Orb of Annihilation',effects:[{type:'attack',count:13}]},
      ],
    };
    if (section === 543 || (section === 240 && enemy.name === 'Keraknorn the Wise')) enemy.spellPlan = {
      mode:'roll',entries:[
        {min:1,max:2,name:'Ice Bolt',effects:[{type:'attack',count:8}]},
        {min:3,max:5,name:'Flame Jet',effects:[{type:'attack',count:5,recipients:3}]},
        {min:6,max:6,name:'Soothing Touch',effects:[{type:'healSelf',amount:5,
          ...(section === 240 ? {maximum:11,rerollIfFull:true} : {})}]},
      ],
    };
    if (section === 740) enemy.spellPlan = {
      mode:'roll',entries:[
        {min:1,max:4,name:'Bite',effects:[{type:'ordinary'}]},
        {min:5,max:6,name:'Poison Gas',effects:[{type:'damage',hits:3,recipients:2,noArmour:true}]},
      ],
    };
    if (section === 691) enemy.spellPlan = {
      mode:'roll',entries:[
        {min:1,max:2,name:'Ice Bolt',effects:[{type:'attack',count:8}]},
        {min:3,max:5,name:'Flame Jet',effects:[{type:'attack',count:5}]},
        {min:6,max:6,name:'Recharge',effects:[{type:'skip'}]},
      ],
    };
  }
  let fight = startLegendaryFight(party, enemies, rules, selected);
  if (section === 469 && abbessSlain) fight.enemies.find(enemy => enemy.name === 'The Abbess').health = 0;
  if (section === 762 && !entryDamageAlreadyApplied) fight = legendaryEntryDamage(fight, [pitVictim], 2);
  if (rules.grappleEscape && !rules.initialGrappled.length) {
    fight.status = 'won';fight.phase = 'ended';fight.destination = rules.win;
  }
  if (!entryDamageAlreadyApplied && [256,931,1072].includes(section)) {
    if (section === 256 && !selected.includes(entryDamageHero)) throw new RangeError('Choose the hero clawed on entry');
    fight = legendaryEntryDamage(fight, section === 931 ? selected : [section === 256 ? entryDamageHero : selected[0]], section === 1072 ? 1 : 2);
  }
  return fight;
}

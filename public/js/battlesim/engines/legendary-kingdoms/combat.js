import { legendaryInteger, legendaryPool, legendaryAttack, legendaryDie, legendarySkill,
  legendaryHeal, validateLegendaryCharacter } from './character.js';
import { drainLegendarySpell } from './spells.js';
import { applyLegendaryEndRound, applyLegendaryPartyEnd } from './effects.js';
import { activeLegendaryEnemy, planLegendaryEnemy } from './enemy-actions.js';
import { protectLegendaryHero } from './protection.js';
import { requireLegendaryTarget, applyLegendaryOpponentDamage } from './encounter.js';
import { resolveLegendaryEnemySpell } from './enemy-spells.js';
import { legendaryPlayerReactions, queueLegendaryReactions, resumeLegendaryPlayer } from './reactions.js';
import { legendaryCombatHero, restoreLegendaryCombatGear, erodeLegendaryArmour } from './equipment.js';
import { legendaryCanReach } from './locations.js';
import { VALLEY_SETTINGS } from './valley-roster.js';
import { CROWN_SETTINGS } from './crown-roster.js';

function enemyValid(enemy) {
  if (!enemy || typeof enemy.name !== 'string' || !enemy.name.trim())
    throw new RangeError('Invalid Legendary Kingdoms opponent');
  if (enemy.attackType !== 'none' && enemy.attackType !== 'special') {
    legendaryInteger(enemy.attack);
    legendaryInteger(enemy.threshold, 1);
  } else if (enemy.attack !== null || enemy.threshold !== null)
    throw new RangeError('Nonnumeric attacks must retain their source type');
  legendaryInteger(enemy.defence, 1);
  legendaryInteger(enemy.health);
  if (enemy.automaticDamage !== undefined) legendaryInteger(enemy.automaticDamage);
  if (enemy.extraDamageOnSix !== undefined) legendaryInteger(enemy.extraDamageOnSix);
  if (enemy.attacksPerTurn !== undefined) legendaryInteger(enemy.attacksPerTurn, 1, 2);
  if (enemy.endRoundPartyDamage !== undefined) legendaryInteger(enemy.endRoundPartyDamage, 1);
  if (enemy.beforeAttackDamage) {
    legendaryInteger(enemy.beforeAttackDamage.hits, 1);
    legendaryInteger(enemy.beforeAttackDamage.forcedMember);
  }
  for (const key of ['extraAttacksOnTriple', 'netWhileOthersAlive', 'halveAttackAtHalfHealth'])
    if (enemy[key] !== undefined && typeof enemy[key] !== 'boolean') throw new RangeError('Invalid opponent rule');
  if (enemy.undamagedAttack) {
    legendaryInteger(enemy.undamagedAttack.hits, 1);
    legendaryInteger(enemy.undamagedAttack.recipients ?? 1, 1, 2);
    if (enemy.undamagedAttack.noArmour !== undefined && typeof enemy.undamagedAttack.noArmour !== 'boolean')
      throw new RangeError('Invalid bow armour rule');
  }
  return enemy;
}

function living(fight) {
  return fight.participants.filter(index => fight.party[index].health > 0 &&
    !(fight.rules.controlledMember === index && fight.enemies[fight.rules.controllerIndex].health > 0));
}

export function legendaryCanAct(fight, index) {
  return fight.status === 'active' && fight.phase === 'player' && living(fight).includes(index) &&
    !fight.acted.includes(index) && fight.stunnedRound?.[index] !== fight.round &&
    (fight.rules.heroArrivalRounds?.[index] ?? 1) <= fight.round &&
    !fight.grappled?.includes(index) &&
    !fight.rules.disabledParticipants?.includes(index);
}

export function legendaryCompanionCanAct(fight) {
  return fight.status === 'active' && fight.phase === 'player' && !!fight.companion &&
    !fight.companion.injured && fight.companion.actedRound !== fight.round;
}

export function legendaryCompanionAttack(input, targetIndex, roll) {
  const fight = requireActive(input, 'player');
  if (!legendaryCompanionCanAct(fight) || !Number.isInteger(targetIndex) ||
      !fight.enemies[targetIndex] || !activeLegendaryEnemy(fight, targetIndex))
    throw new RangeError('Choose a living opponent for the available companion');
  requireLegendaryTarget(fight, null, targetIndex, false, true, {magicalWeapon:false});
  const enemy = fight.enemies[targetIndex];
  const attack = legendaryPool(fight.companion.attack, fight.playerHitThreshold ?? enemy.defence, roll);
  const damage = Math.min(enemy.health, attack.successes);
  enemy.health -= damage;
  fight.roundEnemyDamage[targetIndex] += damage;
  if (fight.rules.grappleEscape && damage > 0 && fight.enemies[targetIndex].health === 0)
    fight.releasesAvailable++;
  applyLegendaryOpponentDamage(fight, targetIndex);
  fight.companion.actedRound = fight.round;
  fight.roundStarted = true;
  fight.roundAttacks++;
  record(fight, {type:'companionAttack',targetIndex,dice:attack.dice,damage});
  finishPlayerAction(fight, roll);
  return fight;
}

function noteEnemyDamage(fight, targetIndex, memberIndex, damage) {
  if (damage > 0 && fight.rules.special === 'fastilon' && !fight.roundEnemyDamage[targetIndex]) {
    fight.stunnedRound[memberIndex] = fight.round + VALLEY_SETTINGS.fastilon.stunRounds;
    record(fight, { type: 'stunned', memberIndex, stunnedRound: fight.round + VALLEY_SETTINGS.fastilon.stunRounds });
  }
  fight.roundEnemyDamage[targetIndex] += damage;
  if (fight.enemies[targetIndex].partyMember !== undefined)
    fight.party[fight.enemies[targetIndex].partyMember].health = fight.enemies[targetIndex].health;
  if (fight.rules.grappleEscape && damage > 0 && fight.enemies[targetIndex].health === 0)
    fight.releasesAvailable++;
  applyLegendaryOpponentDamage(fight, targetIndex);
  if (fight.rules.cursedMember !== undefined) fight.party[fight.rules.cursedMember].health = fight.enemies[0].health;
}

function record(fight, entry) {
  fight.log = [...fight.log.slice(-59), { round: fight.round, ...entry }];
}

function conclude(fight) {
  if (!living(fight).length) {
    fight.status = 'lost';
    fight.destination = fight.rules.loss ?? null;
    for (const index of fight.rules.defeatOnLoss ?? []) fight.party[index].health = 0;
    if (fight.rules.nonfatalLossHealth) {
      for (const index of fight.participants)
        fight.party[index].health = Math.min(fight.rules.nonfatalLossHealth, fight.party[index].maxHealth);
    }
    if (fight.rules.halveSilverOnLoss) {
      const previous = fight.silver;
      fight.silver = Math.floor(previous / 2);
      record(fight, {type:'silverRobbed',previous,remaining:fight.silver});
    }
  } else if (fight.rules.lossWhenZoneEmpty && !living(fight).some(index => fight.zones[index] === fight.rules.lossWhenZoneEmpty)) {
    fight.status = 'failed';fight.destination = fight.rules.loss ?? null;
  } else if (fight.reactionResume) return false;
  else if (fight.rules.grappleEscape ? living(fight).every(index => !fight.grappled.includes(index)) :
      fight.rules.winGroups ? fight.rules.winGroups.some(group => group.every(index => fight.enemies[index].health === 0)) :
      fight.enemies.every(enemy => enemy.health === 0 ||
        (enemy.partyMember !== undefined && fight.enemies[fight.rules.controllerIndex].health === 0))) {
    fight.status = 'won';
    fight.destination = fight.rules.win ?? null;
    for (const index of fight.rules.defeatOnVictory ?? []) fight.enemies[index].health = 0;
    if (fight.rules.knockout && fight.rules.cursedMember !== undefined) {
      const hero=fight.party[fight.rules.cursedMember];
      hero.health=Math.min(VALLEY_SETTINGS.cursed.knockoutHealth,hero.maxHealth);
    }
  } else return false;
  fight.phase = 'ended';
  fight.pending = null;
  delete fight.reactionResume;
  if (fight.status==='won' && fight.rules.special==='guardWeapon') {
    for (const [index,armed] of fight.guardWeapons.entries()) if (armed) {
      fight.party[index].armed=true;
      fight.party[index].weaponBonus=Math.max(fight.party[index].weaponBonus??0,VALLEY_SETTINGS.guardWeaponBonus);
    }
  }
  fight.party.forEach(hero => { hero.invulnerable = false; });
  return true;
}

function requireActive(input, phase) {
  if (!input || input.rulesVersion !== 1 || input.status !== 'active' || input.phase !== phase)
    throw new RangeError('This action is not available in the current fight');
  return structuredClone(input);
}

function enterPlayerTurn(fight) {
  fight.phase = 'player';
  fight.acted = [];
  fight.roundEnemyDamage = fight.enemies.map(() => 0);
  fight.roundAttacks = 0;
  fight.roundPartyDamage = 0;
  if (living(fight).every(index => !legendaryCanAct(fight, index)) && !legendaryCompanionCanAct(fight)) {
    record(fight, { type: 'stunnedPartyTurn' });
    enterEnemyTurn(fight);
  }
}

function enterEnemyTurn(fight) {
  fight.phase = 'enemy';
  fight.enemyCursor = 0;
  fight.enemyActions = [];
  fight.enemyRecipients = {};
  if (fight.enemies.some(enemy => enemy.undamagedHeroAura)) fight.enemyHeroDamage = {};
  if (fight.rules.distinctRoundRecipients) fight.roundRecipients = [];
  if (fight.enemies.some(enemy => enemy.spellPlan)) fight.enemyRecipientGroups = {};
  fight.playerHitThreshold = null;
  if (fight.enemies.some(enemy => enemy.extraAttacksOnTriple)) fight.tripleAttackCounts = {};
}

function finishPlayerAction(fight, roll) {
  if (conclude(fight)) return;
  if (fight.releasesAvailable > 0 && living(fight).some(index => fight.grappled?.includes(index))) {
    fight.phase = 'release';
    return;
  }
  if (living(fight).every(index => !legendaryCanAct(fight, index)) && !legendaryCompanionCanAct(fight)) {
    applyLegendaryPartyEnd(fight);
    if (conclude(fight)) return;
    if (fight.rules.special === 'jungle' && !fight.roundAttacks)
      throw new RangeError('At least one hero must attack the jungle each round');
    if (fight.rules.playerTurnLimit && fight.round >= fight.rules.playerTurnLimit) {
      fight.status = 'stopped';fight.phase = 'ended';fight.destination = fight.rules.playerTurnLimitDestination;
      fight.party.forEach(hero => { hero.invulnerable = false; });
      record(fight, { type: 'playerTurnDeadline' });
      return;
    }
    if (fight.rules.undamagedFailure && fight.enemies.some((enemy,index) => enemy.health > 0 && !fight.roundEnemyDamage[index])) {
      fight.status = 'failed';fight.phase = 'ended';fight.destination = fight.rules.undamagedFailure;
      fight.party.forEach(hero => { hero.invulnerable = false; });
      record(fight, { type: 'undamagedOpponentFailure' });
      return;
    }
    if (fight.rules.partyFirst && fight.rules.skipFirstEnemyTurn && fight.round === 1) {
      applyLegendaryEndRound(fight, roll);
      if (fight.status !== 'active' || conclude(fight) || stopAfterRound(fight)) return;
      fight.round++;fight.roundStarted = false;enterPlayerTurn(fight);
    } else if (fight.rules.partyFirst) enterEnemyTurn(fight);
    else {
      applyLegendaryEndRound(fight, roll);
      if (fight.status !== 'active' || conclude(fight)) return;
      if (stopAfterRound(fight)) return;
      fight.round++;
      fight.roundStarted = false;
      enterEnemyTurn(fight);
    }
  }
}

function finishEnemyTurn(fight, roll) {
  if (conclude(fight)) return;
  if (fight.rules.partyFirst) {
    applyLegendaryEndRound(fight, roll);
    if (fight.status !== 'active' || conclude(fight)) return;
  }
  fight.enemyPenalty = 0;
  if (fight.rules.partyFirst && stopAfterRound(fight)) return;
  if (fight.rules.partyFirst) { fight.round++; fight.roundStarted = false; }
  enterPlayerTurn(fight);
}

function stopAfterRound(fight) {
  if (!fight.rules.stopRound || fight.round < fight.rules.stopRound) return false;
  fight.status = 'stopped';
  fight.phase = 'ended';
  fight.destination = fight.rules.stop;
  fight.pending = null;
  fight.party.forEach(hero => { hero.invulnerable = false; });
  record(fight, { type: 'intervention', destination: fight.destination });
  return true;
}

export function startLegendaryFight(party, enemies, rules = {}, participants = party.map((_, i) => i)) {
  if (!Array.isArray(party) || !party.length || party.length > 4 ||
      !Array.isArray(enemies) || !enemies.length || !Array.isArray(participants) ||
      !participants.length || new Set(participants).size !== participants.length || new Set(party).size !== party.length)
    throw new RangeError('Invalid party or opponent selection');
  party.forEach(character => validateLegendaryCharacter(character));
  for (const index of participants) {
    legendaryInteger(index, 0, party.length - 1);
    validateLegendaryCharacter(party[index], true);
  }
  enemies.forEach(enemy => { enemyValid(enemy); legendaryInteger(enemy.health, 1); });
  const copiedRules = structuredClone({ partyFirst: true, ...rules });
  if (typeof copiedRules.partyFirst !== 'boolean') throw new RangeError('Invalid initiative');
  for (const key of ['win', 'loss', 'flee'])
    if (copiedRules[key] !== undefined && copiedRules[key] !== null) legendaryInteger(copiedRules[key], 1);
  if (copiedRules.stopRound !== undefined) {
    legendaryInteger(copiedRules.stopRound, 1);
    legendaryInteger(copiedRules.stop, 1);
  }
  if (copiedRules.nonfatalLossHealth !== undefined) legendaryInteger(copiedRules.nonfatalLossHealth, 1);
  if (copiedRules.halveSilverOnLoss) legendaryInteger(copiedRules.startingSilver);
  if (copiedRules.endRoundPartyDamage !== undefined) legendaryInteger(copiedRules.endRoundPartyDamage, 1);
  if (copiedRules.undamagedFailure !== undefined) legendaryInteger(copiedRules.undamagedFailure, 1);
  if (copiedRules.playerTurnLimit !== undefined) {
    legendaryInteger(copiedRules.playerTurnLimit, 1);
    legendaryInteger(copiedRules.playerTurnLimitDestination, 1);
  }
  if (copiedRules.winGroups) {
    if (!Array.isArray(copiedRules.winGroups) || !copiedRules.winGroups.length ||
        copiedRules.winGroups.some(group => !Array.isArray(group) || !group.length))
      throw new RangeError('Choose nonempty victory target groups');
    for (const group of copiedRules.winGroups) for (const index of group) legendaryInteger(index, 0, enemies.length - 1);
  }
  if (copiedRules.defeatOnVictory) {
    if (!Array.isArray(copiedRules.defeatOnVictory)) throw new RangeError('Choose opponents defeated with their guards');
    for (const index of copiedRules.defeatOnVictory) legendaryInteger(index, 0, enemies.length - 1);
  }
  if (copiedRules.defeatOnLoss) {
    if (!Array.isArray(copiedRules.defeatOnLoss)) throw new RangeError('Choose the doomed noncombatants');
    for (const index of copiedRules.defeatOnLoss) legendaryInteger(index, 0, party.length - 1);
  }
  if (copiedRules.disabledParticipants) {
    if (!Array.isArray(copiedRules.disabledParticipants) || copiedRules.disabledParticipants.some(index => !participants.includes(index)))
      throw new RangeError('Choose disabled heroes from the participating party');
  }
  if (copiedRules.grappleEscape && (!Array.isArray(copiedRules.initialGrappled) ||
      new Set(copiedRules.initialGrappled).size !== copiedRules.initialGrappled.length ||
      copiedRules.initialGrappled.some(index => !participants.includes(index))))
    throw new RangeError('Choose grappled heroes from the participating party');
  if (copiedRules.locationBattle && (!Array.isArray(copiedRules.initialZones) ||
      copiedRules.initialZones.length !== party.length || participants.some(index =>
        !['pool','walkway','outside'].includes(copiedRules.initialZones[index]))))
    throw new RangeError('Choose the location of each participating hero');
  if (copiedRules.companion) {
    if (typeof copiedRules.companion.name !== 'string' || !copiedRules.companion.name.trim())
      throw new RangeError('Name the temporary companion');
    legendaryInteger(copiedRules.companion.attack, 1);
  }
  if (copiedRules.heroArrivalRounds) {
    if (!Array.isArray(copiedRules.heroArrivalRounds) || copiedRules.heroArrivalRounds.length !== party.length)
      throw new RangeError('Choose an arrival round for each hero');
    copiedRules.heroArrivalRounds.forEach(round => legendaryInteger(round, 1));
  }
  const fight = {
    rulesVersion: 1, status: 'active', round: 1, party: structuredClone(party).map(hero=>({...hero,invulnerable:false})),
    enemies: structuredClone(enemies).map(enemy => enemy.halveAttackAtHalfHealth ?
      { ...enemy, initialHealth: enemy.health } : enemy), rules: copiedRules, participants: [...participants],
    pending: null, acted: [], enemyCursor: 0, log: [], destination: null,
    armourBonuses: party.map(() => 0), enemyPenalty: 0,
    roundEnemyDamage: enemies.map(() => 0), roundAttacks: 0,
    roundPartyDamage: 0, enemyActions: [], enemyRecipients: {}, stunnedRound: party.map(() => 0), fastilonSpell: 0,
    roundStarted: false,
    openingUsed: party.map(() => false), guardWeapons: party.map(() => false), guardWeaponsTaken: 0,
    ...(copiedRules.companion ? {companion:{...copiedRules.companion,injured:false,actedRound:0}} : {}),
    ...(copiedRules.grappleEscape ? {grappled:[...copiedRules.initialGrappled],releasesAvailable:0} : {}),
    ...(copiedRules.halveSilverOnLoss ? {silver:copiedRules.startingSilver} : {}),
    ...(copiedRules.locationBattle ? {zones:[...copiedRules.initialZones]} : {}),
  };
  if (fight.rules.partyFirst) enterPlayerTurn(fight);
  else enterEnemyTurn(fight);
  if (fight.rules.openingStrike) {
    const {enemyIndex,memberIndex}=fight.rules.openingStrike;
    legendaryInteger(enemyIndex,0,fight.enemies.length-1);
    if (!living(fight).includes(memberIndex)) throw new RangeError('Choose a living hero for the opening attack');
    const enemy=fight.enemies[enemyIndex];
    fight.phase='enemy';
    fight.openingStrike=true;
    fight.enemyActions=[{enemyIndex,count:enemy.attack,threshold:enemy.threshold,forcedMember:memberIndex,
      ...(enemy.automaticDamage ? {automaticDamage:enemy.automaticDamage} : {})}];
  }
  return fight;
}

export function legendaryEntryDamage(input, memberIndices, hits) {
  if (!input || input.rulesVersion !== 1 || input.status !== 'active' || input.round !== 1 ||
      input.roundStarted || input.acted.length || input.entryDamageApplied || !Array.isArray(memberIndices) ||
      !memberIndices.length || new Set(memberIndices).size !== memberIndices.length ||
      memberIndices.some(index => !living(input).includes(index)))
    throw new RangeError('Apply entry wounds once to the living participating heroes before the fight');
  legendaryInteger(hits, 1);
  const fight = structuredClone(input);
  for (const index of memberIndices) fight.party[index].health = Math.max(0, fight.party[index].health - hits);
  fight.entryDamageApplied = true;
  record(fight, { type: 'entryDamage', members: [...memberIndices], hits });
  if (!conclude(fight) && fight.phase === 'player') enterPlayerTurn(fight);
  return fight;
}

export function legendaryPlayerAttack(input, memberIndex, targetIndex, { focus = 0 } = {}, roll) {
  const fight = requireActive(input, 'player');
  if (fight.rules.weaponAttacksForbidden) throw new RangeError('Only spells can reach this opponent');
  legendaryInteger(memberIndex, 0, fight.party.length - 1);
  legendaryInteger(targetIndex, 0, fight.enemies.length - 1);
  if (!legendaryCanAct(fight, memberIndex) || !activeLegendaryEnemy(fight, targetIndex))
    throw new RangeError('Choose an available hero and living opponent');
  requireLegendaryTarget(fight, memberIndex, targetIndex);
  const options = { focus, excludeWeapon: !!fight.rules.excludeWeapon };
  if (fight.halfFightingRound === fight.round) options.diceDivisor = 2;
  fight.roundStarted = true;
  if (fight.rules.unarmed !== undefined) options.unarmed = !!fight.rules.unarmed;
  let hero=legendaryCombatHero(fight, memberIndex);
  if (fight.rules.rage) hero={...hero,skills:{...hero.skills,fighting:hero.skills.fighting+1}};
  if (fight.guardWeapons[memberIndex]) {hero={...hero,armed:true,weaponBonus:VALLEY_SETTINGS.guardWeaponBonus,stonecutterSword:false};options.excludeWeapon=false;options.unarmed=false;}
  if (fight.rules.excludeTwoHanded && hero.twoHanded) {options.excludeWeapon=true;options.unarmed=true;}
  if (fight.enemies[targetIndex].nonlethal) {options.excludeWeapon=true;options.unarmed=true;}
  const attack = legendaryAttack(hero, fight.playerHitThreshold ?? fight.enemies[targetIndex].defence, options, roll);
  const enemy = fight.enemies[targetIndex];
  const multiplier=hero.armed&&hero.stonecutterSword&&enemy.stony&&!options.excludeWeapon&&!options.unarmed?2:1;
  const damage = Math.min(enemy.health, attack.successes*multiplier);
  enemy.health -= damage;
  noteEnemyDamage(fight, targetIndex, memberIndex, damage);
  if (fight.round===1 && fight.rules.surpriseHero===memberIndex && targetIndex===0 && enemy.health>0) {
    const extra=legendaryAttack(hero,fight.playerHitThreshold??enemy.defence,options,roll);
    const extraDamage=Math.min(enemy.health,extra.successes*multiplier);
    enemy.health-=extraDamage;
    noteEnemyDamage(fight,targetIndex,memberIndex,extraDamage);
    record(fight,{type:'surpriseAttack',memberIndex,targetIndex,dice:extra.dice,damage:extraDamage});
  }
  if (fight.rules.special==='yuYan' && enemy.health>0) {
    const ally=legendaryPool(VALLEY_SETTINGS.yuYanAttack,enemy.defence,roll);
    const allyDamage=Math.min(enemy.health,ally.successes);
    enemy.health-=allyDamage;
    noteEnemyDamage(fight,targetIndex,memberIndex,allyDamage);
    record(fight,{type:'yuYanAttack',targetIndex,dice:ally.dice,damage:allyDamage});
  }
  fight.roundAttacks++;
  if (fight.rules.special === 'jungle') fight.party[memberIndex].health = Math.max(0, fight.party[memberIndex].health - VALLEY_SETTINGS.jungleAttackDamage);
  fight.acted.push(memberIndex);
  record(fight, { type: 'playerAttack', memberIndex, targetIndex, dice: attack.dice, damage });
  if (!queueLegendaryReactions(fight, legendaryPlayerReactions(fight, memberIndex, targetIndex, damage))) finishPlayerAction(fight, roll);
  return fight;
}

export function legendarySkipAttack(input, memberIndex, roll) {
  const fight = requireActive(input, 'player');
  if (!legendaryCanAct(fight, memberIndex))
    throw new RangeError('This hero has already acted or cannot act');
  fight.acted.push(memberIndex);
  record(fight, { type: 'skip', memberIndex });
  fight.roundStarted = true;
  finishPlayerAction(fight, roll);
  return fight;
}

export function legendaryReleaseHero(input, memberIndex, roll) {
  const fight = requireActive(input, 'release');
  if (!fight.rules.grappleEscape || fight.releasesAvailable < 1 ||
      !fight.grappled.includes(memberIndex) || !living(fight).includes(memberIndex))
    throw new RangeError('Choose a living grappled hero to free');
  fight.grappled = fight.grappled.filter(index => index !== memberIndex);
  fight.releasesAvailable--;
  fight.phase = 'player';
  record(fight, {type:'heroReleased',memberIndex});
  finishPlayerAction(fight, roll);
  return fight;
}

export function legendaryMoveHero(input, memberIndex, destination) {
  const fight = requireActive(input, 'player');
  if (!living(fight).includes(memberIndex)) throw new RangeError('Choose a living participating hero');
  const origin = fight.zones?.[memberIndex];
  if (fight.rules.locationBattle === 'pit') {
    if (origin !== 'outside' || destination !== 'pool') throw new RangeError('Heroes may only jump into this pit');
    fight.zones[memberIndex] = 'pool';
    fight.party[memberIndex] = protectLegendaryHero(fight.party[memberIndex], CROWN_SETTINGS.pit.moveDamage, {combat:false,attack:false}).character;
  } else if (fight.rules.locationBattle === 'walkway') {
    const blockers = fight.enemies.filter(enemy => destination === 'pool' ? enemy.zone === 'walkwayOrPool' : enemy.zone === 'pool');
    if (!['pool','walkway'].includes(destination) || destination === origin || blockers.some(enemy => enemy.health > 0))
      throw new RangeError('Defeat the creatures blocking this ladder movement');
    fight.zones[memberIndex] = destination;
  } else throw new RangeError('This fight has no location movement');
  record(fight, {type:'heroMoved',memberIndex,origin,destination});
  conclude(fight);
  return fight;
}

export function legendaryLeaveHorror(input) {
  const fight = requireActive(input, 'player');
  if (fight.rules.locationBattle !== 'walkway' || living(fight).some(index => fight.zones[index] !== 'walkway') ||
      fight.enemies.some(enemy => enemy.zone === 'walkwayOrPool' && enemy.health > 0) ||
      !fight.enemies.some(enemy => enemy.zone === 'pool' && enemy.health > 0))
    throw new RangeError('Clear the walkway and gather the living party there before leaving');
  fight.status = 'won';fight.phase = 'ended';fight.destination = fight.rules.escapeDestination;
  fight.party.forEach(hero => {hero.invulnerable = false;});
  record(fight, {type:'horrorLeftAlive'});
  return fight;
}

export function legendaryPlayerSpell(input, memberIndex, spellId, targets = [], roll, {opening=false,precombat=false}={}) {
  const fight = requireActive(input, 'player');
  if (!legendaryCanAct(fight, memberIndex) || fight.rules.spellsForbidden)
    throw new RangeError('This hero cannot cast a spell now');
  if (!Array.isArray(targets) || new Set(targets).size !== targets.length)
    throw new RangeError('Choose distinct spell targets');
  const caster = drainLegendarySpell(fight.party[memberIndex], spellId, 'combat');
  if (opening && (precombat || fight.rules.special!=='openingSpells' || fight.round!==1 || fight.acted.length || fight.openingUsed[memberIndex]))
    throw new RangeError('The opening spell bonus is only available before normal first-round actions');
  if (precombat && (!fight.rules.precombatSpells || fight.round!==1 || fight.acted.length))
    throw new RangeError('This encounter does not allow precombat casting now');
  const damagingSpells = ['iceBolt','poisonStream','unfailingStrike','sandstorm','orbOfAnnihilation','wither','stingtailRune','whipsnake'];
  if (fight.rules.damageSpellsForbidden && damagingSpells.includes(spellId))
    throw new RangeError('Damaging spells cannot be used for a nonfatal knockout');
  const supported = [...damagingSpells, 'armourOfHeaven', 'soothingTouch', 'dazingLights', 'vulnerability'];
  if (!supported.includes(spellId)) throw new RangeError('This combat spell requires an encounter-specific effect');
  if (['armourOfHeaven', 'soothingTouch'].includes(spellId)) {
    if (targets.length !== 1 || !living(fight).includes(targets[0]) ||
        (fight.rules.heroArrivalRounds?.[targets[0]] ?? 1) > fight.round)
      throw new RangeError('Choose a living participating hero present in this round');
  } else if (['iceBolt', 'unfailingStrike', 'poisonStream', 'orbOfAnnihilation', 'vulnerability', 'whipsnake'].includes(spellId)) {
    const required = ['poisonStream','whipsnake'].includes(spellId) ? 2 : 1;
    if (targets.length !== required || targets.some(index => !Number.isInteger(index) || !fight.enemies[index] || !activeLegendaryEnemy(fight, index)))
      throw new RangeError('Choose living opponents for the spell');
  } else if (targets.length) throw new RangeError('This spell does not need a target');
  fight.party[memberIndex] = caster;
  const reactions = [];
  if (!precombat) fight.roundStarted = true;
  if (spellId === 'armourOfHeaven') fight.armourBonuses[targets[0]] += 3;
  else if (spellId === 'soothingTouch') fight.party[targets[0]] = legendaryHeal(fight.party[targets[0]], 5);
  else if (spellId === 'dazingLights') fight.enemyPenalty++;
  else if (spellId === 'vulnerability') {
    requireLegendaryTarget(fight, memberIndex, targets[0], true, false);
    fight.enemies[targets[0]].defence = Math.max(1, fight.enemies[targets[0]].defence - 1);
  }
  else {
    const indices = ['sandstorm','wither','stingtailRune'].includes(spellId) ? fight.enemies.map((enemy,index) => activeLegendaryEnemy(fight,index) && !enemy.untargetable && !enemy.spellTargetForbidden && legendaryCanReach(fight,memberIndex,enemy,true) ? index : -1).filter(index => index >= 0) : targets;
    for (const targetIndex of indices) {
      if (!activeLegendaryEnemy(fight,targetIndex)) continue;
      requireLegendaryTarget(fight, memberIndex, targetIndex, true);
      const enemy = fight.enemies[targetIndex];
      const fixed = { unfailingStrike: 3, wither: 1, stingtailRune: 3, whipsnake: 2 }[spellId];
      const attack = fixed !== undefined ? { dice: [], successes: fixed } :
        legendaryPool(spellId === 'iceBolt' ? 8 : spellId === 'poisonStream' ? 5 : spellId === 'orbOfAnnihilation' ? 13 : 3,
          Math.max(1, (fight.playerHitThreshold ?? enemy.defence) -
            (caster.armed && !fight.rules.excludeWeapon ? caster.attackDieBonus ?? 0 : 0)), roll);
      const damage = Math.min(enemy.health, attack.successes + (attack.successes ? caster.spellDamageBonus ?? 0 : 0));
      enemy.health -= damage;
      if (spellId === 'whipsnake') enemy.nextTurnPenalty = (enemy.nextTurnPenalty ?? 0) + 1;
      if (spellId === 'iceBolt' && enemy.iceBoltDefence) enemy.defence = enemy.iceBoltDefence;
      noteEnemyDamage(fight, targetIndex, memberIndex, damage);
      record(fight, { type: 'spellAttack', spellId, memberIndex, targetIndex, dice: attack.dice, damage });
      reactions.push(...legendaryPlayerReactions(fight, memberIndex, targetIndex, damage));
    }
    fight.roundAttacks++;
  }
  record(fight, { type: 'cast', spellId, memberIndex, targets: [...targets] });
  if (opening) fight.openingUsed[memberIndex]=true;
  if (!opening && !precombat) fight.acted.push(memberIndex);
  if (!queueLegendaryReactions(fight, reactions)) {
    if (!opening && !precombat) finishPlayerAction(fight, roll);
    else conclude(fight);
  }
  return fight;
}

export function legendaryEnemyAttack(input, roll) {
  const fight = requireActive(input, 'enemy');
  if (fight.pendingChoice) throw new RangeError('Resolve the pending spell choice first');
  if (fight.pending) throw new RangeError('Assign the previous attack before rolling again');
  fight.roundStarted = true;
  if (!fight.enemyActions.length) {
    while (fight.enemyCursor < fight.enemies.length && !activeLegendaryEnemy(fight, fight.enemyCursor)) fight.enemyCursor++;
    if (fight.enemyCursor === fight.enemies.length) { finishEnemyTurn(fight, roll); return fight; }
    const enemyIndex = fight.enemyCursor++;
    const enemy = fight.enemies[enemyIndex];
    if (enemy.nextTurnPenalty !== undefined) {
      enemy.currentTurnPenalty = enemy.nextTurnPenalty;
      enemy.nextTurnPenalty = 0;
    }
    fight.enemyActions = planLegendaryEnemy(fight, enemyIndex, roll);
    if (!fight.enemyActions.length) {
      record(fight, { type: 'nonstandardEnemyTurn', enemyIndex });
      finishEnemyActions(fight, roll);
      return fight;
    }
  }
  let action = fight.enemyActions.shift();
  while (action?.forcedMember !== undefined && fight.party[action.forcedMember]?.health === 0)
    action = fight.enemyActions.shift();
  if (!action) { finishEnemyActions(fight, roll); return fight; }
  if (action.castSpell) {
    const spell = resolveLegendaryEnemySpell(fight, action.enemyIndex, roll);
    if (spell.repeat) {
      fight.enemyActions.unshift(action);
      return fight;
    }
    fight.enemyActions.unshift(...spell.actions);
    if (!fight.enemyActions.length) { finishEnemyActions(fight, roll); return fight; }
    action = fight.enemyActions.shift();
  }
  if (action.chooseStun || action.chooseVulnerability) {
    fight.pendingChoice = action;
    return fight;
  }
  const { enemyIndex } = action;
  if (fight.rules.distinctRoundRecipients && living(fight).every(index => fight.roundRecipients.includes(index))) {
    record(fight, { type: 'noEligibleRecipient', enemyIndex });
    finishEnemyActions(fight, roll);
    return fight;
  }
  const attack = action.hits !== undefined ? { dice: [], successes: action.hits } :
    legendaryPool(action.count, action.threshold + (fight.enemyPenalty ?? 0) +
      (action.turnPenalty ?? fight.enemies[enemyIndex].currentTurnPenalty ?? 0), roll);
  const automaticDamage = legendaryInteger(action.automaticDamage ?? 0);
  const enemy = fight.enemies[enemyIndex];
  const sixDamage = attack.dice.filter(die => die === 6).length * (enemy.extraDamageOnSix ?? 0);
  const hits = attack.successes + automaticDamage + sixDamage;
  if (enemy.extraAttacksOnTriple) {
    fight.tripleAttackCounts ??= {};
    const key = enemyIndex;
    const count = fight.tripleAttackCounts[key] = (fight.tripleAttackCounts[key] ?? 0) + 1;
    if (count < 3 && [1,2,3,4,5,6].some(die => attack.dice.filter(value => value === die).length === 3))
      fight.enemyActions.unshift({ ...action });
  }
  record(fight, { type: 'enemyAttack', enemyIndex, dice: attack.dice, hits,
    ...(automaticDamage ? {automaticDamage} : {}), ...(sixDamage ? {sixDamage} : {}) });
  if (hits > 0) fight.pending = { ...action, hits };
  else finishEnemyActions(fight, roll);
  return fight;
}

export function legendaryChooseStunned(input, indices, roll) {
  const fight = requireActive(input, 'enemy');
  const choice = fight.pendingChoice;
  const available = living(fight);
  if (!choice?.chooseStun || !Array.isArray(indices) || indices.length !== choice.count ||
      new Set(indices).size !== indices.length || indices.some(index => !available.includes(index)))
    throw new RangeError('Choose the required living heroes with the highest Fighting scores');
  const selectedMinimum = Math.min(...indices.map(index => legendarySkill(fight.party[index], 'fighting')));
  if (available.some(index => !indices.includes(index) && legendarySkill(fight.party[index], 'fighting') > selectedMinimum))
    throw new RangeError('Choose heroes with the highest Fighting scores; break ties as you wish');
  const stunnedRound = fight.round + (fight.rules.partyFirst ? 1 : 0);
  for (const index of indices) fight.stunnedRound[index] = stunnedRound;
  delete fight.pendingChoice;
  record(fight, {type:'heroesStunned',members:[...indices],stunnedRound});
  finishEnemyActions(fight, roll);
  return fight;
}

export function legendaryChooseVulnerable(input, memberIndex, roll) {
  const fight = requireActive(input, 'enemy');
  const choice = fight.pendingChoice;
  if (!choice?.chooseVulnerability || !choice.candidates.includes(memberIndex) || !living(fight).includes(memberIndex))
    throw new RangeError('Choose a living hero with the highest Armour score');
  const attacker = fight.enemies[choice.attackerIndex];
  attacker.forcedAttackMember = memberIndex;
  attacker.forcedAttackThreshold = choice.threshold;
  attacker.forcedAttackRound = fight.round;
  delete fight.pendingChoice;
  record(fight,{type:'vulnerabilityChosen',memberIndex});
  finishEnemyActions(fight, roll);
  return fight;
}

export function legendaryTakeFallenWeapon(input, memberIndex) {
  const fight = requireActive(input, 'player');
  const weapon = fight.rules.pickupWeapon;
  if (!weapon || fight.weaponTaken || !living(fight).includes(memberIndex) ||
      fight.enemies[weapon.enemyIndex]?.health !== 0)
    throw new RangeError('Defeat the weapon bearer before taking the fallen weapon');
  const hero = fight.party[memberIndex];
  Object.assign(hero,{armed:true,weaponBonus:weapon.weaponBonus,attackDieBonus:weapon.attackDieBonus,
    magicalWeapon:!!weapon.magicalWeapon,stonecutterSword:false,twoHanded:false});
  fight.weaponTaken = true;
  record(fight,{type:'fallenWeaponTaken',memberIndex});
  return fight;
}

function finishEnemyActions(fight, roll) {
  if (resumeLegendaryPlayer(fight)) { finishPlayerAction(fight, roll); return; }
  if (fight.pendingFlee && !fight.enemyActions.length) {
    fight.status='fled';
    fight.phase='ended';
    fight.destination=fight.pendingFlee;
    fight.pendingFlee=null;
    fight.party.forEach(hero=>{hero.invulnerable=false;});
    record(fight,{type:'flee'});
    return;
  }
  if (fight.openingStrike && !fight.enemyActions.length) {
    fight.openingStrike=false;
    enterPlayerTurn(fight);
    return;
  }
  if (!fight.enemyActions.length && fight.enemies.every((_,index) => index < fight.enemyCursor || !activeLegendaryEnemy(fight,index)))
    finishEnemyTurn(fight, roll);
}

export function legendaryAssignDamage(input, memberIndex, roll, { allowSameRecipient = false, armourSaveOrder } = {}) {
  const fight = requireActive(input, 'enemy');
  if (memberIndex === 'companion') {
    if (!fight.pending || !fight.companion || fight.companion.injured ||
        fight.pending.forcedMember !== undefined || fight.pending.unpreventable || fight.pending.stunOnly)
      throw new RangeError('The companion cannot intercept this damage');
    const {enemyIndex,hits} = fight.pending;
    fight.companion.injured = true;
    fight.pending = null;
    record(fight, {type:'companionInjured',enemyIndex,hits});
    finishEnemyActions(fight, roll);
    return fight;
  }
  if (!fight.pending || !living(fight).includes(memberIndex) ||
      (fight.rules.heroArrivalRounds?.[memberIndex] ?? 1) > fight.round)
    throw new RangeError('Choose a participating hero for the pending attack');
  const { enemyIndex, hits, noArmour, lifeSteal, distinct, forcedMember, unpreventable } = fight.pending;
  if (fight.pending.allowedMembers && !fight.pending.allowedMembers.includes(memberIndex))
    throw new RangeError('Choose a damage recipient fighting in the same location');
  if (forcedMember !== undefined && forcedMember !== memberIndex) throw new RangeError('This attack has a fixed recipient');
  if (fight.rules.distinctRoundRecipients && fight.roundRecipients.includes(memberIndex))
    throw new RangeError('Choose a hero who has not received an opponent attack this round');
  if (distinct && fight.enemyRecipients[enemyIndex] === memberIndex && !(allowSameRecipient && living(fight).length === 1))
    throw new RangeError('Choose a different recipient for the second attack');
  const groupKey = typeof fight.pending.distinctGroup === 'string' ? fight.pending.distinctGroup : enemyIndex;
  if (fight.pending.distinctGroup && fight.enemyRecipientGroups?.[groupKey]?.includes(memberIndex) &&
      !(allowSameRecipient && living(fight).filter(index =>
        (fight.rules.heroArrivalRounds?.[index] ?? 1) <= fight.round).length < fight.pending.requiredRecipients))
    throw new RangeError('Choose a different recipient for each attack in this spell');
  if (fight.pending.distinctGroup) {
    fight.enemyRecipientGroups ??= {};
    (fight.enemyRecipientGroups[groupKey] ??= []).push(memberIndex);
  }
  if (fight.rules.distinctRoundRecipients) fight.roundRecipients.push(memberIndex);
  if (fight.pending.stunOnly) {
    const stunnedRound = fight.round + (fight.rules.partyFirst ? 1 : 0);
    fight.stunnedRound[memberIndex] = stunnedRound;
    fight.pending = null;
    fight.enemyRecipients[enemyIndex] = memberIndex;
    record(fight, { type: 'stunned', enemyIndex, memberIndex, stunnedRound });
    finishEnemyActions(fight, roll);
    return fight;
  }
  const character = legendaryCombatHero(fight, memberIndex);
  const damage = protectLegendaryHero(character, hits, { armourBonus: fight.armourBonuses?.[memberIndex] ?? 0,
    noArmour: !!fight.rules.noArmour || !!noArmour, potionFirst: !fight.rules.escortBeforePotion,
    ...(unpreventable ? { combat: false, attack: false } : {}) }, roll);
  fight.party[memberIndex] = restoreLegendaryCombatGear(fight, memberIndex, damage.character);
  if (fight.rules.armourErosion) erodeLegendaryArmour(fight, memberIndex, damage, armourSaveOrder);
  fight.pending = null;
  fight.enemyRecipients[enemyIndex] = memberIndex;
  fight.roundPartyDamage += damage.lost;
  if (fight.enemies[enemyIndex].undamagedHeroAura && damage.lost > 0) {
    fight.enemyHeroDamage ??= {};
    (fight.enemyHeroDamage[enemyIndex] ??= {})[memberIndex] = true;
  }
  if (lifeSteal) fight.enemies[enemyIndex].health += damage.lost;
  record(fight, { type: 'damage', enemyIndex, memberIndex, dice: damage.dice, prevented: damage.prevented,
    lost: damage.lost, protection: damage.protection, skeletonLost: damage.skeletonLost });
  if (!conclude(fight)) finishEnemyActions(fight, roll);
  return fight;
}

export function legendaryFlee(input) {
  const fight = requireActive(input, 'player');
  if (fight.acted.length || !fight.rules.flee)
    throw new RangeError('Fleeing is only available at the start of a player turn when permitted');
  if (fight.rules.fleeAttack) {
    const enemyIndex=fight.enemies.findIndex((_,index)=>activeLegendaryEnemy(fight,index));
    if (enemyIndex<0) throw new RangeError('No enemy can make the escape attack');
    const enemy=fight.enemies[enemyIndex];
    fight.pendingFlee=fight.rules.flee;
    fight.phase='enemy';
    fight.enemyCursor=fight.enemies.length;
    fight.enemyActions=[{enemyIndex,count:enemy.attack,threshold:enemy.threshold,
      ...(enemy.automaticDamage ? {automaticDamage:enemy.automaticDamage} : {})}];
    fight.enemyRecipients={};
    record(fight,{type:'escapeAttack'});
    return fight;
  }
  fight.status = 'fled';
  fight.phase = 'ended';
  fight.destination = fight.rules.flee;
  fight.party.forEach(hero => { hero.invulnerable = false; });
  record(fight, { type: 'flee' });
  return fight;
}

export function legendaryDrinkPotion(input, memberIndex, type) {
  if (!input || input.status !== 'active' || input.rulesVersion !== 1 || !living(input).includes(memberIndex))
    throw new RangeError('Choose a living participant in an active battle');
  const fight = structuredClone(input);
  if (fight.rules.capturedEquipment) throw new RangeError('Your equipment is unavailable in this fight');
  const hero = fight.party[memberIndex];
  if (type === 'healing') {
    if (fight.rules.healingPotionAction && !legendaryCanAct(fight, memberIndex))
      throw new RangeError('Drinking a healing potion replaces this hero\'s attack or spell');
    if (!hero.healingPotions) throw new RangeError('No healing potion available');
    fight.party[memberIndex] = { ...legendaryHeal(hero, 5), healingPotions: hero.healingPotions - 1 };
  } else if (type === 'invulnerability') {
    if (fight.roundStarted || fight.pending || hero.invulnerable)
      throw new RangeError('Drink invulnerability potions only at the start of a combat round');
    if (!hero.invulnerabilityPotions) throw new RangeError('No invulnerability potion available');
    hero.invulnerabilityPotions--;
    hero.invulnerable = true;
  } else throw new RangeError('Unknown combat potion');
  record(fight, { type: 'potion', memberIndex, potion: type });
  if (type === 'healing' && fight.rules.healingPotionAction) {
    fight.acted.push(memberIndex);fight.roundStarted = true;finishPlayerAction(fight);
  }
  return fight;
}

export function legendaryTakeGuardWeapon(input, memberIndex) {
  if (!input || !['active','won'].includes(input.status) || input.rules.special!=='guardWeapon' || !living(input).includes(memberIndex))
    throw new RangeError('Choose a surviving weapons-team member');
  const fight=structuredClone(input);
  const available=fight.enemies.filter(enemy=>enemy.health===0).length-fight.guardWeaponsTaken;
  if (!available || fight.guardWeapons[memberIndex]) throw new RangeError('No new guard weapon is available for this hero');
  fight.guardWeapons[memberIndex]=true;
  fight.guardWeaponsTaken++;
  if (fight.status==='won') {
    fight.party[memberIndex].armed=true;
    fight.party[memberIndex].weaponBonus=Math.max(fight.party[memberIndex].weaponBonus??0,VALLEY_SETTINGS.guardWeaponBonus);
  }
  record(fight,{type:'guardWeapon',memberIndex});
  return fight;
}

export function legendaryTommulRewardAvailable(input) {
  const settings=VALLEY_SETTINGS.tommul;
  return !!(settings && input && input.rulesVersion===1 && input.rules.section===settings.section && input.round<=settings.lastRound &&
    !input.tommulRewardTaken && input.enemies[settings.enemyIndex].health===0 && living(input).length);
}

export function legendaryTommulReward(input, roll) {
  if (!legendaryTommulRewardAvailable(input))
    throw new RangeError('Tommul must be defeated before the guards arrive');
  const fight=structuredClone(input);
  const memberIndex=fight.participants[0];
  const hero=fight.party[memberIndex];
  const die=legendaryDie(roll);
  const improved=die>legendarySkill(hero,'fighting',{excludeWeapon:true});
  if (improved) hero.skills={...hero.skills,fighting:hero.skills.fighting+1};
  fight.tommulRewardTaken=true;
  record(fight,{type:'tommulReward',memberIndex,die,improved});
  return fight;
}

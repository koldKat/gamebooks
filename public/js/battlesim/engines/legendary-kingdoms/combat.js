import { legendaryInteger, legendaryPool, legendaryAttack, legendaryDie, legendarySkill,
  legendaryHeal, validateLegendaryCharacter } from './character.js';
import { drainLegendarySpell } from './spells.js';
import { applyLegendaryEndRound, applyLegendaryPartyEnd } from './effects.js';
import { activeLegendaryEnemy, planLegendaryEnemy } from './enemy-actions.js';
import { protectLegendaryHero } from './protection.js';

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
  return enemy;
}

function living(fight) {
  return fight.participants.filter(index => fight.party[index].health > 0);
}

export function legendaryCanAct(fight, index) {
  return fight.status === 'active' && fight.phase === 'player' && living(fight).includes(index) &&
    !fight.acted.includes(index) && fight.stunnedRound?.[index] !== fight.round;
}

function noteEnemyDamage(fight, targetIndex, memberIndex, damage) {
  if (damage > 0 && fight.rules.special === 'fastilon' && !fight.roundEnemyDamage[targetIndex]) {
    fight.stunnedRound[memberIndex] = fight.round + 1;
    record(fight, { type: 'stunned', memberIndex, stunnedRound: fight.round + 1 });
  }
  fight.roundEnemyDamage[targetIndex] += damage;
  if (fight.rules.cursedMember !== undefined) fight.party[fight.rules.cursedMember].health = fight.enemies[0].health;
}

function record(fight, entry) {
  fight.log = [...fight.log.slice(-59), { round: fight.round, ...entry }];
}

function conclude(fight) {
  if (!living(fight).length) {
    fight.status = 'lost';
    fight.destination = fight.rules.loss ?? null;
    if (fight.rules.nonfatalLossHealth) {
      for (const index of fight.participants)
        fight.party[index].health = Math.min(fight.rules.nonfatalLossHealth, fight.party[index].maxHealth);
    }
  } else if (fight.enemies.every(enemy => enemy.health === 0)) {
    fight.status = 'won';
    fight.destination = fight.rules.win ?? null;
    if (fight.rules.knockout && fight.rules.cursedMember !== undefined) {
      const hero=fight.party[fight.rules.cursedMember];
      hero.health=Math.min(2,hero.maxHealth);
    }
  } else return false;
  fight.phase = 'ended';
  fight.pending = null;
  if (fight.status==='won' && fight.rules.special==='guardWeapon') {
    for (const [index,armed] of fight.guardWeapons.entries()) if (armed) {
      fight.party[index].armed=true;
      fight.party[index].weaponBonus=Math.max(fight.party[index].weaponBonus??0,1);
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
  if (living(fight).every(index => fight.stunnedRound?.[index] === fight.round)) {
    record(fight, { type: 'stunnedPartyTurn' });
    enterEnemyTurn(fight);
  }
}

function enterEnemyTurn(fight) {
  fight.phase = 'enemy';
  fight.enemyCursor = 0;
  fight.enemyActions = [];
  fight.enemyRecipients = {};
  fight.playerHitThreshold = null;
}

function finishPlayerAction(fight) {
  if (conclude(fight)) return;
  if (living(fight).every(index => fight.acted.includes(index) || fight.stunnedRound?.[index] === fight.round)) {
    applyLegendaryPartyEnd(fight);
    if (conclude(fight)) return;
    if (fight.rules.special === 'jungle' && !fight.roundAttacks)
      throw new RangeError('At least one hero must attack the jungle each round');
    if (fight.rules.partyFirst) enterEnemyTurn(fight);
    else {
      applyLegendaryEndRound(fight);
      if (fight.status !== 'active' || conclude(fight)) return;
      if (stopAfterRound(fight)) return;
      fight.round++;
      fight.roundStarted = false;
      enterEnemyTurn(fight);
    }
  }
}

function finishEnemyTurn(fight) {
  if (conclude(fight)) return;
  if (fight.rules.partyFirst) {
    applyLegendaryEndRound(fight);
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
  const fight = {
    rulesVersion: 1, status: 'active', round: 1, party: structuredClone(party).map(hero=>({...hero,invulnerable:false})),
    enemies: structuredClone(enemies), rules: copiedRules, participants: [...participants],
    pending: null, acted: [], enemyCursor: 0, log: [], destination: null,
    armourBonuses: party.map(() => 0), enemyPenalty: 0,
    roundEnemyDamage: enemies.map(() => 0), roundAttacks: 0,
    roundPartyDamage: 0, enemyActions: [], enemyRecipients: {}, stunnedRound: party.map(() => 0), fastilonSpell: 0,
    roundStarted: false,
    openingUsed: party.map(() => false), guardWeapons: party.map(() => false), guardWeaponsTaken: 0,
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
    fight.enemyActions=[{enemyIndex,count:enemy.attack,threshold:enemy.threshold,forcedMember:memberIndex}];
  }
  return fight;
}

export function legendaryPlayerAttack(input, memberIndex, targetIndex, { focus = 0 } = {}, roll) {
  const fight = requireActive(input, 'player');
  legendaryInteger(memberIndex, 0, fight.party.length - 1);
  legendaryInteger(targetIndex, 0, fight.enemies.length - 1);
  if (!legendaryCanAct(fight, memberIndex) || !activeLegendaryEnemy(fight, targetIndex))
    throw new RangeError('Choose an available hero and living opponent');
  const options = { focus, excludeWeapon: !!fight.rules.excludeWeapon };
  fight.roundStarted = true;
  if (fight.rules.unarmed !== undefined) options.unarmed = !!fight.rules.unarmed;
  let hero=fight.party[memberIndex];
  if (fight.rules.rage) hero={...hero,skills:{...hero.skills,fighting:hero.skills.fighting+1}};
  if (fight.guardWeapons[memberIndex]) {hero={...hero,armed:true,weaponBonus:1,stonecutterSword:false};options.excludeWeapon=false;options.unarmed=false;}
  if (fight.rules.excludeTwoHanded && hero.twoHanded) {options.excludeWeapon=true;options.unarmed=true;}
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
    const ally=legendaryPool(5,enemy.defence,roll);
    const allyDamage=Math.min(enemy.health,ally.successes);
    enemy.health-=allyDamage;
    noteEnemyDamage(fight,targetIndex,memberIndex,allyDamage);
    record(fight,{type:'yuYanAttack',targetIndex,dice:ally.dice,damage:allyDamage});
  }
  fight.roundAttacks++;
  if (fight.rules.special === 'jungle') fight.party[memberIndex].health = Math.max(0, fight.party[memberIndex].health - 1);
  fight.acted.push(memberIndex);
  record(fight, { type: 'playerAttack', memberIndex, targetIndex, dice: attack.dice, damage });
  finishPlayerAction(fight);
  return fight;
}

export function legendarySkipAttack(input, memberIndex) {
  const fight = requireActive(input, 'player');
  if (!legendaryCanAct(fight, memberIndex))
    throw new RangeError('This hero has already acted or cannot act');
  fight.acted.push(memberIndex);
  record(fight, { type: 'skip', memberIndex });
  fight.roundStarted = true;
  finishPlayerAction(fight);
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
  if (fight.rules.damageSpellsForbidden && ['iceBolt','poisonStream','unfailingStrike','sandstorm'].includes(spellId))
    throw new RangeError('Damaging spells cannot be used for a nonfatal knockout');
  const supported = ['iceBolt', 'poisonStream', 'unfailingStrike', 'sandstorm', 'armourOfHeaven', 'soothingTouch', 'dazingLights'];
  if (!supported.includes(spellId)) throw new RangeError('This combat spell requires an encounter-specific effect');
  if (['armourOfHeaven', 'soothingTouch'].includes(spellId)) {
    if (targets.length !== 1 || !living(fight).includes(targets[0])) throw new RangeError('Choose a living participating hero');
  } else if (['iceBolt', 'unfailingStrike', 'poisonStream'].includes(spellId)) {
    const required = spellId === 'poisonStream' ? 2 : 1;
    if (targets.length !== required || targets.some(index => !Number.isInteger(index) || !fight.enemies[index] || !activeLegendaryEnemy(fight, index)))
      throw new RangeError('Choose living opponents for the spell');
  } else if (targets.length) throw new RangeError('This spell does not need a target');
  fight.party[memberIndex] = caster;
  if (!precombat) fight.roundStarted = true;
  if (spellId === 'armourOfHeaven') fight.armourBonuses[targets[0]] += 3;
  else if (spellId === 'soothingTouch') fight.party[targets[0]] = legendaryHeal(fight.party[targets[0]], 5);
  else if (spellId === 'dazingLights') fight.enemyPenalty++;
  else {
    const indices = spellId === 'sandstorm' ? fight.enemies.map((enemy,index) => activeLegendaryEnemy(fight,index) ? index : -1).filter(index => index >= 0) : targets;
    for (const targetIndex of indices) {
      const enemy = fight.enemies[targetIndex];
      const attack = spellId === 'unfailingStrike' ? { dice: [], successes: 3 } :
        legendaryPool(spellId === 'iceBolt' ? 8 : spellId === 'poisonStream' ? 5 : 3, fight.playerHitThreshold ?? enemy.defence, roll);
      const damage = Math.min(enemy.health, attack.successes);
      enemy.health -= damage;
      noteEnemyDamage(fight, targetIndex, memberIndex, damage);
      record(fight, { type: 'spellAttack', spellId, memberIndex, targetIndex, dice: attack.dice, damage });
    }
    fight.roundAttacks++;
  }
  record(fight, { type: 'cast', spellId, memberIndex, targets: [...targets] });
  if (opening) fight.openingUsed[memberIndex]=true;
  if (!opening && !precombat) {fight.acted.push(memberIndex);finishPlayerAction(fight);}
  else conclude(fight);
  return fight;
}

export function legendaryEnemyAttack(input, roll) {
  const fight = requireActive(input, 'enemy');
  if (fight.pending) throw new RangeError('Assign the previous attack before rolling again');
  fight.roundStarted = true;
  if (!fight.enemyActions.length) {
    while (fight.enemyCursor < fight.enemies.length && !activeLegendaryEnemy(fight, fight.enemyCursor)) fight.enemyCursor++;
    if (fight.enemyCursor === fight.enemies.length) { finishEnemyTurn(fight); return fight; }
    const enemyIndex = fight.enemyCursor++;
    fight.enemyActions = planLegendaryEnemy(fight, enemyIndex, roll);
    if (!fight.enemyActions.length) {
      record(fight, { type: 'nonstandardEnemyTurn', enemyIndex });
      finishEnemyActions(fight);
      return fight;
    }
  }
  const action = fight.enemyActions.shift();
  const { enemyIndex } = action;
  const attack = action.hits !== undefined ? { dice: [], successes: action.hits } :
    legendaryPool(action.count, action.threshold + (fight.enemyPenalty ?? 0), roll);
  record(fight, { type: 'enemyAttack', enemyIndex, dice: attack.dice, hits: attack.successes });
  if (attack.successes > 0) fight.pending = { ...action, hits: attack.successes };
  else finishEnemyActions(fight);
  return fight;
}

function finishEnemyActions(fight) {
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
    finishEnemyTurn(fight);
}

export function legendaryAssignDamage(input, memberIndex, roll, { allowSameRecipient = false } = {}) {
  const fight = requireActive(input, 'enemy');
  if (!fight.pending || !living(fight).includes(memberIndex))
    throw new RangeError('Choose a participating hero for the pending attack');
  const { enemyIndex, hits, noArmour, lifeSteal, distinct, forcedMember } = fight.pending;
  if (forcedMember !== undefined && forcedMember !== memberIndex) throw new RangeError('This attack has a fixed recipient');
  if (distinct && fight.enemyRecipients[enemyIndex] === memberIndex && !(allowSameRecipient && living(fight).length === 1))
    throw new RangeError('Choose a different recipient for the second attack');
  const character = fight.party[memberIndex];
  const damage = protectLegendaryHero(character, hits, { armourBonus: fight.armourBonuses?.[memberIndex] ?? 0,
    noArmour: !!fight.rules.noArmour || !!noArmour, potionFirst: !fight.rules.escortBeforePotion }, roll);
  fight.party[memberIndex] = damage.character;
  fight.pending = null;
  fight.enemyRecipients[enemyIndex] = memberIndex;
  fight.roundPartyDamage += damage.lost;
  if (lifeSteal) fight.enemies[enemyIndex].health += damage.lost;
  record(fight, { type: 'damage', enemyIndex, memberIndex, dice: damage.dice, prevented: damage.prevented,
    lost: damage.lost, protection: damage.protection, skeletonLost: damage.skeletonLost });
  if (!conclude(fight)) finishEnemyActions(fight);
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
    fight.enemyActions=[{enemyIndex,count:enemy.attack,threshold:enemy.threshold}];
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
  const hero = fight.party[memberIndex];
  if (type === 'healing') {
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
    fight.party[memberIndex].weaponBonus=Math.max(fight.party[memberIndex].weaponBonus??0,1);
  }
  record(fight,{type:'guardWeapon',memberIndex});
  return fight;
}

export function legendaryTommulReward(input, roll) {
  if (!input || input.rulesVersion!==1 || input.rules.section!==239 || input.round>3 ||
      input.tommulRewardTaken || input.enemies[0].health!==0 || !living(input).length)
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

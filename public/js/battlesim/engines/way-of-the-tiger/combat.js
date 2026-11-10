// Resolve a player-selected Way of the Tiger encounter without advancing its story.
import { initializeMirror, attackMirror } from './mirror.js';

export function createFight(player, opponents, options = {}) {
  const fight = {
    player: { endurance: 20, innerForce: 5, punch: 0, kick: 0, throw: 0,
      shurikens: 5, defense: 0, ...player },
    opponents: opponents.map(enemy => ({ ...enemy })),
    nonlethal: options.nonlethal === true,
    blockLimit: options.blockLimit ?? 1,
    rules: structuredClone(options.rules || {}),
    blockPenalty: false, blocksThisRound: 0, pendingHits: [], followup: null,
    rounds: 0, outcome: null, log: [],
  };
  if (fight.rules.mirrorPlayer) initializeMirror(fight);
  return fight;
}

const die = random => 1 + Math.floor(random() * 6);
const dice = (count, random) => Array.from({ length: count }, () => die(random)).reduce((a, b) => a + b, 0);
const alive = enemy => enemy.counterOnly || enemy.endurance > 0;

function finish(fight) {
  if (fight.player.endurance <= 0) fight.outcome = fight.nonlethal ? 'defeat' : 'loss';
  else if (fight.rules.readerEnemyThreshold != null
      && fight.opponents.some(enemy => !enemy.counterOnly && enemy.endurance <= fight.rules.readerEnemyThreshold)) fight.outcome = 'reader';
  else if (fight.rules.readerPlayerBelow && fight.player.endurance < fight.rules.readerPlayerBelow) fight.outcome = 'reader';
  else if (!fight.pendingHits.length && fight.opponents.every(enemy => enemy.counterOnly || !alive(enemy))) fight.outcome = 'win';
}

function finishRound(fight) {
  if (!fight.outcome && !fight.followup && !fight.pendingHits.length
      && fight.rules?.roundLimitAfterCounters && fight.rounds >= fight.rules.maxRounds) fight.outcome = 'reader';
}

// Counter profiles are selected from the current printed passage, not inferred from a route.
function counters(fight, profiles, random, hit) {
  const rules = fight.rules || {};
  if (rules.skipCounters || rules.fateWound || hit && rules.skipCountersOnHit || !hit && rules.skipCountersOnMiss) return;
  const survivors = fight.opponents.filter(enemy => !enemy.counterOnly && alive(enemy)).length;
  for (const profile of profiles) {
    const enemy = fight.opponents[profile.target];
    if (!enemy || !alive(enemy)) continue;
    if (fight.gripActive && profile.target === rules.grippingOpponent) continue;
    const defense = rules.counterDefenseByAlive?.[survivors]
      ?? (fight.gripActive && profile.target !== rules.grippingOpponent ? rules.grippedCounterDefense : undefined)
      ?? (hit ? rules.counterDefenseOnHit : undefined) ?? enemy.counterDefense ?? profile.defense;
    const roll = dice(2, random);
    const modifier = rules.counterRollModifier || 0;
    if (roll + modifier > defense) {
      fight.pendingHits.push({ target: profile.target, defense,
        damage: Math.max(0, dice(profile.damageDice, random) + (profile.damageBonus || 0)
          - (rules.holyProtection ? (fight.player.saintLocket ? 3 : 0) + (fight.player.rubyCirclet ? 4 : 0) : 0)),
        blockable: profile.blockable !== false && rules.unblockable !== true,
        chill: rules.counterChill, grips: profile.target === rules.grippingOpponent });
    }
    fight.log.push({ type: 'counter', target: profile.target, roll, modifier, defense });
  }
}

export function attack(fight, action, random = Math.random) {
  if (fight.outcome || fight.pendingHits.length) return false;
  const enemy = fight.opponents[action.target];
  const technique = action.technique;
  if (!enemy || enemy.counterOnly || !alive(enemy) || !['punch', 'kick', 'throw', 'shuriken'].includes(technique)) return false;
  const followup = fight.followup;
  const rules = fight.rules || {};
  if (!followup && rules.allowedTechniques && !rules.allowedTechniques.includes(technique)) return false;
  if (followup && (action.target !== followup.target || !(followup.techniques || ['punch', 'kick']).includes(technique))) return false;
  if (technique === 'shuriken' && fight.player.shurikens < 1) return false;
  if (action.innerForce && fight.player.innerForce < 1) return false;
  if (rules.innerForceForbidden && action.innerForce || rules.innerForceRequired && !action.innerForce) return false;
  if (action.nerveStrike && (!rules.nerveStrikeDamage || action.innerForce)) return false;
  if (!Number.isFinite(action.defense)) return false;
  if (rules.yubiJutsuReturnsToReader && fight.player.yubiJutsu) {
    fight.outcome = 'reader';
    return true;
  }
  if (rules.mirrorPlayer) return attackMirror(fight, action, random);
  if (!followup) {
    fight.rounds++; fight.blocksThisRound = 0;
    const cost = rules.attackEnduranceCost || 0;
    if (cost && (!rules.skipCostAtOrBelow || fight.player.endurance > rules.skipCostAtOrBelow)) {
      fight.player.endurance = Math.max(0, fight.player.endurance - cost);
      fight.log.push({ type: 'adjustment', change: -cost });
      finish(fight);
      if (fight.outcome) return true;
    }
    if (rules.suppressionShurikenEachRound) {
      fight.suppressed = fight.rounds === 1 && rules.suppressionFirstRoundAlreadySpent;
      if (!fight.suppressed && fight.player.shurikens > 0) { fight.player.shurikens--; fight.suppressed = true; }
    }
  }
  fight.followup = null;
  const penalty = fight.blockPenalty && technique !== 'shuriken' ? -2 : 0;
  fight.blockPenalty = false;
  if (technique === 'shuriken') fight.player.shurikens--;
  if (action.innerForce) fight.player.innerForce--;
  const roll = dice(2, random);
  const chill = fight.attackPenalty?.remaining > 0 ? fight.attackPenalty.penalty : 0;
  if (chill) fight.attackPenalty.remaining--;
  const modifier = (technique === 'shuriken' ? 0 : (fight.player[technique] || 0) + (action.modifier || 0) + (followup?.modifier || 0) + penalty + (rules.attackModifier || 0)) - chill;
  let defense = followup?.defense ?? action.defense;
  if (technique === 'throw') {
    const attempt = (enemy.throwAttempts || 0) + 1;
    if (rules.repeatThrowDefense != null && (rules.repeatThrowDefenseAtAttempt != null
      ? attempt === rules.repeatThrowDefenseAtAttempt : attempt > 1)) defense = rules.repeatThrowDefense;
    enemy.throwAttempts = attempt;
  }
  const hit = roll + modifier > defense;
  let damage = 0;
  if (hit && technique === 'throw') {
    if (rules.throwVictory) enemy.endurance = 0;
    else if (rules.throwNoFollowup) {
      damage = rules.throwDamage || 0;
      enemy.endurance = Math.max(0, enemy.endurance - damage);
    } else fight.followup = { target: action.target, modifier: rules.followupModifier || 0,
      defense: rules.followupDefense, techniques: rules.followupTechniques,
      damageBonus: rules.followupDamageBonus ?? 2, damageMultiplier: rules.followupDamageMultiplier ?? 1 };
  }
  else if (hit && rules.successfulHitsToWin) {
    fight.successfulHits = (fight.successfulHits || 0) + 1;
    if (fight.successfulHits >= rules.successfulHitsToWin) fight.outcome = 'win';
  }
  else if (hit) {
    damage = action.nerveStrike ? rules.nerveStrikeDamage
      : die(random) + (technique === 'kick' ? 2 : 0) + (followup ? followup.damageBonus ?? 2 : 0) + (rules.attackDamageBonus || 0)
        + (fight.player.yubiJutsu && ['punch', 'kick'].includes(technique)
          && !(action.innerForce && rules.yubiJutsuCannotCombineWithInnerForce) ? rules.yubiJutsuDamageBonus || 0 : 0);
    if (action.innerForce) damage *= 2;
    damage *= (rules.damageMultiplier ?? 1) * (followup?.damageMultiplier ?? 1);
    damage = Math.max(0, damage - (rules.damageReduction || 0));
    enemy.endurance = Math.max(0, enemy.endurance - damage);
    fight.player.endurance = Math.max(0, fight.player.endurance
      - (fight.player.saintLocket && rules.contactDamageWithLocket != null ? rules.contactDamageWithLocket : rules.contactDamage || 0));
  }
  if (!hit && technique === 'throw') fight.player.endurance = Math.max(0, fight.player.endurance - (rules.failedThrowDamage || 0));
  fight.log.push({ type: 'attack', target: action.target, technique, roll, modifier, defense, hit, damage });
  if (!hit && rules.missDamage) {
    fight.player.endurance = Math.max(0, fight.player.endurance - rules.missDamage);
    fight.log.push({ type: 'adjustment', change: -rules.missDamage });
  }
  if (rules.fateWound && !fight.followup) {
    const fate = die(random) + (fight.player.fate || 0);
    fight.log.push({ type: 'fate', roll: fate });
    if (rules.fateWound.hitScores.includes(fate)) fight.pendingHits.push({ target: action.target,
      defense: 0, damage: dice(rules.fateWound.damageDice, random), blockable: false });
  }
  finish(fight);
  if (!fight.outcome && !hit && rules.missReturnsToReader) fight.outcome = 'reader';
  if (!fight.outcome && !hit && technique === 'throw' && rules.failedThrowReturnsToReader) fight.outcome = 'reader';
  if (!fight.outcome && !fight.followup && rules.maxRounds && !rules.roundLimitAfterCounters && fight.rounds >= rules.maxRounds) fight.outcome = 'reader';
  if (!fight.outcome && !fight.followup) {
    const grip = fight.opponents[rules.grippingOpponent];
    if (grip && alive(grip) && fight.rounds >= 2) {
      fight.gripActive = true;
      const loss = rules.gripRoundDamage || 0;
      fight.player.endurance = Math.max(0, fight.player.endurance - loss);
      fight.log.push({ type: 'adjustment', change: -loss });
    } else if (grip && !alive(grip)) fight.gripActive = false;
    if (rules.suppressionShurikenEachRound && !fight.suppressed) {
      const loss = rules.unsuppressedRoundDamage || 0;
      fight.player.endurance = Math.max(0, fight.player.endurance - loss);
      fight.log.push({ type: 'adjustment', change: -loss });
    }
    finish(fight);
    if (!fight.outcome) counters(fight, action.counters || [], random, hit);
    finishRound(fight);
  }
  return true;
}

// Changing the printed attack profile retains combat progress and the thrown-target bonus.
export function setRoundProfile(fight, profile) {
  if (fight.outcome || fight.pendingHits.length || profile.opponents.length !== fight.opponents.length
      || profile.opponents.some((enemy, i) => enemy.name !== fight.opponents[i].name)) return false;
  fight.rules = structuredClone(profile.rules || {});
  for (const [index, enemy] of fight.opponents.entries()) {
    const source = profile.opponents[index];
    for (const key of ['defense', 'damageDice', 'damageBonus', 'manualCounter', 'counterDefense', 'counterOnly']) enemy[key] = source[key];
  }
  return true;
}

export function resolveHit(fight, block, random = Math.random) {
  if (fight.outcome || !fight.pendingHits.length) return false;
  const hit = fight.pendingHits[0];
  if (block && (!hit.blockable || fight.blocksThisRound >= fight.blockLimit)) return false;
  fight.pendingHits.shift();
  let roll = null, blocked = false;
  if (block) {
    fight.blocksThisRound++;
    fight.blockPenalty = true;
    roll = dice(2, random);
    blocked = roll < hit.defense;
  }
  if (!blocked) {
    fight.player.endurance = Math.max(0, fight.player.endurance - hit.damage);
    if (hit.chill) fight.attackPenalty = { penalty: hit.chill.penalty, remaining: hit.chill.rolls };
    if (hit.grips) fight.gripActive = true;
  }
  fight.log.push({ type: 'hit', ...hit, block, roll, blocked });
  finish(fight);
  if (!fight.outcome && !blocked && fight.rules.readerAfterCounterHit) fight.outcome = 'reader';
  if (fight.outcome) fight.pendingHits = [];
  finishRound(fight);
  return true;
}

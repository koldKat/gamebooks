// Track optional percentile encounters, wounds and combat effects without advancing the story.
import { combatCheck, damageDice, opposedResult, percentileCheck } from './checks.js';
import { allocateAttack, requireTurn } from './targets.js';

const alive = actor => actor.hp > 0 && !actor.fled && !actor.unconscious;
const firearms = new Set(['firearm', 'pistol', 'rifle', 'smg', 'shotgun']);
const number = (value, min = 0, max = 1000) => {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError('Invalid combatant');
  return value;
};

function fighter(actor) {
  if (!actor || typeof actor.name !== 'string' || !actor.name.trim() || actor.name.length > 120) throw new RangeError('Invalid combatant');
  const result = { ...structuredClone(actor), used: 0, skip: 0, stunned: false };
  for (const key of ['hp', 'maxHp']) number(result[key]);
  for (const key of ['dex', 'dodge', 'brawl', 'pow', 'str', 'con']) if (result[key] != null) number(result[key]);
  if (result.hp > result.maxHp || !result.maxHp) throw new RangeError('Invalid hit points');
  number(result.armor ?? 0); number(result.attacks ?? 1, 1, 12);
  damageDice(result.damage ?? '1D3', () => 0, { db: result.db ?? '0' });
  return result;
}

export function createFight(spec, party, enemies = spec?.enemies, { mode = 'percentile', pulpy = false, ambush = false } = {}) {
  if (!spec || !Array.isArray(party) || !party.length || party.length > 12
      || !Array.isArray(enemies) || !enemies.length || enemies.length > 24) throw new RangeError('Invalid encounter');
  if (!['percentile', 'coin'].includes(mode)) throw new RangeError('Invalid combat mode');
  if (spec.maxParty && party.length > spec.maxParty) throw new RangeError('Too many investigators for encounter');
  const fight = { version: 1, mode, ambush, spec: structuredClone(spec), party: party.map(fighter), enemies: enemies.map(fighter),
    round: 1, status: 'fighting', log: [], roundDamage: 0, pendingDamage: [] };
  if (!fight.party.some(alive) || !fight.enemies.some(alive)) throw new RangeError('No active combatants');
  for (const actor of fight.party) actor.pulpy = Boolean(pulpy);
  if (spec.enemyAttacks === 'party') for (const actor of fight.enemies) actor.attacks = party.length;
  return fight;
}

function result(fight) {
  if (!fight.party.some(alive)) fight.status = 'loss';
  else if (!fight.enemies.some(e => alive(e) || e.dormant)) fight.status = fight.enemies.some(e => e.fled) ? 'escaped' : 'win';
}

function hurt(actor, amount) { actor.hp = Math.max(0, actor.hp - Math.max(0, amount)); }
function preventFatal(actor, amount) {
  if (actor.hp > 0 && amount >= actor.hp && actor.pulpy && actor.luck >= 35) { actor.luck -= 35; return true; }
  return false;
}

function wound(target, attacker, move, attack, fight, random, playerAttack) {
  const instant = move.killOnHit || move.killAt && attack.level >= move.killAt || ['knockout', 'throttle', 'grapple', 'entangle'].includes(move.effect)
    || move.criticalMode === 'kill' && attack.level >= move.criticalAt;
  const rolled = instant ? { formula: '', rolls: [], total: 0 } : damageDice(move.damage ?? attacker.damage, random, { db: attacker.db ?? '0' });
  let raw = rolled.total;
  if (move.criticalAt && attack.level >= move.criticalAt && move.criticalMode === 'max-plus-roll') {
    raw += damageDice(move.damage ?? attacker.damage, random, { db: attacker.db ?? '0', maximize: true }).total;
  }
  let amount = Math.max(0, raw - (move.ignoresArmor ? 0 : target.armor ?? 0));
  const effects = [];
  if (move.killOnHit || move.criticalMode === 'kill' && attack.level >= move.criticalAt) amount = target.hp;
  if (move.killAt && attack.level >= move.killAt) amount = target.hp;
  else if (move.damageToKill != null) amount = raw >= move.damageToKill ? target.hp : 0;
  if (playerAttack) {
    const material = attacker.material ?? 'ordinary', kind = attacker.weaponKind ?? 'melee';
    const magical = ['silver', 'magic', 'fire', 'explosive'].includes(material);
    switch (target.resistance) {
      case 'vampire':
        if (!magical) amount = kind === 'shotgun' ? 1 : 0;
        break;
      case 'dark-young':
        if (firearms.has(kind)) amount = 1;
        else if (kind === 'axe') amount *= 2;
        break;
      case 'lycanthrope':
        if (amount >= 8 && firearms.has(kind) && ['ordinary', 'silver'].includes(material)) {
          target.stunned = material !== 'silver' || target.silverSaveStuns !== false;
          if (target.stunned) effects.push('stunned');
          if (material === 'silver') {
            const check = percentileCheck(target.con, 0, random); effects.push({ constitution: check });
            if (check.level < 2) amount = target.hp;
          }
        }
        if (!magical) amount = 0;
        break;
    }
    if (target.silverMinimum && material === 'silver') amount = Math.max(target.silverMinimum, amount);
    if (target.buckshotImpaleDamage && kind === 'shotgun' && material === 'ordinary') amount = attack.level >= 4 ? target.buckshotImpaleDamage : 0;
  }
  if (move.effect === 'grapple' || move.effect === 'entangle') {
    target.immobilized = true; effects.push(move.effect); amount = 0;
    if (move.effect === 'grapple') target.grappled = true;
    if (move.skipAttack) target.skip = Math.max(target.skip, 1);
  } else if (move.effect === 'throttle') {
    amount = target.hp; effects.push('crushed');
  } else if (move.effect === 'lycanthropy') {
    target.lycanthropy = true;
    if (attack.level >= 4) amount = target.hp;
  }
  if (move.effect === 'strength-drain') { target.str = Math.max(0, target.str - 5); effects.push('strength-drain'); }
  if (move.effect === 'knockout') { target.unconscious = true; amount = 0; effects.push('unconscious'); }
  if (!fight.spec.simultaneous && preventFatal(target, amount)) {
    amount = 0; effects.push('luck-saved');
  }
  if (fight.spec.simultaneous) {
    const side = fight.party.includes(target) ? 'party' : 'enemies';
    fight.pendingDamage.push({ side, index: fight[side].indexOf(target), amount });
  } else if (!(playerAttack && fight.spec.roundDamageTarget != null)) hurt(target, amount);
  if (playerAttack && fight.spec.nonlethalBrawl && attacker.unarmedBrawl && target.hp === 0) target.unconscious = true;
  if (move.effect === 'blood-drain') {
    attacker.hp += amount;
    if (target.hp === 0) {
      target.vampire = true; target.turnedRound = fight.round; effects.push('turned');
      if (!playerAttack && !target.converted) {
        target.converted = true;
        fight.enemies.push({ ...structuredClone(attacker), name: target.name, hp: 0, maxHp: attacker.maxHp,
          used: 0, skip: 0, dormant: true, turnedRound: fight.round, regeneration: 1, fled: false });
      }
    }
  }
  fight.roundDamage += playerAttack ? amount : 0;
  return { rolled, raw, amount, effects };
}

export function attackTurn(fight, options, random = Math.random) {
  if (fight?.status !== 'fighting') return null;
  if (fight.spec.hypnosis && !fight.hypnosisResolved) throw new RangeError('Resolve hypnosis first');
  const next = structuredClone(fight), { side, index, target: targetIndex, defense = 'dodge', move: moveIndex = 0 } = options;
  if (!['party', 'enemies'].includes(side) || !['none', 'dodge', 'fight'].includes(defense)) throw new RangeError('Invalid combat action');
  if (side === 'party' && next.spec.allowPartyAttack === false || side === 'enemies' && next.spec.allowEnemyAttack === false) throw new RangeError('Wrong combat phase');
  if (side === 'party' && next.spec.playerMainOnly && index !== (next.mainIndex ?? 0)
      || side === 'party' && next.spec.playerExcludesMain && index === (next.mainIndex ?? 0)) throw new RangeError('Wrong investigator for this phase');
  if (side === 'enemies' && next.spec.enemyActionsLimit != null
      && next.enemies.reduce((sum, actor) => sum + actor.used, 0) >= next.spec.enemyActionsLimit) throw new RangeError('Enemy phase complete');
  if (side === 'party' && next.spec.partyActionsLimit != null
      && next.party.reduce((sum, actor) => sum + actor.used, 0) >= next.spec.partyActionsLimit) throw new RangeError('Party phase complete');
  const other = side === 'party' ? 'enemies' : 'party', actor = next[side][number(index, 0, 23)];
  const requestedTarget = next[other][number(targetIndex, 0, 23)];
  if (!actor || !requestedTarget || !alive(actor) || actor.hypnotized || actor.temporaryInsanity
      || side === 'party' && next.spec.excludeDriver && actor.driver || actor.grappled && !actor.canActGrappled
      || actor.used >= (actor.attacks ?? 1)) throw new RangeError('Combatant cannot act');
  if (side === 'party' && next.spec.playerRequiresFirearm && !firearms.has(actor.weaponKind)) throw new RangeError('A firearm is required');
  const entry = { round: next.round, side, index, target: targetIndex };
  requireTurn(next, side, index);
  actor.used++;
  if (actor.skip || actor.stunned) {
    if (actor.skip) actor.skip--;
    entry.skipped = true;
  } else if (actor.fleeAt != null && actor.hp <= actor.fleeAt) {
    actor.fled = true; entry.fled = true;
  } else {
    const playerAttack = side === 'party';
    const ranged = firearms.has(actor.weaponKind);
    const move = playerAttack ? { skill: next.spec.playerUsesBrawl ? actor.brawl : actor.skill,
      damage: next.spec.playerUsesBrawl ? '1D3+DB' : actor.damage,
      effect: next.spec.playerEffect,
      bonus: Math.max(-2, Math.min(2, (next.spec.playerBonusFirearmsOnly && !ranged ? 0 : next.spec.playerBonus ?? 0)
        + (actor.attackBonus ?? 0) + (next.spec.openingAmbushBonus && next.ambush && next.round === 1 && actor.used === 1 ? 1 : 0))),
      criticalAt: next.spec.playerCriticalAt ?? 0, criticalMode: next.spec.playerCriticalMode ?? 'none',
      killOnHit: next.spec.playerHitKills ?? false, ignoresArmor: actor.ignoresArmor ?? false,
      killAt: next.spec.playerKillAt, damageToKill: next.spec.playerDamageToKill,
      forcedDefense: next.spec.playerForcedDefense,
      ...(actor.move ?? {}) } : actor.moves?.[number(moveIndex, 0, 11)];
    let selectedMove = move;
    if (!playerAttack && actor.weaponDropped && actor.moves?.some(m => m.unarmed)) selectedMove = actor.moves.find(m => m.unarmed);
    if (!playerAttack && actor.randomMoves) {
      if (actor.randomMoves.length !== actor.moves.length || actor.randomMoves.some(n => !Number.isSafeInteger(n) || n < 1)) throw new RangeError('Invalid attack table');
      let roll = damageDice(`1D${actor.randomMoves.reduce((a, b) => a + b, 0)}`, random).total;
      const selectedIndex = actor.randomMoves.findIndex(weight => (roll -= weight) <= 0);
      selectedMove = actor.moves[selectedIndex]; entry.moveIndex = selectedIndex;
    }
    const selected = allocateAttack(next, side, actor, targetIndex, selectedMove, random);
    entry.target = selected.index;
    return finishAttack(next, fight, actor, selected.target, selected.move, { playerAttack, defense, entry }, random);
  }
  result(next); next.log.push(entry); next.log = next.log.slice(-200);
  Object.assign(fight, next); return entry;
}

function finishAttack(next, fight, actor, target, move, { playerAttack, defense, entry }, random) {
    if (!move) throw new RangeError('Invalid attack');
    if ((actor.weaponDestroyed || actor.weaponDropped) && !move.unarmed) throw new RangeError('Weapon unavailable');
    if (move.requiresDropped && !actor.weaponDropped) throw new RangeError('Weapon has not been dropped');
    if (move.requiresImmobilized && !target.immobilized && !target.hypnotized) throw new RangeError('Target is not immobilized');
    let actualDefense = move.forcedDefense ?? defense;
    if (target.immobilized || target.hypnotized || target.temporaryInsanity || (playerAttack ? next.spec.enemyCannotDefend : next.spec.partyCannotDefend)) actualDefense = 'none';
    const extra = playerAttack && target.addPercentileToAttack && next.mode !== 'coin' ? percentileCheck(100, 0, random).raw : 0;
    const attack = move.automatic ? { level: 2, automatic: true } : combatCheck(move.skill, move.bonus ?? 0, random, next.mode ?? 'percentile', extra, move.thresholds);
    const defenseStat = move.defenseRequiresMelee && firearms.has(target.weaponKind) ? target.brawl
      : move.defenseStat ? target[move.defenseStat] : actualDefense === 'fight' ? target.brawl : target.dodge;
    const defend = actualDefense === 'none' ? { level: 1 } : combatCheck(defenseStat, 0, random, next.mode ?? 'percentile');
    const attackLevel = move.defenseRule === 'success-except-critical' && attack.level >= 2 && attack.level < 5 ? 2 : attack.level;
    const opposed = opposedResult(attackLevel, defend.level, { tie: move.tie ?? (actualDefense === 'fight' ? 'attacker' : 'defender') });
    entry.attack = attack; entry.defense = defend; entry.defenseMode = actualDefense;
    const threshold = playerAttack ? next.spec.playerMinimumLevel ?? next.spec.playerWeaponThresholds?.[actor.weaponKind] ?? 2 : 2;
    if (move.equalDamage != null && attack.level === defend.level) {
      const fixed = { damage: String(move.equalDamage), ignoresArmor: true };
      entry.wound = wound(target, actor, fixed, attack, next, random, playerAttack);
      entry.counter = wound(actor, target, fixed, defend, next, random, !playerAttack);
    } else {
      if (opposed.attacker && attack.level >= threshold) entry.wound = wound(target, actor, move, attack, next, random, playerAttack);
      if (opposed.defender && actualDefense === 'fight' && !move.noCounter) entry.counter = wound(actor, target,
        { damage: target.counterDamage ?? target.damage ?? '1D3', killOnHit: move.counterKill, ignoresArmor: target.ignoresArmor }, defend, next, random, !playerAttack);
    }
    if (playerAttack && attack.level === 2 && actor.braced && next.spec.playerBracedHit) entry.unresolvedHit = true;
    if (playerAttack && attack.level < 2 && next.spec.rescueFailureDamage) {
      const victim = next.party[next.mainIndex ?? 0];
      entry.rescueWound = wound(victim, actor, { damage: next.spec.rescueFailureDamage }, attack, next, random, false);
    }
    if (attack.level === 0) {
      const fumble = move.fumble ?? (playerAttack ? next.spec.playerFumble : undefined) ?? 'skip';
      if (fumble === 'weapon') {
        if (firearms.has(actor.weaponKind)) actor.skip = Math.max(actor.skip, 1); else actor.weaponDropped = true;
      } else if (fumble === 'destroy') actor.weaponDestroyed = true;
      else if (fumble === 'drop') actor.weaponDropped = true;
      else if (fumble === 'skip') actor.skip = Math.max(actor.skip, 1);
      entry.fumble = fumble;
    }
  result(next); next.log.push(entry); next.log = next.log.slice(-200);
  Object.assign(fight, next); return entry;
}

export function nextRound(fight) {
  if (fight?.status !== 'fighting') return false;
  for (const injury of fight.pendingDamage) {
    const actor = fight[injury.side][injury.index];
    if (!preventFatal(actor, injury.amount)) hurt(actor, injury.amount);
  }
  fight.pendingDamage = [];
  result(fight); if (fight.status !== 'fighting') return true;
  if (fight.spec.singleRound) { fight.status = 'round-complete'; return true; }
  if (fight.spec.roundDamageTarget != null) {
    if (fight.roundDamage > fight.spec.roundDamageTarget) { fight.status = 'win'; return true; }
    for (const actor of fight.party.filter(alive)) {
      const amount = fight.spec.failedRoundDamage ?? 0;
      if (!preventFatal(actor, amount)) hurt(actor, amount);
    }
    result(fight); if (fight.status !== 'fighting') return true;
  }
  fight.round++;
  fight.roundDamage = 0;
  for (const actor of [...fight.party, ...fight.enemies]) {
    actor.used = 0; actor.stunned = false; actor.attackTargets = [];
    if (actor.dormant && fight.round > actor.turnedRound) { actor.hp = 1; actor.dormant = false; }
    else if (actor.hp > 0 && actor.regeneration) actor.hp = Math.max(actor.hp, Math.min(actor.maxHp, actor.hp + actor.regeneration));
  }
  return true;
}

export function ghostDuel(fight, index, random = Math.random) {
  if (fight?.status !== 'fighting' || fight.spec.kind !== 'ghost-power') return null;
  const actor = fight.party[number(index, 0, 11)], ghost = fight.enemies[0];
  if (!actor || !alive(actor)) throw new RangeError('Invalid investigator');
  const defense = combatCheck(ghost.pow, 0, random, fight.mode ?? 'percentile'), attack = combatCheck(actor.pow, 0, random, fight.mode ?? 'percentile');
  const entry = { round: fight.round, side: 'party', index, attack, defense };
  if (attack.level > defense.level && attack.level >= 2) fight.status = 'win';
  else {
    const lost = damageDice('1D6', random).total; entry.powerLost = lost;
    actor.pow = Math.max(0, actor.pow - lost); ghost.pow += lost;
    if (!actor.pow) actor.hp = 0;
    result(fight);
  }
  fight.log.push(entry); fight.log = fight.log.slice(-200); fight.round++; return entry;
}

// Apply explicit encounter recovery and phase changes without making story decisions.
import { combatCheck } from './checks.js';

function actorFor(fight, index) {
  const actor = fight?.party?.[index];
  if (fight?.status !== 'fighting' || !Number.isSafeInteger(index) || !actor || actor.hp <= 0) throw new RangeError('Invalid investigator');
  return actor;
}

export function recoverWeapon(fight, index) {
  const actor = actorFor(fight, index);
  if (!actor.weaponDropped || actor.used >= (actor.attacks ?? 1) || actor.hypnotized || actor.grappled) throw new RangeError('Cannot recover weapon');
  actor.used++; actor.weaponDropped = false;
  fight.log.push({ round: fight.round, side: 'party', index, recovered: true });
  fight.log = fight.log.slice(-200);
}

export function useBrawl(fight, index) {
  const actor = actorFor(fight, index);
  actor.skill = actor.brawl; actor.damage = '1D3+DB'; actor.weaponKind = 'melee'; actor.material = 'ordinary';
  actor.weaponDestroyed = false; actor.weaponDropped = false; actor.ignoresArmor = false; delete actor.move;
  actor.damageDice = 1; actor.damageSides = 3; actor.damageBonus = 0;
  actor.unarmedBrawl = true; actor.attackBonus = 0;
}

export function hypnosis(fight, mainIndex = 0, random = Math.random) {
  if (fight?.status !== 'fighting' || !fight.spec.hypnosis || fight.hypnosisResolved) throw new RangeError('Hypnosis unavailable');
  actorFor(fight, mainIndex);
  const rolls = fight.party.map((actor, index) => index === mainIndex || actor.hp <= 0 ? null
    : combatCheck(actor.pow, 0, random, fight.mode ?? 'percentile'));
  rolls.forEach((check, index) => { if (check) fight.party[index].hypnotized = check.level < 2; });
  fight.hypnosisResolved = true;
  for (const enemy of fight.enemies) enemy.actLast = fight.party.some(actor => actor.hypnotized);
  fight.log.push({ round: fight.round, side: 'party', index: mainIndex, hypnosis: rolls });
  fight.log = fight.log.slice(-200);
  return rolls;
}

export function retreat(fight, random = Math.random) {
  if (fight?.status !== 'fighting' || !fight.spec.retreat) throw new RangeError('Retreat unavailable');
  const rule = fight.spec.retreat;
  if (fight.round < (rule.fromRound ?? 1)) throw new RangeError('Too early to retreat');
  if (rule.requiresStunned && !fight.enemies.some(enemy => enemy.stunned)) throw new RangeError('Opponent is not stunned');
  const rolls = fight.party.map(actor => actor.hp <= 0 || actor.fled ? null
    : rule.automatic || rule.automaticRound && fight.round >= rule.automaticRound ? { level: 2 }
      : combatCheck(actor.dex, 0, random, fight.mode ?? 'percentile'));
  rolls.forEach((check, index) => { if (check?.level >= 2) fight.party[index].fled = true; });
  if (fight.party.every(actor => actor.hp <= 0 || actor.fled)) fight.status = 'retreated';
  fight.log.push({ round: fight.round, side: 'party', index: 0, retreat: rolls });
  fight.log = fight.log.slice(-200);
  return rolls;
}

export function changePhase(fight, spec) {
  if (!fight || !['fighting', 'round-complete'].includes(fight.status) || !spec?.group || spec.group !== fight.spec.group
      || fight.pendingDamage.length || (!spec.enemyCount && spec.enemies.length !== fight.enemies.length)
      || spec.enemyCount && spec.enemyCount !== fight.spec.enemyCount) throw new RangeError('Invalid combat phase');
  const next = structuredClone(fight);
  next.spec = structuredClone(spec); next.status = 'fighting';
  if (fight.status === 'round-complete') {
    next.round++;
    for (const actor of [...next.party, ...next.enemies]) { actor.used = 0; actor.attackTargets = []; }
  }
  next.enemies.forEach((current, index) => {
    const enemy = spec.enemies[spec.enemyCount ? 0 : index];
    for (const key of ['moves', 'attacks', 'damage', 'db', 'dex', 'counterDamage', 'resistance', 'silverMinimum',
      'buckshotImpaleDamage', 'targetRule', 'targetTie', 'allocation', 'randomMoves', 'regeneration',
      'fleeAt', 'addPercentileToAttack', 'silverSaveStuns']) {
      if (enemy[key] === undefined) delete current[key]; else current[key] = structuredClone(enemy[key]);
    }
  });
  Object.assign(fight, next);
}

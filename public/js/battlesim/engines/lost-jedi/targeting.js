// Select Lost Jedi combat targets and calculate attacks for the current range.
import {weaponAttack} from './math.js';

export const living = actor => !actor.defeated;
export const opponents = (fight, actor) => fight.actors.filter(other => living(other)
  && other.team !== actor.team && !(actor.team === 'rebels' && other.team === 'rebels'));
export const distance = (fight, actor, target) => actor.attackRange ?? (actor.id === 'havet' ? target.range ?? fight.range
  : target.id === 'havet' ? actor.range ?? fight.range : fight.range);

export function targetCategory(actor) {
  return actor.id === 'havet' ? 'havet' : actor.tag;
}

export function targetMap(fight, actor) {
  if (actor.tag === 'fett') return fight.rules.fettTargetDie ?? null;
  if (actor.team === 'rebels' && actor.id !== 'havet') return fight.rules.allyTargetDie ?? null;
  if (actor.team === 'imperial') return fight.rules.enemyTargetDie ?? null;
  return null;
}

export function legalTargets(fight, actor) {
  let targets = opponents(fight, actor);
  if (fight.rules.thirdPartyOnly) targets = targets.filter(target => target.id !== 'havet');
  if (actor.tag === 'diamond' && fight.rules.diamondTarget) {
    targets = targets.filter(target => target.tag === fight.rules.diamondTarget);
  }
  if (actor.tag === 'fett' && fight.rules.enemyTargetOrder) {
    const ally = targets.filter(target => target.team === 'rebels' && target.id !== 'havet');
    if (ally.length) targets = ally;
  }
  return targets;
}

export function attackProfile(fight, actor, target) {
  const range = distance(fight, actor, target);
  let threshold = range === 'range' ? target.targetAtRange ?? target.target : target.target;
  if (actor.id === 'havet') {
    const blaster=fight.rules.desertWeaponModifiers ? 0 : fight.player.blaster;
    return weaponAttack({...fight.player, blaster, range, target:threshold, armoured:target.armoured!==false});
  }
  if (range === 'range' && actor.attackTargetAtRange) threshold = actor.attackTargetAtRange;
  if (actor.attackTarget) threshold = actor.attackTarget;
  if (actor.tag === 'diamond' && target.tag === 'fett' && range === 'range') threshold = actor.targetAgainstFettAtRange ?? threshold;
  if (actor.armourReduction && threshold > 7) threshold -= actor.armourReduction;
  if (actor.tag==='fett' && fight.rules.fettHeavyWeapons) {
    const heavy=fight.rules.fettHeavyWeapons;
    threshold=fight.movingClose ? heavy.movingCloseTarget : range==='range' ? heavy.rangedTarget : heavy.closeTarget;
  }
  let skill=range === 'close' ? actor.closeSkill : actor.rangedSkill;
  if (fight.rules.desertWeaponModifiers && fight.player.weapon==='lightsabre') skill=Math.max(0,skill-1);
  return {skill, bonus:0, target:threshold};
}

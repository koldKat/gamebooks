// Allocate combat turns and targets from printed encounter rules without story navigation.
const active = actor => actor.hp > 0 && !actor.fled && !actor.unconscious;
export function requireTurn(fight, side, index) {
  let order = fight.spec.order;
  if (fight.round === 1 && fight.spec.openingOrder) order = fight.spec.openingOrder;
  if (order === 'ambush') order = fight.ambush ? 'party-first' : 'enemies-first';
  const pending = ['party', 'enemies'].flatMap(team => {
    if (team === 'party' && fight.spec.allowPartyAttack === false || team === 'enemies' && fight.spec.allowEnemyAttack === false) return [];
    if (team === 'enemies' && fight.spec.enemyActionsLimit != null
        && fight.enemies.reduce((sum, actor) => sum + actor.used, 0) >= fight.spec.enemyActionsLimit) return [];
    if (team === 'party' && fight.spec.partyActionsLimit != null
        && fight.party.reduce((sum, actor) => sum + actor.used, 0) >= fight.spec.partyActionsLimit) return [];
    return fight[team].flatMap((actor, i) => !(team === 'party' && fight.spec.playerMainOnly && i !== (fight.mainIndex ?? 0))
      && !(team === 'party' && fight.spec.playerExcludesMain && i === (fight.mainIndex ?? 0))
      && active(actor) && !actor.hypnotized && !actor.temporaryInsanity && !(team === 'party' && fight.spec.excludeDriver && actor.driver)
      && (!actor.grappled || actor.canActGrappled) && actor.used < (actor.attacks ?? 1)
      && (team === 'party' || actor.moves?.length) ? [{ side: team, index: i, actor }] : []);
  });
  if (fight.round === 1 && fight.spec.mainOpens && pending.some(row => row.side === 'party' && row.index === (fight.mainIndex ?? 0))) {
    if (side !== 'party' || index !== (fight.mainIndex ?? 0)) throw new RangeError('Main investigator acts first');
    return;
  }
  if (order === 'party-first' || order === 'enemies-first') {
    const first = order === 'party-first' ? 'party' : 'enemies';
    if (side !== first && pending.some(row => row.side === first)) throw new RangeError('Other side acts first');
  } else if (order === 'dex') {
    const initiative = actor => actor.actLast ? -1 : actor.dex + (fight.spec.firearmInitiative
      && ['firearm', 'pistol', 'rifle', 'smg', 'shotgun'].includes(actor.weaponKind) ? 50 : 0);
    if (pending.some(row => !Number.isFinite(row.actor.dex))) throw new RangeError('Enter initiative stats');
    const best = Math.max(...pending.map(row => initiative(row.actor)));
    if (initiative(fight[side][index]) < best) throw new RangeError('Higher initiative acts first');
    if (side === 'party' && fight.spec.enemyWinsInitiativeTies && pending.some(row => row.side === 'enemies' && initiative(row.actor) === best)) throw new RangeError('Enemy wins the initiative tie');
  }
}

export function allocateAttack(fight, side, actor, requested, move, random) {
  const opponents = fight[side === 'party' ? 'enemies' : 'party'];
  let candidates = opponents.flatMap((target, index) => active(target) ? [index] : []);
  let rule = move.targetRule ?? actor.targetRule;
  if (actor.openingTarget && fight.round === 1) rule = actor.openingTarget;
  if (actor.allocation === 'trample-each') {
    const remaining = candidates.filter(index => !actor.attackTargets?.includes(index));
    move = actor.moves[remaining.length ? 0 : 1];
    if (remaining.length) candidates = remaining;
    else rule = 'random';
  }
  if (actor.allocation === 'bite-crush') {
    if (!actor.attackTargets?.length) rule = 'lowest:moveSpeed';
    else { candidates = candidates.filter(index => !actor.attackTargets.includes(index)); rule = 'random'; }
  }
  if (rule === 'unique') candidates = candidates.filter(index => !actor.attackTargets?.includes(index));
  else if (rule === 'main') {
    if (candidates.includes(fight.mainIndex ?? 0)) candidates = [fight.mainIndex ?? 0];
    else if (candidates.includes(requested)) fight.mainIndex = requested;
  } else if (rule === 'paired') {
    const paired = fight.enemies.indexOf(actor);
    if (candidates.includes(paired)) candidates = [paired];
  } else if (rule?.startsWith('lowest:') || rule?.startsWith('highest:')) {
    const [direction, field] = rule.split(':');
    const values = candidates.map(index => opponents[index][field]);
    if (values.some(value => !Number.isFinite(value))) throw new RangeError('Enter the target-selection stats');
    const best = (direction === 'lowest' ? Math.min : Math.max)(...values);
    candidates = candidates.filter(index => opponents[index][field] === best);
    if (actor.targetTie && candidates.length > 1) {
      const tied = candidates.map(index => opponents[index][actor.targetTie]);
      if (tied.some(value => !Number.isFinite(value))) throw new RangeError('Enter the target tie-break stats');
      const lowest = Math.min(...tied);
      candidates = candidates.filter(index => opponents[index][actor.targetTie] === lowest);
    }
  }
  if (!candidates.length) throw new RangeError('No eligible combat target');
  let index;
  if (rule === 'random') {
    if (candidates.length === 1) index = candidates[0];
    else {
      const value = random();
      if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('Invalid random value');
      index = candidates[Math.floor(value * candidates.length)];
    }
  } else if (rule === 'unique' && !candidates.includes(requested)) throw new RangeError('Target already attacked');
  else index = candidates.includes(requested) ? requested : candidates[0];
  actor.attackTargets ??= []; actor.attackTargets.push(index);
  return { target: opponents[index], index, move };
}

// Resolve one graded Life Force duel without advancing the book or managing inventory.
export const LIFE_FORCE = Object.freeze(['GREEN', 'AMBER', 'RED', 'DEAD']);

function requireGrade(value, alive = false) {
  if (!LIFE_FORCE.includes(value) || alive && value === 'DEAD') throw new RangeError('Invalid Life Force');
  return value;
}

export function validateKnightmareRules(rules) {
  if (rules?.dieSides !== 6 || !Number.isSafeInteger(rules.playerHitMax)
      || rules.playerHitMax < 1 || rules.playerHitMax > 5) throw new RangeError('Invalid duel rules');
  return {dieSides:rules.dieSides, playerHitMax:rules.playerHitMax};
}

function requireCharges(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 2) throw new RangeError('Invalid luck charges');
  return value;
}

function outcome(player, opponent) {
  return player === 'DEAD' ? 'loss' : opponent === 'DEAD' ? 'win' : 'fighting';
}

function wound(grade) {
  requireGrade(grade, true);
  return LIFE_FORCE[LIFE_FORCE.indexOf(grade) + 1];
}

export function startKnightmareFight(player, opponent, rules, {luckCharges = 0} = {}) {
  const initial = {player:requireGrade(player.lifeForce, true), opponent:requireGrade(opponent.lifeForce, true),
    luckCharges:requireCharges(luckCharges)};
  const name = String(opponent.displayName ?? opponent.name ?? '').trim();
  if (!name || name.length > 200) throw new RangeError('Invalid opponent name');
  return {rulesVersion:1, rules:validateKnightmareRules(rules), initial,
    player:{lifeForce:initial.player}, opponent:{name, lifeForce:initial.opponent},
    luckCharges:initial.luckCharges, round:0, status:'fighting', rounds:[]};
}

// Replaying saved results validates restoration without consuming or rolling any dice.
export function validateKnightmareFight(fight) {
  if (fight?.rulesVersion !== 1 || !Array.isArray(fight.rounds) || fight.rounds.length > 5
      || fight.round !== fight.rounds.length) throw new RangeError('Invalid saved duel');
  const rules = validateKnightmareRules(fight.rules);
  let player = requireGrade(fight.initial?.player, true), opponent = requireGrade(fight.initial?.opponent, true);
  let luck = requireCharges(fight.initial?.luckCharges);
  for (const [index, step] of fight.rounds.entries()) {
    if (outcome(player, opponent) !== 'fighting' || step.round !== index + 1
        || typeof step.usedLuck !== 'boolean') throw new RangeError('Invalid saved round');
    if (step.usedLuck) {
      if (!luck || step.die !== null) throw new RangeError('Invalid saved luck use');
      luck--;
    } else if (!Number.isSafeInteger(step.die) || step.die < 1 || step.die > rules.dieSides) {
      throw new RangeError('Invalid saved die');
    }
    const target = step.usedLuck || step.die <= rules.playerHitMax ? 'opponent' : 'player';
    if (target === 'player') player = wound(player); else opponent = wound(opponent);
    if (step.wounded !== target || step.playerLifeForce !== player || step.opponentLifeForce !== opponent
        || step.luckCharges !== luck) throw new RangeError('Invalid saved wound');
  }
  const status = outcome(player, opponent);
  if (fight.player?.lifeForce !== player || fight.opponent?.lifeForce !== opponent
      || fight.luckCharges !== luck || typeof fight.opponent?.name !== 'string' || !fight.opponent.name.trim()
      || fight.opponent.name.length > 200 || fight.status !== status && !(status === 'fighting' && fight.status === 'cancelled')) {
    throw new RangeError('Invalid saved outcome');
  }
  return fight;
}

export function knightmareRound(fight, {expectedRound, die, useLuck = false} = {}, random = Math.random) {
  validateKnightmareFight(fight);
  if (fight.status !== 'fighting' || expectedRound !== fight.round) throw new RangeError('Stale or completed duel');
  if (typeof useLuck !== 'boolean') throw new RangeError('Invalid luck choice');
  let rolled = null;
  if (useLuck) {
    if (!fight.luckCharges || die !== undefined) throw new RangeError('Luck needs a charge and no die');
  } else {
    rolled = die;
    if (rolled === undefined) {
      const value = random();
      if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('Invalid random roll');
      rolled = Math.floor(value * fight.rules.dieSides) + 1;
    }
    if (!Number.isSafeInteger(rolled) || rolled < 1 || rolled > fight.rules.dieSides) throw new RangeError('Invalid die');
  }
  const next = structuredClone(fight), target = useLuck || rolled <= next.rules.playerHitMax ? 'opponent' : 'player';
  next[target].lifeForce = wound(next[target].lifeForce);
  if (useLuck) next.luckCharges--;
  next.round++;
  next.rounds.push({round:next.round, die:rolled, usedLuck:useLuck, wounded:target,
    playerLifeForce:next.player.lifeForce, opponentLifeForce:next.opponent.lifeForce, luckCharges:next.luckCharges});
  next.status = outcome(next.player.lifeForce, next.opponent.lifeForce);
  return next;
}

export function cancelKnightmareFight(fight) {
  validateKnightmareFight(fight);
  if (fight.status !== 'fighting') throw new RangeError('Completed duel');
  return {...structuredClone(fight), status:'cancelled'};
}

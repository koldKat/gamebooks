// Resolve independent Horror Classic strikes and explicitly advanced combat rounds.
import {fighter, number, rollDice, initiative, strikeDamage} from './math.js';

const copy = value => structuredClone(value);
const threshold = enemy => Number(enemy.rules.defeatAt ?? 0);
const alive = enemy => !enemy.withdrawn && enemy.lifePoints > threshold(enemy);
const record = (fight, event) => { fight.events.push(event); fight.events = fight.events.slice(-160); };

export function ready(fight) {
  if (!fight || fight.rulesVersion !== 1 || fight.outcome || fight.pending) {
    throw new RangeError('Finish the pending strike or choose an active encounter.');
  }
}

export function finish(fight) {
  if (fight.player.lifePoints <= 0 || fight.options.garlicOil && fight.player.lifePoints < 15) fight.outcome = 'loss';
  else if (fight.enemies.every(enemy => !alive(enemy))) {
    fight.outcome = fight.enemies.some(enemy => enemy.withdrawn) ? 'escaped' : 'win';
  }
  if (fight.outcome) fight.pending = null;
  return fight;
}

export function startFight({player, enemies, allies = [], role, section = 'custom', options = {}, groupMode} = {}) {
  if (!['harker', 'dracula'].includes(role) || !Array.isArray(enemies) || !enemies.length || enemies.length > 24) {
    throw new RangeError('Choose a role and combatants.');
  }
  if (enemies.length > 1 && !['sequential', 'manual'].includes(groupMode)) {
    throw new RangeError('Choose how to resolve this group.');
  }
  if (enemies.some(enemy => enemy.rules?.sequential) && groupMode !== 'sequential') {
    throw new RangeError('These opponents attack one after another.');
  }
  const weapon = options.weapon ?? 'none';
  if (!['none', 'dagger', 'mace', 'flintlock'].includes(weapon)) throw new RangeError('Choose an available weapon.');
  if (!Array.isArray(allies) || allies.length > 24) throw new RangeError('Choose up to 24 combat allies.');
  return finish({rulesVersion: 1, section: String(section), role, player: fighter(player, {player: true}),
    enemies: enemies.map(enemy => fighter(enemy)), allies:allies.map(ally=>fighter(ally)), groupMode: groupMode || 'sequential',
    options: {...copy(options), weapon}, round: 1, roundActions: 0, first: null,
    freePlayerAttacks: 0, flintlockUsed: false, stakeArmed: false, outcome: null, pending: null, events: []});
}

function opponent(fight, index) {
  if (!Number.isInteger(index) || !fight.enemies[index] || !alive(fight.enemies[index])) {
    throw new RangeError('Choose an active opponent.');
  }
  if (fight.groupMode === 'sequential' && index !== fight.enemies.findIndex(alive)) {
    throw new RangeError('Finish the current opponent first.');
  }
  return fight.enemies[index];
}

export function rollInitiative(input, options = {}, die) {
  ready(input);
  if (input.special) throw new RangeError('Use the encounter’s special checks.');
  if (input.roundActions) throw new RangeError('Determine initiative before striking.');
  const fight = copy(input), enemy = opponent(fight, options.enemyIndex ?? 0);
  const result = initiative(fight.player, enemy, {...options, playerOptions: fight.options,
    modifier: fight.options.cursed ? 1 : 0}, die);
  fight.first = result.first;
  record(fight, {kind: 'initiative', ...result});
  return fight;
}

function effectsFor(enemy, score, raw) {
  return (enemy.rules.onRoll || []).filter(rule => rule.scores.includes(rule.natural ? raw : score)
    && (!rule.onlyWithoutPsi || enemy.psi < 1)
    && (!rule.psiCost || enemy.psi >= rule.psiCost)).map(copy);
}

function effects(fight, items, index, recipient = fight.player) {
  const enemy = fight.enemies[index];
  for (const item of items) {
    if (item.psiCost) enemy.psi -= item.psiCost;
    if (item.effect === 'feed') {
      fight.player.lifePoints = Math.min(100, fight.player.lifePoints + Math.max(0, enemy.lifePoints));
    } else if (item.effect === 'half') recipient.lifePoints /= 2;
    else if (item.effect === 'quarter') recipient.lifePoints *= 0.75;
    else if (item.effect === 'poison') recipient.status.poison = Math.max(recipient.status.poison, item.amount ?? 5);
    else if (item.effect === 'empower') enemy.status.doubleNext = true;
    else if (item.effect === 'teleport') {
      fight.outcome = 'escaped';
      record(fight, {kind: 'source-condition', condition: 'teleported', destinationManual: true});
    }
    else if (item.effect === 'cloud' || item.effect === 'stun') {
      recipient.status.missFrom = fight.round + 1;
      recipient.status.missThrough = Math.max(recipient.status.missThrough ?? 0, fight.round + (item.rounds ?? 1));
    } else if (item.effect === 'rot') {
      // This condition matters after traveling; the combat tool only reports it.
      record(fight, {kind: 'source-condition', condition: 'fungoid-rot', sectionLifeLoss: 5});
    } else throw new RangeError('Unknown combat effect.');
    record(fight, {kind: 'effect', effect: item.effect, enemy: enemy.name, playerLife: fight.player.lifePoints});
  }
}

function completeStrike(fight, strike, order) {
  const enemy = fight.enemies[strike.enemyIndex];
  const recipient = strike.targetAllyIndex == null ? fight.player : fight.allies[strike.targetAllyIndex];
  const victim = strike.actor !== 'enemy' ? enemy : recipient;
  if (order === 'effects-first') effects(fight, strike.effects, strike.enemyIndex,recipient);
  victim.lifePoints -= strike.damage;
  if (order !== 'effects-first') effects(fight, strike.effects, strike.enemyIndex,recipient);
  if (strike.actor === 'ally') {
    const ally=fight.allies[strike.allyIndex];
    if (ally.rules.mindCloud && [11,12].includes(strike.score) && ally.psi >= 1) {
      ally.psi--;
      enemy.status.missFrom=fight.round+1;
      enemy.status.missThrough=Math.max(enemy.status.missThrough ?? 0,fight.round+2);
      record(fight,{kind:'ally-cloud',ally:ally.name,enemy:enemy.name});
    }
  }
  record(fight, {kind: 'strike', actor: strike.actor, enemy: enemy.name, roll: strike.roll,
    score: strike.score, damage: strike.damage, effectOrder: order,
    ally:strike.actor === 'ally' ? fight.allies[strike.allyIndex].name : null,target:victim.name,targetLife:victim.lifePoints,
    playerLife: fight.player.lifePoints, enemyLife: enemy.lifePoints});
  fight.roundActions++;
  if (strike.actor === 'enemy' && fight.retreatPending) {
    fight.retreatPending = false;
    if (fight.player.lifePoints > 0) fight.outcome = 'escaped';
  }
  return finish(fight);
}

export function strike(input, {actor, enemyIndex = 0, allyIndex = 0, targetAllyIndex = null, total} = {}, die) {
  ready(input);
  if (input.special) throw new RangeError('Use the encounter’s special checks.');
  if (!['player', 'enemy', 'ally'].includes(actor)) throw new RangeError('Choose the attacker.');
  const fight = copy(input), enemy = opponent(fight, enemyIndex), player = actor === 'player';
  const ally=actor==='ally' ? fight.allies?.[allyIndex] : null;
  if (actor==='ally' && (!Number.isInteger(allyIndex) || !ally || ally.lifePoints <= 0)) throw new RangeError('Choose an active ally.');
  if (actor !== 'enemy' && targetAllyIndex != null) throw new RangeError('Only an opponent can attack an ally.');
  const recipient=targetAllyIndex == null ? fight.player : fight.allies?.[targetAllyIndex];
  if (!recipient || targetAllyIndex != null && (!Number.isInteger(targetAllyIndex) || recipient.lifePoints<=0)) throw new RangeError('Choose an active defender.');
  if (actor!=='enemy' && fight.retreatPending) throw new RangeError('Resolve the retreating opponent’s free strike.');
  if (fight.retreatPending && enemyIndex !== fight.flightEnemyIndex) throw new RangeError('Resolve the chosen opponent’s free strike.');
  if (actor==='enemy' && fight.freePlayerAttacks > 0) throw new RangeError('Resolve the free player strikes first.');
  const attacker=player ? fight.player : ally || enemy;
  const blocked = attacker.status.missFrom <= fight.round && attacker.status.missThrough >= fight.round;
  if (blocked) {
    fight.roundActions++;
    record(fight, {kind: 'missed-round', actor, round: fight.round});
    return fight;
  }
  const roll = rollDice(2, die, total), modifier = fight.options.cursed ? (player ? 1 : actor==='enemy' ? -1 : 0) : 0;
  const score = roll.total + modifier;
  const fatal = enemy.rules.fatalRolls || [], fatalScore = enemy.rules.naturalFatal ? roll.total : score;
  if (player && (enemy.rules.playerFatalRolls || []).includes(score)
      || actor==='enemy' && (fatal.includes(fatalScore) || enemy.status.stakeNext && roll.total === 12)) {
    (player ? fight.player : recipient).lifePoints = 0;
    fight.roundActions++;
    record(fight, {kind: 'fatal-strike', actor, enemy: enemy.name, roll, score});
    return finish(fight);
  }
  const armed = player && fight.stakeArmed;
  if (player) fight.stakeArmed = false;
  if (armed && enemy.rules.vampire && [6, 12].includes(roll.total)) {
    enemy.lifePoints = threshold(enemy);
    fight.roundActions++;
    if (fight.freePlayerAttacks) fight.freePlayerAttacks--;
    record(fight, {kind: 'stake-driving', enemy: enemy.name, roll});
    return finish(fight);
  }
  const feeds = player && fight.role === 'dracula' && fight.options.weapon === 'none' && [6, 12].includes(score);
  if (feeds && enemy.rules.poisonousBlood) {
    fight.player.lifePoints = 0;
    record(fight, {kind: 'poisonous-blood', enemy: enemy.name, roll});
    return finish(fight);
  }
  const hitThreshold = actor!=='enemy' ? number(enemy.rules.playerHitThreshold ?? 6, 2, 13) : targetAllyIndex==null && fight.options.bat ? 8 : 6;
  const triggered = actor==='enemy' ? effectsFor(enemy, score, roll.total) : [];
  if (feeds && !blocked) triggered.push({effect: 'feed'});
  const defender = actor!=='enemy' ? enemy : recipient;
  let weapon = player ? fight.options.weapon : 'none';
  if (player && weapon === 'flintlock') {
    if (fight.flintlockUsed) throw new RangeError('The flintlock can be used only once in this combat.');
    fight.flintlockUsed = true;
  }
  const damage = strikeDamage(attacker, defender, score, {
    weapon, bat: player && fight.options.bat, garlicOil: player && fight.options.garlicOil,
    blessed: player && fight.options.blessed, sanctuary: actor==='enemy' && targetAllyIndex==null && fight.options.sanctuary,
    partyCard: actor==='enemy' && targetAllyIndex==null && fight.options.partyCard, hitThreshold,
    damageBonus: actor!=='enemy' ? 0 : number(enemy.rules.damageBonus ?? 0)
      + (enemy.rules.bonusAbove != null && score > enemy.rules.bonusAbove ? number(enemy.rules.rollBonus ?? 0) : 0)
      + (enemy.status.stakeNext ? 5 : 0),
    doubleDamage: actor==='enemy' && enemy.status.doubleNext,
    doubleDice: actor==='enemy' && enemy.status.doubleDiceNext,
    noDamage: Boolean(blocked || actor==='enemy' && enemy.rules.noOrdinaryDamage),
  });
  if (actor==='enemy') enemy.status.doubleNext = enemy.status.doubleDiceNext = enemy.status.stakeNext = false;
  if (player && fight.freePlayerAttacks) fight.freePlayerAttacks--;
  const action = {actor, enemyIndex, allyIndex, targetAllyIndex, roll, score, damage, effects: triggered};
  if (damage && triggered.some(item => ['feed', 'half', 'quarter'].includes(item.effect))) {
    fight.pending = {kind: 'effect-order', strike: action};
    record(fight, {kind: 'choose-effect-order', actor, enemy: enemy.name, roll, damage});
    return fight;
  }
  return completeStrike(fight, action, 'damage-first');
}

export function resolveStrike(input, order) {
  if (!input?.pending || input.pending.kind !== 'effect-order' || !['damage-first', 'effects-first'].includes(order)) {
    throw new RangeError('Choose how to resolve the pending strike.');
  }
  const fight = copy(input), action = fight.pending.strike;
  fight.pending = null;
  return completeStrike(fight, action, order);
}

export function advanceRound(input) {
  ready(input);
  if (input.special || input.retreatPending) throw new RangeError('Resolve the encounter’s pending check.');
  if (!input.roundActions || input.freePlayerAttacks) throw new RangeError('Resolve this round’s strikes first.');
  const fight = copy(input);
  for (const victim of [fight.player,...(fight.allies || [])]) if (victim.lifePoints>0 && victim.status.poison) {
    victim.lifePoints -= victim.status.poison;
    record(fight, {kind: 'poison', amount: victim.status.poison, round: fight.round,target:victim.name});
  }
  fight.round++;
  fight.roundActions = 0;
  return finish(fight);
}

export function stopFight(input) {
  if (!input || input.rulesVersion !== 1 || input.outcome) throw new RangeError('Choose an active encounter.');
  const fight = copy(input);
  fight.pending = null;
  fight.outcome = 'cancelled';
  record(fight, {kind: 'cancelled'});
  return fight;
}

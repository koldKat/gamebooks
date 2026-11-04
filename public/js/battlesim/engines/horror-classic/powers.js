// Apply explicitly selected Horror Classic combat powers without campaign progression.
import {ready, finish} from './core.js';
import {number, rollDice, fighter} from './math.js';

function record(fight, event) {
  fight.events.push(event);
  fight.events = fight.events.slice(-160);
}

function target(fight, index) {
  const enemy = fight.enemies[index];
  if (!Number.isInteger(index) || !enemy || enemy.withdrawn || enemy.lifePoints <= (enemy.rules.defeatAt ?? 0)) {
    throw new RangeError('Choose an active opponent.');
  }
  if (fight.groupMode === 'sequential' && index !== fight.enemies.findIndex(e => !e.withdrawn
      && e.lifePoints > (e.rules.defeatAt ?? 0))) throw new RangeError('Finish the current opponent first.');
  return enemy;
}

function pay(fight, payment) {
  const factor=fight.options.garlicOil ? 0.5 : 1;
  const available=fight.player.psi*factor;
  if (payment === 'psi') {
    if (available < 1) throw new RangeError(available>0 ? 'Fractional PSI needs a manual source ruling.' : 'Not enough PSI.');
    fight.player.psi-=1/factor;
  } else if (payment === 'life') {
    if (available > 0) throw new RangeError('Use PSI before substituting Life Points. Fractional PSI needs a manual source ruling.');
    fight.player.lifePoints -= 20;
  } else throw new RangeError('Choose PSI or Life Points.');
  record(fight, {kind: 'psi-payment', payment, amount: payment === 'psi' ? 1 : 20});
  if (fight.player.lifePoints <= 0 || fight.options.garlicOil && fight.player.lifePoints < 15) finish(fight);
  return !fight.outcome;
}

export const ROLE_POWERS = Object.freeze({
  harker: ['beatification', 'sanctuary', 'stake'],
  dracula: ['transform', 'calm', 'recruit'],
  monster: ['terror-strike', 'blood-lust', 'love-affair'],
  doctor: ['mad-science', 'monster-making', 'body-armour'],
});

export function playerPower(input, {power, payment, enemyIndex = 0, enemyIndices, total} = {}, die) {
  ready(input);
  const fight = structuredClone(input);
  if (!ROLE_POWERS[fight.role]?.includes(power)) {
    throw new RangeError('That power is unavailable to this character.');
  }
  if (power === 'beatification' && fight.options.blessed || power === 'sanctuary' && fight.options.sanctuary
      || power === 'stake' && fight.stakeArmed || power === 'body-armour' && fight.options.bodyArmour
      || power === 'blood-lust' && fight.player.status.doubleNext) throw new RangeError('That power is already active.');
  const victim = ['terror-strike','love-affair','mad-science'].includes(power) ? target(fight, enemyIndex) : null;
  if (power === 'terror-strike' && victim.status.missNext > 0) throw new RangeError('That power is already active.');
  if (power === 'love-affair' && victim.rules.friendshipImmune) throw new RangeError('This opponent is immune to Love Affair.');
  if (power === 'monster-making' && fight.allies.length >= 24) throw new RangeError('Choose up to 24 combat allies.');
  const createdAlly = power === 'monster-making' ? fighter(fight.options.createdAlly ?? {}) : null;
  let animals;
  if (power === 'calm' || power === 'recruit') {
    const indices = enemyIndices ?? [enemyIndex];
    if (!Array.isArray(indices) || !indices.length || new Set(indices).size !== indices.length) {
      throw new RangeError('Choose the affected animals.');
    }
    animals = indices.map(index => {
      // Calming may stop a whole pack, including members awaiting a sequential attack.
      const enemy = fight.enemies[index];
      if (!Number.isInteger(index) || !enemy?.rules.smallAnimal || enemy.lifePoints <= 0
          || (power === 'calm' ? enemy.withdrawn : !enemy.calmed || enemy.recruited)) {
        throw new RangeError('Choose eligible small animals.');
      }
      return enemy;
    });
  }
  if (!pay(fight, payment)) return fight;
  if (power === 'terror-strike') victim.status.missNext = (victim.status.missNext ?? 0) + 1;
  if (power === 'blood-lust') fight.player.status.doubleNext = true;
  if (power === 'body-armour') fight.options.bodyArmour = true;
  if (createdAlly) fight.allies.push(createdAlly);
  let roll;
  if (power === 'love-affair') {
    roll = rollDice(1, die, total);
    if (roll.total + number(fight.options.luckBonus ?? 0,0,2) >= 4) victim.withdrawn = victim.defeatedByPower = true;
  }
  if (power === 'mad-science') {
    roll = rollDice(1, die, total);
    const score = roll.total + number(fight.options.luckBonus ?? 0,0,2);
    if (score === 1) fight.options.strengthMultiplier = (fight.options.strengthMultiplier ?? 1) * 2;
    if (score === 2) victim.lifePoints -= 25;
    if (score === 3) {
      fight.options.speedOverride = 0;
      fight.options.enemyAttacksPerPlayer = 2;
      // Keep initiative explicit; the source specifies a ratio, not an opening ambush.
      fight.enemyStrikesOwed = 0;
    }
    if (score === 4) victim.withdrawn = victim.defeatedByPower = true;
    if (score === 5) fight.player.lifePoints = 0;
    if (score === 6) fight.pending = {kind:'mad-science-explosion',enemyIndex};
    if (score > 6) fight.pending = {kind:'source-roll',enemyIndex,roll,score};
  }
  if (power === 'beatification') fight.options.blessed = true;
  if (power === 'sanctuary') fight.options.sanctuary = true;
  if (power === 'stake') fight.stakeArmed = true;
  if (power === 'transform') fight.options.bat = !fight.options.bat;
  for (const enemy of animals || []) {
    if (power === 'calm') enemy.withdrawn = enemy.calmed = true;
    else enemy.recruited = true;
  }
  record(fight, {kind: 'player-power', power, roll, enemies: animals?.map(enemy => enemy.name), bat: fight.options.bat});
  // A calmed encounter remains open until the player finishes or recruits an animal.
  return ['monster','doctor'].includes(fight.role) ? finish(fight) : fight;
}

export function resolveMadScience(input, {total} = {}, die) {
  if (input?.outcome || input?.pending?.kind !== 'mad-science-explosion') {
    throw new RangeError('Resolve a pending Mad Science explosion.');
  }
  const fight = structuredClone(input), enemy = fight.enemies[fight.pending.enemyIndex];
  const roll = rollDice(1, die, total);
  const score = roll.total + number(fight.options.luckBonus ?? 0,0,2);
  if (score <= 4) enemy.withdrawn = enemy.defeatedByPower = true;
  else if (score <= 6) fight.player.lifePoints = 0;
  if (score > 6) fight.pending = {kind:'source-roll',enemyIndex:fight.pending.enemyIndex,roll,score};
  else fight.pending = null;
  record(fight, {kind:'player-power',power:'mad-science-explosion',roll});
  return finish(fight);
}

export function combatItem(input, {item, enemyIndex = 0} = {}) {
  ready(input);
  const fight = structuredClone(input), enemy = target(fight, enemyIndex);
  fight.itemsUsed ??= [];
  if (!['hand', 'paralyser', 'antidote', 'triple-dose'].includes(item) || fight.itemsUsed.includes(item)) {
    throw new RangeError('Choose an unused combat item.');
  }
  if (item === 'paralyser' && !enemy.rules.vampire) throw new RangeError('The paralyser affects vampires only.');
  if (item === 'hand') {
    enemy.lifePoints /= 2;
    fight.freePlayerAttacks += 2;
  }
  if (item === 'paralyser') {
    fight.first = 'player';
    fight.freePlayerAttacks += 2;
  }
  if (item === 'antidote') fight.player.status.poison = 0;
  if (item === 'triple-dose') {
    fight.player.status.poison = 0;
    delete fight.player.status.combatPoison;
  }
  fight.itemsUsed.push(item);
  record(fight, {kind: 'combat-item', item, enemy: enemy.name});
  return finish(fight);
}

export function enemyPower(input, {power, enemyIndex = 0, total} = {}, die) {
  ready(input);
  const fight = structuredClone(input), enemy = target(fight, enemyIndex);
  if (!enemy.rules.powers?.includes(power)) throw new RangeError('That power is unavailable to this opponent.');
  const helsing = ['thunderbolt', 'caduceus', 'sickener', 'stakeout'];
  if (helsing.includes(power) && enemy.lifePoints < enemy.maxLife / 2) {
    throw new RangeError('These abilities require at least half the original Life Points.');
  }
  let roll;
  if (power === 'fireball') fight.player.lifePoints -= 15;
  else if (power === 'energy-bolt') {
    roll = rollDice(1, die, total);
    const speed = fight.player.speed * (fight.options.garlicOil ? 0.5 : 1);
    if (speed === roll.total) throw new RangeError('The source does not resolve equal SPEED. Resolve this dodge manually.');
    if (speed < roll.total) fight.player.lifePoints -= 25;
  } else if (power === 'thunderbolt') {
    // The source specifies a score of six but does not specify the number of dice.
    if (total === '' || total == null) throw new RangeError('Enter the thunderbolt score using your chosen source interpretation.');
    const score = number(total, 1, 12);
    if (!Number.isInteger(score)) throw new RangeError('Enter a whole dice score.');
    roll = {total: score, dice: null};
    if (score === 6) fight.player.lifePoints -= 20;
  } else if (power === 'caduceus') {
    roll = rollDice(2, die, total);
    enemy.lifePoints = Math.min(enemy.maxLife, enemy.lifePoints + roll.total);
  } else if (power === 'sickener') {
    fight.player.status.missFrom = fight.round + 1;
    fight.player.status.missThrough = Math.max(fight.player.status.missThrough ?? 0, fight.round + 1);
  } else if (power === 'stakeout') enemy.status.stakeNext = true;
  else if (power === 'double-strike') {
    if (enemy.status.doubleNext) throw new RangeError('The next strike is already empowered.');
    if (enemy.psi >= 1) enemy.psi--;
    else {
      roll = rollDice(2, die, total);
      if (roll.total !== 12) {
        record(fight, {kind: 'enemy-power', power, enemy: enemy.name, roll, success: false});
        return fight;
      }
    }
    enemy.status.doubleNext = true;
  } else throw new RangeError('Choose an available combat power.');
  record(fight, {kind: 'enemy-power', power, enemy: enemy.name, roll, success: true});
  return finish(fight);
}

export function resolveManually(input, {playerLife, playerPsi, enemyLife, enemyIndex = 0, note} = {}) {
  if (input?.pending?.kind === 'source-roll') {
    input = structuredClone(input);
    input.pending = null;
  }
  ready(input);
  if (typeof note !== 'string' || !note.trim()) throw new RangeError('Describe the source ruling.');
  const fight = structuredClone(input), enemy = target(fight, enemyIndex);
  fight.player.lifePoints = number(playerLife, -10000, 100);
  if (playerPsi != null && playerPsi !== '') fight.player.psi=number(playerPsi);
  enemy.lifePoints = number(enemyLife, -10000, 10000);
  record(fight, {kind: 'manual-ruling', enemy: enemy.name, note: note.trim().slice(0, 500),
    playerLife: fight.player.lifePoints, enemyLife: enemy.lifePoints});
  return finish(fight);
}

export function allyMindCloud(input,{allyIndex=0,enemyIndex=0}={}) {
  ready(input);
  const fight=structuredClone(input),enemy=target(fight,enemyIndex),ally=fight.allies?.[allyIndex];
  if (!Number.isInteger(allyIndex) || !ally?.rules.mindCloud || ally.lifePoints<=0 || ally.psi<1) {
    throw new RangeError('Choose a living ally with a mind-cloud PSI point.');
  }
  ally.psi--;
  enemy.status.missFrom=fight.round+1;
  enemy.status.missThrough=Math.max(enemy.status.missThrough ?? 0,fight.round+2);
  record(fight,{kind:'ally-cloud',ally:ally.name,enemy:enemy.name});
  return fight;
}

export function endCalmedFight(input) {
  ready(input);
  if (input.enemies.some(e => !e.withdrawn && e.lifePoints > (e.rules.defeatAt ?? 0))) {
    throw new RangeError('There are still attacking opponents.');
  }
  return finish(structuredClone(input));
}

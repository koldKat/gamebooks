import { rollDie } from '../../engines/d20/dice.js';

export const defaults = Object.freeze({ strength: 5, fighting: 1 });
const rollChance = () => rollDie(6);

export function beginFight(player, encounter, options = {}) {
  if (player.strength < 1) throw new RangeError('Strength must be positive');
  const fight = {
    kind: encounter.kind,
    name: encounter.name,
    section: encounter.section,
    strength: player.strength,
    fighting: player.fighting,
    rounds: 0,
    outcome: null,
    destination: null,
    routes: encounter.routes,
  };
  if (encounter.kind === 'guards') {
    return {
      ...fight,
      remaining: encounter.count,
      threshold: options.guardWord ? encounter.wordThreshold : encounter.threshold,
      failAfter: options.strategist ? encounter.strategistLoss : encounter.playerLoss,
      strengthLost: 0,
      prayerAvailable: !options.prayerUsed,
    };
  }
  const enemy = encounter.opponent;
  const bonus = encounter.positionBonus ?? 0;
  const strategistBonus = options.strategist ? enemy.strategistBonus ?? 0 : 0;
  fight.fighting += options.positionWord ? bonus : 0;
  fight.enemy = {
    name: enemy.name,
    strength: Math.max(0, enemy.strength + strategistBonus - (options.wounds ?? 0)),
    fighting: enemy.fighting,
  };
  fight.stopAt = encounter.stopAt ?? 0;
  if (fight.strength <= fight.stopAt) finish(fight, 'loss');
  else if (fight.enemy.strength === 0) finish(fight, 'win');
  return fight;
}

function finish(fight, outcome) {
  fight.outcome = outcome;
  fight.destination = fight.strength === 0 ? null : fight.routes?.[outcome] ?? null;
}

export function exchange(current, { prayer = false, chance = rollChance } = {}) {
  if (current.outcome) throw new RangeError('The fight has ended');
  const fight = structuredClone(current);
  fight.rounds += 1;
  const event = { prayer, round: fight.rounds };
  if (fight.kind === 'guards') {
    if (prayer && !fight.prayerAvailable) throw new RangeError('Prayer already used');
    event.playerRoll = prayer ? null : chance();
    event.playerTotal = prayer ? null : fight.strength + fight.fighting + event.playerRoll;
    event.target = fight.threshold;
    if (prayer) fight.prayerAvailable = false;
    event.hit = prayer || event.playerTotal >= fight.threshold ? 'player' : 'enemy';
    if (event.hit === 'player') {
      if (--fight.remaining === 0) finish(fight, 'win');
    } else {
      fight.strength -= 1;
      fight.strengthLost += 1;
      if (fight.strength === 0 || fight.strengthLost === fight.failAfter) finish(fight, 'loss');
    }
  } else {
    if (prayer) throw new RangeError('Prayer unavailable in this fight');
    event.playerRoll = chance();
    event.enemyRoll = chance();
    event.playerTotal = fight.strength + fight.fighting + event.playerRoll;
    event.enemyTotal = fight.enemy.strength + fight.enemy.fighting + event.enemyRoll;
    event.hit = event.playerTotal > event.enemyTotal ? 'player' : event.playerTotal < event.enemyTotal ? 'enemy' : 'tie';
    if (event.hit === 'player' && --fight.enemy.strength === 0) finish(fight, 'win');
    if (event.hit === 'enemy' && --fight.strength === fight.stopAt) finish(fight, 'loss');
  }
  return { fight, event };
}

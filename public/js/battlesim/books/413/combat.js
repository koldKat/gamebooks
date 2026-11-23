import { drawNumber, strikeDamage } from '../../engines/magic-of-darkness/core.js';

export const defaults = Object.freeze({
  skill: 10, endurance: 50, magic: 15, magicLost: false, healing: false,
  unarmed: false, chainmail: false, bolts: 0, knives: 0,
});

export function beginFight(character, encounter, opponents = encounter.opponents) {
  if (character.endurance <= 0 || !opponents?.length || opponents.some(enemy => enemy.endurance <= 0)) {
    throw new RangeError('Combatants must have endurance');
  }
  return {
    section: encounter.section,
    rotation: Boolean(encounter.rotation),
    lossAt: encounter.lossAt ?? null,
    player: { ...character, unarmed: encounter.unarmed ?? character.unarmed },
    opponents: opponents.map(enemy => ({ ...enemy, maxEndurance: enemy.endurance })),
    initialEndurance: character.endurance,
    target: 0,
    firedBolt: false,
    outcome: null,
  };
}

function damage(fight, target, amount) {
  target.endurance = Math.max(0, target.endurance - amount);
  if (fight.player.endurance === 0 || (fight.lossAt != null
      && fight.initialEndurance - fight.player.endurance >= fight.lossAt)) {
    fight.outcome = 'loss';
  } else if (!fight.opponents.some(opponent => opponent.endurance > 0)) {
    fight.outcome = 'win';
  }
}

function opponentAt(fight, selected) {
  if (fight.outcome) throw new RangeError('Combat has ended');
  const index = fight.rotation ? fight.target : selected;
  if (!(fight.opponents[index]?.endurance > 0)) throw new RangeError('Invalid opponent');
  return index;
}

function advanceTarget(fight) {
  do {
    fight.target = (fight.target + 1) % fight.opponents.length;
  } while (fight.opponents[fight.target].endurance === 0);
}

export function exchange(current, selected, draw = drawNumber) {
  const index = opponentAt(current, selected);
  const fight = structuredClone(current);
  const enemy = fight.opponents[index];
  const playerRoll = draw();
  const enemyRoll = draw();
  const playerTotal = fight.player.skill + Number(fight.player.chainmail) + playerRoll;
  const enemyTotal = enemy.skill + enemyRoll;
  const difference = playerTotal - enemyTotal;
  const event = { index, playerRoll, enemyRoll, playerTotal, enemyTotal, side: 'tie', damage: 0 };
  if (difference > 0) {
    event.side = 'player';
    event.damage = strikeDamage(fight.player.unarmed);
    damage(fight, enemy, event.damage);
  } else if (difference < 0) {
    event.side = 'enemy';
    event.damage = strikeDamage(enemy.unarmed);
    damage(fight, fight.player, event.damage);
  }
  if (difference !== 0 && fight.rotation && !fight.outcome) {
    advanceTarget(fight);
  }
  return { fight, event };
}

export function useProjectile(current, selected, item) {
  const index = opponentAt(current, selected);
  if (current.section === 354 || !['bolts', 'knives'].includes(item)
      || current.player[item] <= 0 || (item === 'bolts' && current.firedBolt)) {
    throw new RangeError('Projectile unavailable');
  }
  const fight = structuredClone(current);
  const amount = item === 'bolts' ? 5 : 10;
  fight.player[item] -= 1;
  if (item === 'bolts') fight.firedBolt = true;
  damage(fight, fight.opponents[index], amount);
  if (fight.rotation && !fight.outcome && fight.opponents[fight.target].endurance === 0) {
    advanceTarget(fight);
  }
  return { fight, event: { index, item, damage: amount } };
}

export function heal(character, draw = drawNumber) {
  if (!character.healing || character.magicLost || character.magic <= 0 || character.endurance <= 0 || character.endurance >= 50) {
    throw new RangeError('Healing unavailable');
  }
  const recovered = Math.min(50 - character.endurance, draw());
  const magic = character.magic - 1;
  return {
    character: { ...character, magic, magicLost: magic === 0, endurance: character.endurance + recovered },
    recovered,
  };
}

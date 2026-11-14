// Resolve Erik's optional duel using the printed quick and extended combat rules.
import {duelInteger as integer, duelFighter as fighter, adjustStrengthEnergy,
  rollDuelDice, resolveDuelStrike} from '../../engines/viking-duel/core.js';

export function validateFight(fight) {
  if (!fight || fight.rulesVersion !== 1 || !['quick', 'extended'].includes(fight.method)
      || !['fighting', 'win', 'loss'].includes(fight.status)) throw new RangeError('Invalid saved duel');
  fighter(fight.player); fighter(fight.opponent);
  integer(fight.revision); integer(fight.round);
  if (!Array.isArray(fight.events) || fight.events.length > 200
      || typeof fight.opponent.name !== 'string' || typeof fight.opponent.section !== 'string'
      || (fight.status === 'fighting' && (!fight.player.energy
        || fight.method === 'extended' && !fight.opponent.energy))) {
    throw new RangeError('Invalid saved duel state');
  }
  if (fight.status === 'fighting' ? fight.result !== null || fight.destination !== null
    : fight.result !== fight.status || ![372, 377, 382, 389].includes(fight.destination)) {
    throw new RangeError('Invalid duel result');
  }
  return fight;
}

function finish(fight, result, destination, rescued = false) {
  fight.status = fight.result = result;
  fight.destination = destination;
  fight.rescued = rescued;
  fight.dead = result === 'loss' && !rescued;
}

export function startFight(playerInput, opponentInput, method = 'extended') {
  if (!['quick', 'extended'].includes(method)) throw new RangeError('Invalid duel method');
  const player = fighter(playerInput), enemy = fighter(opponentInput);
  if (!player.energy || !enemy.energy) throw new RangeError('A duel requires living fighters');
  const fight = {rulesVersion:1, revision:0, round:0, method, player,
    opponent:{...enemy, name:String(opponentInput.name ?? '').slice(0, 300),
      section:String(opponentInput.section ?? '')}, status:'fighting', result:null,
    destination:null, rescued:false, dead:false, events:[]};
  const difference = adjustStrengthEnergy(fight.player, fight.opponent);
  fight.events.push({kind:'adjustment', difference,
    playerEnergy:fight.player.energy, enemyEnergy:fight.opponent.energy});
  // The general rules end the game whenever Erik's Energy reaches zero.
  if (!fight.player.energy) finish(fight, 'loss', 389);
  else if (method === 'extended' && !fight.opponent.energy) finish(fight, 'win', 372);
  return validateFight(fight);
}

export function combatAction(original, action, roll = () => Math.floor(Math.random() * 6) + 1) {
  validateFight(original);
  if (original.status !== 'fighting' || action?.expectedRevision !== original.revision
      || action.kind !== 'round') throw new RangeError('Stale or invalid duel action');
  const {playerDie, enemyDie} = rollDuelDice(action, roll);
  const fight = structuredClone(original);
  const quick = fight.method === 'quick';
  const playerTotal = fight.player.strength + playerDie + (quick ? fight.player.energy : 0);
  const enemyTotal = fight.opponent.strength + enemyDie + (quick ? fight.opponent.energy : 0);
  const difference = playerTotal - enemyTotal;
  let playerDamage = 0, enemyDamage = 0;
  if (quick) {
    if (difference > 1) finish(fight, 'win', 372);
    else if (difference === 1) finish(fight, 'win', 377);
    else if (difference === 0) {
      playerDamage = 1;
      fight.player.energy--;
      finish(fight, 'loss', 382, fight.player.energy > 0);
    } else finish(fight, 'loss', 389);
  } else {
    ({playerDamage, enemyDamage} = resolveDuelStrike(fight.player, fight.opponent, difference));
    if (!fight.player.energy) finish(fight, 'loss', 389);
    else if (!fight.opponent.energy) finish(fight, 'win', 372);
  }
  fight.round++; fight.revision++;
  fight.events.push({kind:'round', round:fight.round, playerDie, enemyDie,
    playerTotal, enemyTotal, playerDamage, enemyDamage,
    playerEnergy:fight.player.energy, enemyEnergy:fight.opponent.energy});
  fight.events = fight.events.slice(-200);
  return validateFight(fight);
}

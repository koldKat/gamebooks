const copy = value => structuredClone(value);

function rating(value, maximum) {
  if (value === '' || value == null || !Number.isInteger(Number(value))
      || Number(value) < 0 || Number(value) > maximum) throw new RangeError('Invalid combat rating');
  return Number(value);
}

function die(roll) {
  const value = roll();
  if (!Number.isInteger(value) || value < 1 || value > 6) throw new RangeError('Invalid die');
  return value;
}

export function startFight({ mode, playerRating, enemyRating, name = '', first = 'player', attribute = 'strength' }) {
  if (!['opposed', 'crossbow'].includes(mode) || !['player', 'enemy'].includes(first)
      || !['strength', 'dexterity'].includes(attribute)) throw new RangeError('Invalid duel');
  const maximum = mode === 'crossbow' ? 6 : 24;
  return { rulesVersion: 1, mode, attribute, name: String(name).trim().slice(0, 200),
    playerRating: rating(playerRating, maximum), enemyRating: rating(enemyRating, maximum),
    next: first, rounds: 0, outcome: null, events: [] };
}

export function advanceFight(original, roll = () => 1 + Math.floor(Math.random() * 6)) {
  if (!original || original.rulesVersion !== 1 || original.outcome) throw new RangeError('No active duel');
  const fight = copy(original);
  fight.events = [];
  fight.rounds++;
  if (fight.mode === 'opposed') {
    const playerDice = [die(roll), die(roll)], enemyDice = [die(roll), die(roll)];
    const playerTotal = playerDice[0] + playerDice[1], enemyTotal = enemyDice[0] + enemyDice[1];
    const playerSuccess = playerTotal <= fight.playerRating, enemySuccess = enemyTotal <= fight.enemyRating;
    if (playerSuccess !== enemySuccess) fight.outcome = playerSuccess ? 'win' : 'loss';
    fight.events.push({ kind: 'contest', playerDice, enemyDice, playerTotal, enemyTotal,
      playerSuccess, enemySuccess, outcome: fight.outcome });
  } else if (fight.mode === 'crossbow') {
    const actor = fight.next, result = die(roll);
    const threshold = actor === 'player' ? fight.playerRating : fight.enemyRating;
    const hit = result <= threshold;
    if (hit) fight.outcome = actor === 'player' ? 'win' : 'loss';
    else fight.next = actor === 'player' ? 'enemy' : 'player';
    fight.events.push({ kind: 'shot', actor, die: result, threshold, hit, outcome: fight.outcome });
  } else throw new RangeError('Invalid duel mode');
  return fight;
}

export function cancelFight(original) {
  if (!original || original.rulesVersion !== 1 || original.outcome) throw new RangeError('No active duel');
  return { ...copy(original), outcome: 'cancelled', events: [] };
}

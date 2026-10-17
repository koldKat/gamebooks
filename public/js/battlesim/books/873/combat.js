import { HEALTH_BONUS, RULES_REVISION } from './definition.js';

const integer = (value, min, max) => {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError('Invalid combat value');
  return value;
};
export const rollDie = () => Math.floor(Math.random() * 6) + 1;

function roll(supplied, random) {
  if (supplied !== undefined && (!Array.isArray(supplied) || supplied.length !== 2)) throw new RangeError('Invalid dice');
  return Array.from({length: 2}, (_, index) => integer(supplied === undefined ? random() : supplied[index], 1, 6));
}

export function validateCharacter(character) {
  if (!character) throw new RangeError('Missing character');
  integer(character.health, 0, 3);
  integer(character.tracers, 0, 12);
  integer(character.aircraftHits, 0, 4);
  return structuredClone(character);
}

export function newCharacter() {
  return {health: 0, tracers: 12, aircraftHits: 0};
}

export function validateEncounter(encounter) {
  if (!encounter || typeof encounter.displayName !== 'string' || !encounter.displayName.trim()) throw new RangeError('Missing encounter name');
  integer(encounter.enemies, 1, 100);
  integer(encounter.playerThreshold, 2, 30);
  integer(encounter.enemyThreshold, 2, 30);
  for (const key of ['aircraft', 'exchange', 'enemyFirst', 'openingExtraShot', 'reinforcement']) {
    if (encounter[key] !== undefined && typeof encounter[key] !== 'boolean') throw new RangeError('Invalid encounter option');
  }
  if (encounter.aircraft && encounter.exchange) throw new RangeError('Conflicting encounter modes');
  if (encounter.exposedFromRound !== undefined) {
    integer(encounter.exposedFromRound, 1, 1000000);
    integer(encounter.exposedThreshold, 2, 30);
  }
  return structuredClone(encounter);
}

// Shot-level results let the panel preserve source-specific order and single exchanges.
export function playerShot(character, encounter, options = {}, supplied, random = rollDie) {
  const player = validateCharacter(character), enemy = validateEncounter(encounter);
  if (player.health === 3 || (enemy.aircraft && player.aircraftHits === 4)) throw new RangeError('Character cannot fight');
  const weapon = options.weapon ?? 0;
  integer(weapon, 0, 2);
  if (options.tracer !== undefined && typeof options.tracer !== 'boolean') throw new RangeError('Invalid ammunition option');
  if (enemy.aircraft && (weapon || options.tracer)) throw new RangeError('Aircraft combat uses aircraft weapons');
  if (options.tracer && !player.tracers) throw new RangeError('No special ammunition left');
  const attackDice = roll(supplied, random);
  const bonus = HEALTH_BONUS[player.health] + 2 + weapon + (options.tracer ? 2 : 0);
  if (options.tracer) player.tracers--;
  const total = attackDice[0] + attackDice[1] + bonus;
  return {rulesRevision: RULES_REVISION, character: player, attackDice, bonus, total, hit: total >= enemy.playerThreshold};
}

export function enemyShot(character, encounter, round = 1, supplied, random = rollDie) {
  const player = validateCharacter(character), enemy = validateEncounter(encounter);
  integer(round, 1, 1000000);
  if (player.health === 3 || (enemy.aircraft && player.aircraftHits === 4)) throw new RangeError('Character cannot fight');
  const attackDice = roll(supplied, random);
  const threshold = enemy.exposedFromRound !== undefined && round >= enemy.exposedFromRound
    ? enemy.exposedThreshold : enemy.enemyThreshold;
  const total = attackDice[0] + attackDice[1];
  const hit = total >= threshold;
  if (hit) {
    if (enemy.aircraft) player.aircraftHits++;
    else player.health++;
  }
  return {rulesRevision: RULES_REVISION, character: player, attackDice, total, threshold, hit,
    defeated: enemy.aircraft ? player.aircraftHits === 4 : player.health === 3};
}

export function resolveExchange(character, encounter, options = {}, supplied = {}, random = rollDie) {
  const enemy = validateEncounter(encounter);
  if (!enemy.exchange) throw new RangeError('Not a single exchange');
  const initial = validateCharacter(character);
  // Both passages explicitly resolve both shots; the wounded-player branch takes precedence.
  const first = enemy.enemyFirst ? 'enemy' : 'player';
  let player, opponent;
  if (first === 'enemy') {
    opponent = enemyShot(initial, enemy, 1, supplied.enemy, random);
    player = playerShot(initial, enemy, options, supplied.player, random);
  } else {
    player = playerShot(initial, enemy, options, supplied.player, random);
    opponent = enemyShot(initial, enemy, 1, supplied.enemy, random);
  }
  const outcome = opponent.hit ? 'hurt' : player.hit ? 'hit' : 'miss';
  return {rulesRevision: RULES_REVISION, character: {...player.character, health: opponent.character.health},
    first, player, opponent, outcome, destination: enemy[outcome], awardWin: false};
}

export function startFight(character, encounter) {
  const player = validateCharacter(character), enemy = validateEncounter(encounter);
  if (enemy.exchange) throw new RangeError('Use a single exchange');
  if (player.health === 3 || (enemy.aircraft && player.aircraftHits === 4)) throw new RangeError('Character cannot fight');
  return {rulesRevision: RULES_REVISION, character: player, encounter: enemy, round: 0,
    remaining: enemy.enemies, playerShots: 0, enemyShots: 0, reinforcementAdded: false, outcome: null};
}

export function addReinforcement(fight) {
  const next = structuredClone(fight);
  if (next.rulesRevision !== RULES_REVISION || next.outcome || !next.encounter.reinforcement || next.reinforcementAdded) throw new RangeError('Reinforcement unavailable');
  integer(next.remaining, 1, 100);
  next.remaining++;
  next.reinforcementAdded = true;
  return next;
}

export function resolveFightRound(fight, options = {}, supplied = {}, random = rollDie) {
  if (options.tracer !== undefined && typeof options.tracer !== 'boolean') throw new RangeError('Invalid ammunition option');
  const next = structuredClone(fight);
  if (next.rulesRevision !== RULES_REVISION || next.outcome) throw new RangeError('Inactive fight');
  next.character = validateCharacter(next.character);
  next.encounter = validateEncounter(next.encounter);
  if (next.encounter.exchange) throw new RangeError('Use a single exchange');
  integer(next.round, 0, 999999);
  integer(next.remaining, 1, 100);
  integer(next.playerShots, 0, 100000000);
  integer(next.enemyShots, 0, 100000000);
  if (next.character.health === 3 || (next.encounter.aircraft && next.character.aircraftHits === 4)) throw new RangeError('Character cannot fight');
  if (options.tracer && !next.character.tracers) throw new RangeError('No special ammunition left');
  next.round++;
  const events = [];
  let playerIndex = 0, enemyIndex = 0;
  const shotDice = (kind, index) => {
    if (supplied[kind] === undefined) return undefined;
    if (!Array.isArray(supplied[kind]) || !supplied[kind][index]) throw new RangeError('Missing supplied shot');
    return supplied[kind][index];
  };
  const playerTurn = () => {
    if (next.outcome) return;
    const shotOptions = {...options, tracer: options.tracer && next.character.tracers > 0};
    const result = playerShot(next.character, next.encounter, shotOptions, shotDice('player', playerIndex++), random);
    next.character = result.character;
    next.playerShots++;
    if (result.hit) next.remaining--;
    if (!next.remaining) next.outcome = 'win';
    events.push({side: 'player', ...result});
  };
  const enemyTurn = () => {
    const count = next.remaining;
    for (let index = 0; index < count && !next.outcome; index++) {
      const result = enemyShot(next.character, next.encounter, next.round, shotDice('enemy', enemyIndex++), random);
      next.character = result.character;
      next.enemyShots++;
      if (result.defeated) next.outcome = 'loss';
      events.push({side: 'enemy', ...result});
    }
  };
  if (next.encounter.enemyFirst) enemyTurn();
  playerTurn();
  if (next.round === 1 && next.encounter.openingExtraShot) playerTurn();
  if (!next.encounter.enemyFirst) enemyTurn();
  return {fight: next, events, destination: next.outcome ? next.encounter[next.outcome] ?? null : null};
}

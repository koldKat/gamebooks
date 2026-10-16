import { integer, rollDice } from '../../engines/sorcery/core.js';
import { CHARACTER_FIELDS, encounterFor, RULES_REVISION } from './definition.js';

export function validateCharacter(character, alive = false) {
  if (!character || typeof character.dead !== 'boolean') throw new RangeError('Invalid character');
  for (const key of CHARACTER_FIELDS) integer(character[key], ['justice', 'debate'].includes(key) ? -10000 : 0);
  if (alive && (character.dead || character.life <= 0 || character.faith <= 0)) throw new RangeError('Character is dead');
  return character;
}

export function newCharacter(allocation = { strength: 8, wisdom: 6, charm: 6 }) {
  for (const key of ['strength', 'wisdom', 'charm']) integer(allocation[key], 4, 12);
  if (allocation.strength + allocation.wisdom + allocation.charm !== 20) throw new RangeError('Allocate twenty points');
  return { strength: allocation.strength, wisdom: allocation.wisdom, charm: allocation.charm,
    life: 30, faith: 200, justice: 0, debate: 0, dead: false };
}

function opponent(row, nonlethal) {
  if (!row || row.strength === '' || row.strength == null || !nonlethal && (row.life === '' || row.life == null)) {
    throw new RangeError('Missing opponent statistic');
  }
  return { displayName: String(row.displayName ?? '').trim().slice(0, 200),
    strength: integer(Number(row.strength)), life: nonlethal ? null : integer(Number(row.life), 1), lost: 0 };
}

export function startFight(section, character, options = {}) {
  validateCharacter(character, true);
  if (![1, 2].includes(options.damageAtThree)) throw new RangeError('Choose damage for difference three');
  for (const key of ['kratuna', 'applyEntry']) {
    if (options[key] != null && typeof options[key] !== 'boolean') throw new RangeError('Invalid option');
  }
  const preset = encounterFor(section);
  if (!preset && Number(section) !== 0) throw new RangeError('Unknown encounter');
  const config = structuredClone(preset ?? { section: 0, bonus: 0, name: '', win: null, lose: null });
  const rows = options.opponents ?? preset?.enemies;
  if (!Array.isArray(rows) || !rows.length || rows.length > 100 || preset && rows.length !== preset.enemies.length) {
    throw new RangeError('Invalid enemy count');
  }
  const fight = { rulesRevision: RULES_REVISION, config, character: structuredClone(character),
    damageAtThree: options.damageAtThree, enemies: rows.map(row => opponent(row, Boolean(config.lossLimit))),
    rounds: 0, playerLost: 0, events: [], outcome: null, destination: null };
  if (config.kratuna && options.kratuna) fight.enemies[0].life = Math.max(0, fight.enemies[0].life - 3);
  if (config.entryLoss && options.applyEntry) {
    fight.character.life = Math.max(0, fight.character.life - config.entryLoss);
    fight.events.push({ kind: 'entry', damage: config.entryLoss });
  }
  return finish(fight);
}

export function targets(fight) {
  if (!fight || fight.outcome) return [];
  return fight.enemies.flatMap((enemy, index) =>
    fight.config.lossLimit ? enemy.lost < fight.config.lossLimit ? [index] : [] : enemy.life > 0 ? [index] : []);
}

function finish(fight) {
  if (fight.character.life <= 0 || fight.character.faith <= 0) {
    fight.character.dead = true;
    fight.outcome = 'loss'; fight.destination = 200;
  } else if (fight.config.lossLimit && fight.playerLost >= fight.config.lossLimit) {
    fight.outcome = 'loss'; fight.destination = fight.config.lose;
  } else if (!targets(fight).length) {
    fight.outcome = 'win'; fight.destination = fight.config.win;
  }
  return fight;
}

export function damageForDifference(difference, damageAtThree) {
  integer(difference, 0, 100000);
  if (![1, 2].includes(damageAtThree)) throw new RangeError('Invalid damage choice');
  return difference === 0 ? 0 : difference < 3 ? 1 : difference === 3 ? damageAtThree : 2;
}

export function round(input, target, roll) {
  if (!input || input.rulesRevision !== RULES_REVISION || !targets(input).includes(target)) throw new RangeError('No active target');
  validateCharacter(input.character, true);
  const fight = structuredClone(input), indices = targets(input);
  const playerRoll = rollDice(roll), playerAttack = playerRoll + fight.character.strength + (fight.config.bonus ?? 0);
  fight.events = []; fight.rounds++;
  // Resolve every living opponent's roll before deciding a simultaneous result.
  for (const index of indices) {
    const enemy = fight.enemies[index], enemyRoll = rollDice(roll), enemyAttack = enemyRoll + enemy.strength;
    const difference = playerAttack - enemyAttack;
    const damage = damageForDifference(Math.abs(difference), fight.damageAtThree);
    fight.events.push({ kind: 'attack', enemy: index, playerRoll, enemyRoll, playerAttack, enemyAttack });
    if (difference > 0 && index === target) {
      enemy.lost += damage;
      if (enemy.life != null) enemy.life = Math.max(0, enemy.life - damage);
      fight.events.push({ kind: 'outgoing', enemy: index, damage });
    } else if (difference < 0) {
      fight.character.life = Math.max(0, fight.character.life - damage);
      fight.playerLost += damage;
      fight.events.push({ kind: 'incoming', enemy: index, damage });
    }
  }
  return finish(fight);
}

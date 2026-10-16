import { attackStrength, damageWithLuck, die, integer, rollDice } from '../../engines/sorcery/core.js';
import { customFightingEncounter } from '../../engines/fighting-fantasy/opponents.js';
import { RULES_REVISION, STARTING_PROVISIONS, encounterFor } from './definition.js';

export { die, integer, rollDice } from '../../engines/sorcery/core.js';

export function validateCharacter(character, alive = false) {
  if (!character) throw new RangeError('Missing character');
  if (alive && character.dead) throw new RangeError('Character is dead');
  for (const key of ['skill', 'stamina', 'luck']) {
    integer(character[key + 'Initial'], 1);
    integer(character[key], alive && key === 'stamina' ? 1 : 0, character[key + 'Initial']);
  }
  integer(character.provisions);
  integer(character.potionUses, 0, 1);
  integer(character.attackModifier, -1000, 1000);
  if (!['skill', 'strength', 'fortune'].includes(character.potion)) throw new RangeError('Invalid potion');
  return character;
}

export function newCharacter(roll) {
  const skill = die(roll) + 6, stamina = rollDice(roll) + 12, luck = die(roll) + 6;
  return { skill, skillInitial: skill, stamina, staminaInitial: stamina, luck, luckInitial: luck,
    provisions: STARTING_PROVISIONS, potion: 'skill', potionUses: 1, attackModifier: 0, dead: false };
}

export function testLuck(character, roll) {
  validateCharacter(character, true);
  const next = structuredClone(character), value = rollDice(roll), lucky = value <= next.luck;
  next.luck = Math.max(0, next.luck - 1);
  return { character: next, roll: value, lucky };
}

export function startFight(section, character, { applyEntry = true, opponents } = {}, roll) {
  validateCharacter(character, true);
  const config = encounterFor(section) ?? customFightingEncounter(section, opponents);
  if (!config || typeof applyEntry !== 'boolean') throw new RangeError('Invalid encounter');
  const setup = structuredClone(config);
  if (opponents && !config.custom) {
    const edited = customFightingEncounter(0, opponents).enemies;
    if (edited.length !== config.enemies.length) throw new RangeError('Invalid encounter size');
    setup.enemies = edited.map((enemy, index) => ({ ...enemy, key: config.enemies[index].key }));
  }
  const fight = { rulesRevision: RULES_REVISION, config: setup, character: structuredClone(character),
    enemies: structuredClone(setup.enemies), rounds: 0, winningRounds: 0, weakPointAttempts: 0,
    pending: [], events: [], outcome: null, destination: null };
  if (applyEntry && (config.entryDamage || config.entryDieMultiplier)) {
    const value = config.entryDieMultiplier ? die(roll) : null;
    const damage = value === null ? config.entryDamage : value * config.entryDieMultiplier;
    fight.character.stamina = Math.max(0, fight.character.stamina - damage);
    fight.events.push({ kind: 'entry', roll: value, damage });
    if (!fight.character.stamina) { fight.outcome = 'loss'; fight.character.dead = true; }
  }
  return fight;
}

const living = fight => fight.enemies.flatMap((enemy, index) => enemy.stamina > 0 ? [index] : []);

export function targets(fight) {
  if (!fight || fight.outcome) return [];
  if (fight.config.mode === 'two-claws') return [0, 1];
  const indices = living(fight);
  return fight.config.mode === 'group' ? indices : indices.slice(0, 1);
}

function requireFight(fight, pending = false) {
  if (!fight || fight.rulesRevision !== RULES_REVISION || fight.outcome || !Array.isArray(fight.pending)
    || Boolean(fight.pending.length) !== pending) throw new RangeError('No active fight');
  validateCharacter(fight.character, true);
}

function finish(fight) {
  if (!fight.character.stamina) { fight.outcome = 'loss'; fight.character.dead = true; fight.pending = []; return fight; }
  if (fight.pending.length || fight.outcome) return fight;
  if (fight.escaping) { fight.outcome = 'escaped'; fight.destination = fight.config.escape.destination; }
  else if (!living(fight).length) { fight.outcome = 'win'; fight.destination = fight.config.win ?? null; }
  return fight;
}

export function round(input, target, roll) {
  requireFight(input);
  if (!targets(input).includes(target)) throw new RangeError('Invalid target');
  const fight = structuredClone(input);
  fight.events = []; fight.rounds++;
  const modifier = fight.character.attackModifier + (fight.config.attackModifier ?? 0);
  const skill = Math.max(0, fight.character.skill + (fight.config.skillModifier ?? 0));
  const player = attackStrength(skill, modifier, roll);
  const attacks = targets(fight).map(index => {
    const enemy = fight.config.mode === 'two-claws' ? 0 : index;
    return { index, enemy, attack: attackStrength(fight.enemies[enemy].skill, 0, roll) };
  });
  for (const { index, enemy, attack } of attacks) {
    fight.events.push({ kind: 'attack', enemy, claw: fight.config.mode === 'two-claws' ? index : null,
      playerDice: player.dice, enemyDice: attack.dice, playerAttack: player.total, enemyAttack: attack.total });
  }
  if (fight.config.fatalEnemyAttack && attacks.some(({ attack }) => attack.total === fight.config.fatalEnemyAttack)) {
    fight.outcome = 'loss'; fight.character.dead = true; fight.destination = fight.config.fatalDestination; return fight;
  }
  if (fight.config.enemyWinDestination && attacks.some(({ attack }) => attack.total > player.total)) {
    fight.outcome = 'captured'; fight.destination = fight.config.enemyWinDestination; return fight;
  }
  const chosen = attacks.find(attack => attack.index === target);
  if (player.total > chosen.attack.total) {
    fight.winningRounds++;
    if (fight.config.weakPoint) {
      fight.pending.push({ kind: 'weakPoint', enemy: chosen.enemy });
      return fight;
    }
    if (fight.config.winningRounds && fight.winningRounds >= fight.config.winningRounds) {
      fight.outcome = 'win'; fight.destination = fight.config.win; return fight;
    }
  }
  for (const { index, enemy, attack } of attacks) {
    if (player.total > attack.total && index === target) fight.pending.push({ kind: 'outgoing', enemy, damage: 2 });
    else if (attack.total > player.total) fight.pending.push({ kind: 'incoming', enemy, damage: 2 });
  }
  return finish(fight);
}

export function resolveLuck(input, useLuck, roll) {
  requireFight(input, true);
  if (typeof useLuck !== 'boolean') throw new RangeError('Invalid Luck choice');
  const fight = structuredClone(input), event = fight.pending.shift();
  fight.events = [];
  if (event.kind === 'weakPoint' && !useLuck) throw new RangeError('Mandatory Luck test');
  let lucky = null;
  if (useLuck) {
    const result = testLuck(fight.character, roll);
    fight.character = result.character; lucky = result.lucky;
    fight.events.push({ kind: 'luck', roll: result.roll, lucky });
  }
  if (event.kind === 'weakPoint') {
    fight.weakPointAttempts++;
    fight.outcome = lucky ? 'win' : fight.weakPointAttempts === 1 ? 'continue' : 'loss';
    fight.destination = lucky ? fight.config.win : fight.weakPointAttempts === 1 ? fight.config.retry : fight.config.failure;
    if (fight.outcome === 'loss') fight.character.dead = true;
    return fight;
  }
  const damage = damageWithLuck(event.kind === 'outgoing' ? 'outgoing' : 'incoming', event.damage, lucky);
  if (event.kind === 'outgoing') fight.enemies[event.enemy].stamina = Math.max(0, fight.enemies[event.enemy].stamina - damage);
  else fight.character.stamina = Math.max(0, fight.character.stamina - damage);
  fight.events.push({ ...event, damage });
  return finish(fight);
}

export function continueWeakPoint(input) {
  if (!input || input.rulesRevision !== RULES_REVISION || input.outcome !== 'continue' || input.destination !== 21
    || !input.config.weakPoint || input.weakPointAttempts !== 1 || input.pending.length) throw new RangeError('No second attempt');
  validateCharacter(input.character, true);
  const fight = structuredClone(input);
  fight.outcome = null; fight.destination = null; fight.events = [];
  return fight;
}

export function canEscape(fight) {
  return Boolean(fight && !fight.outcome && !fight.pending.length && fight.config.escape
    && fight.rounds >= (fight.config.escape.rounds ?? 0)
    && fight.enemies.filter(enemy => enemy.stamina === 0).length >= (fight.config.escape.defeated ?? 0));
}

export function escapeFight(input) {
  requireFight(input);
  if (!canEscape(input)) throw new RangeError('Escape unavailable');
  const fight = structuredClone(input);
  fight.events = []; fight.escaping = true;
  fight.pending = [{ kind: 'incoming', enemy: living(fight)[0], damage: 2 }];
  return fight;
}

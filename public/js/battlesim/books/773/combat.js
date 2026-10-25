import { attackStrength, damageWithLuck, die, integer, rollDice } from '../../engines/sorcery/core.js';
import { customFightingEncounter } from '../../engines/fighting-fantasy/opponents.js';
import { encounterFor, RULES_REVISION, CHAMPION_RULES } from './definition.js';

export { die, integer, rollDice } from '../../engines/sorcery/core.js';

export function validateCharacter(character, alive = false) {
  if (!character || typeof character.dead !== 'boolean' || alive && character.dead) throw new RangeError('Invalid character');
  for (const key of ['skill', 'stamina', 'luck']) {
    integer(character[key + 'Initial'], 1);
    integer(character[key], alive && key === 'stamina' ? 1 : 0, character[key + 'Initial']);
  }
  integer(character.attackModifier, -1000, 1000);
  return character;
}

export function newCharacter(roll) {
  const skill = die(roll) + 6, stamina = rollDice(roll) + 12, luck = die(roll) + 6;
  return { skill, skillInitial: skill, stamina, staminaInitial: stamina, luck, luckInitial: luck,
    attackModifier: 0, dead: false };
}

export function testLuck(character, roll) {
  validateCharacter(character, true);
  const next = structuredClone(character), value = rollDice(roll), lucky = value <= next.luck;
  next.luck = Math.max(0, next.luck - 1);
  return { character: next, roll: value, lucky };
}

export function startFight(section, character, options = {}) {
  validateCharacter(character, true);
  const config = encounterFor(section) ?? customFightingEncounter(section, options.opponents);
  if (!config) throw new RangeError('Invalid encounter');
  const setup = structuredClone(config);
  if (options.opponents && !config.custom) {
    const edited = customFightingEncounter(0, options.opponents).enemies;
    if (edited.length !== config.enemies.length) throw new RangeError('Invalid enemy count');
    setup.enemies = edited;
  }
  for (const key of ['applyEntry', 'magicSword', 'hammer', 'groupMode']) {
    if (options[key] != null && typeof options[key] !== 'boolean') throw new RangeError('Invalid option');
  }
  setup.magicSword = Boolean(options.magicSword);
  setup.hammer = Boolean(options.hammer);
  setup.groupMode = Boolean(config.selectableGroupMode && options.groupMode);
  const fight = { rulesRevision: RULES_REVISION, config: setup, character: structuredClone(character),
    enemies: structuredClone(setup.enemies), rounds: 0, playerWins: 0, enemyWins: 0, airlessRounds: 0,
    bleeding: Boolean(config.bleeding), pending: [], events: [], outcome: null, destination: null };
  if (options.applyEntry !== false) {
    if (config.entryDamage) {
      fight.character.stamina = Math.max(0, fight.character.stamina - config.entryDamage);
      fight.events.push({ kind: 'entry', damage: config.entryDamage });
    }
    for (const [stat, amount] of Object.entries(config.entryHealing ?? {})) {
      fight.character[stat] = Math.min(fight.character[stat + 'Initial'], fight.character[stat] + amount);
      fight.events.push({ kind: 'healing', stat, amount });
    }
  }
  if (!fight.character.stamina) return lose(fight);
  if (config.requiresMagicSword && !setup.magicSword) return lose(fight, CHAMPION_RULES.swordFailure);
  return fight;
}

const living = fight => fight.enemies.flatMap((enemy, index) => enemy.stamina > 0 ? [index] : []);

export function targets(fight) {
  if (!fight || fight.outcome) return [];
  return fight.config.groupMode ? living(fight) : living(fight).slice(0, 1);
}

function requireFight(fight, pending = false) {
  if (!fight || fight.rulesRevision !== RULES_REVISION || fight.outcome
    || Boolean(fight.pending.length) !== pending) throw new RangeError('No active fight');
  validateCharacter(fight.character, true);
}

function lose(fight, destination = null) {
  fight.outcome = 'loss'; fight.destination = destination; fight.character.dead = true; fight.pending = [];
  return fight;
}

function finish(fight) {
  if (!fight.character.stamina) return lose(fight);
  if (fight.pending.length || fight.outcome) return fight;
  if (!living(fight).length) { fight.outcome = 'win'; fight.destination = fight.config.win; return fight; }
  if (fight.pauseEnemy != null) {
    fight.outcome = 'paused'; fight.destination = fight.config.pauseOnLoss;
  } else if (fight.config.roundLimit && fight.rounds >= fight.config.roundLimit && !fight.resumed) {
    fight.outcome = 'paused'; fight.destination = fight.config.pauseAt;
  }
  return fight;
}

export function round(input, target, roll) {
  requireFight(input);
  if (!targets(input).includes(target)) throw new RangeError('Invalid target');
  const fight = structuredClone(input), config = fight.config;
  const wasBleeding = fight.bleeding;
  fight.events = []; fight.rounds++;
  if (config.fear) {
    const value = die(roll);
    fight.events.push({ kind: 'fear', roll: value });
    if (value <= CHAMPION_RULES.fear.maximum) return lose(fight, CHAMPION_RULES.fear.destination);
  }
  const skill = Math.max(0, fight.character.skill + (config.skillModifier ?? 0));
  const player = attackStrength(skill, fight.character.attackModifier, roll);
  const indices = config.twoHeads ? [0, 0] : targets(fight);
  const attacks = indices.map(enemy => ({ enemy, attack: attackStrength(fight.enemies[enemy].skill, 0, roll) }));
  for (const { enemy, attack } of attacks) fight.events.push({ kind: 'attack', enemy,
    playerAttack: player.total, enemyAttack: attack.total, playerDice: player.dice, enemyDice: attack.dice });
  const won = config.twoHeads ? attacks.every(({ attack }) => player.total > attack.total)
    : player.total > attacks.find(entry => entry.enemy === target).attack.total;
  const lost = attacks.some(({ attack }) => player.total < attack.total);
  if (config.tugOfWar) {
    if (won) fight.playerWins++;
    else if (lost) fight.enemyWins++;
    fight.events.push({ kind: 'tug', player: fight.playerWins, enemy: fight.enemyWins });
    if (fight.enemyWins === CHAMPION_RULES.tugWins) return lose(fight, config.failure);
    if (fight.playerWins === CHAMPION_RULES.tugWins) { fight.outcome = 'win'; fight.destination = config.win; }
    return fight;
  }
  if (lost && config.fatalLostRound) return lose(fight, config.fatalLostRound);
  if (won) fight.playerWins++;
  fight.airlessRounds = won ? 0 : fight.airlessRounds + 1;
  if (config.drowning && fight.airlessRounds >= CHAMPION_RULES.drowningRounds) return lose(fight);
  if (won) fight.pending.push({ kind: 'outgoing', enemy: target,
    damage: config.requiresHammer && !config.hammer ? CHAMPION_RULES.withoutHammerDamage : 2 });
  for (const { enemy, attack } of attacks) {
    if (attack.total > player.total && !wasBleeding) fight.pending.push({ kind: 'incoming', enemy, damage: 2 });
  }
  if (lost && config.pauseOnLoss) fight.pauseEnemy = target;
  if (lost && config.bleedOnLoss) fight.bleeding = true;
  let damage = wasBleeding ? CHAMPION_RULES.bleedingDamage : 0;
  if (config.drainingCompanion && target === 0 && fight.enemies[1]?.stamina > 0) damage += CHAMPION_RULES.companionDrain;
  if (config.fire) {
    const value = die(roll);
    damage += CHAMPION_RULES.fire[config.fire][value - 1];
    fight.events.push({ kind: 'fire', roll: value });
  }
  if (damage) fight.pending.push({ kind: 'automatic', damage });
  return finish(fight);
}

export function resolveLuck(input, useLuck, roll) {
  requireFight(input, true);
  if (typeof useLuck !== 'boolean') throw new RangeError('Invalid Luck choice');
  const fight = structuredClone(input), event = fight.pending.shift();
  if (useLuck && event.kind === 'automatic') throw new RangeError('Automatic damage cannot use Luck');
  fight.events = [];
  let lucky = null;
  if (useLuck) {
    const result = testLuck(fight.character, roll);
    fight.character = result.character; lucky = result.lucky;
    fight.events.push({ kind: 'luck', roll: result.roll, lucky });
  }
  const damage = event.kind === 'automatic' ? event.damage : damageWithLuck(event.kind, event.damage, lucky);
  if (event.kind === 'outgoing') fight.enemies[event.enemy].stamina = Math.max(0, fight.enemies[event.enemy].stamina - damage);
  else fight.character.stamina = Math.max(0, fight.character.stamina - damage);
  fight.events.push({ ...event, damage });
  return finish(fight);
}

export function resumeFight(input, character = input?.character) {
  if (!input || input.rulesRevision !== RULES_REVISION || input.outcome !== 'paused'
    || !input.config.resumeAt || input.pending.length) throw new RangeError('No interrupted fight');
  validateCharacter(character, true);
  const fight = structuredClone(input);
  fight.character = structuredClone(character); fight.outcome = null; fight.destination = null;
  fight.resumed = true; fight.events = [];
  if (fight.pauseEnemy != null) {
    fight.enemies[fight.pauseEnemy].stamina = 0;
    delete fight.pauseEnemy;
  }
  return finish(fight);
}

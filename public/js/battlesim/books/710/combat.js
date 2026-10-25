import { ENCOUNTERS, TEMPLE_RULES } from './definition.js';

const clone = value => structuredClone(value);
function integer(value, min = 0, max = 10000) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError('Invalid Temple of Terror value');
  return value;
}
function die(roll = () => Math.floor(Math.random() * 6) + 1) { return integer(roll(6), 1, 6); }
function dice(roll) { return die(roll) + die(roll); }
function actor(fight) { return fight.ally ?? fight.player; }

export function validateCharacter(character, alive = false) {
  if (!character) throw new RangeError('No character');
  if (alive && character.dead) throw new RangeError('Character is dead');
  for (const key of ['skill', 'stamina', 'luck']) {
    integer(character[key], alive && key === 'stamina' ? 1 : 0);
    integer(character[key + 'Initial'], 1);
  }
  if (character.stamina > character.staminaInitial || character.luck > character.luckInitial) throw new RangeError('Stat exceeds maximum');
  integer(character.provisions); integer(character.gold); integer(character.attackModifier, -1000, 1000);
  if (typeof character.dagger !== 'boolean') throw new RangeError('Invalid dagger');
  return character;
}

export function newCharacter(roll) {
  const skill = die(roll) + 6, stamina = dice(roll) + 12, luck = die(roll) + 6;
  return { skill, skillInitial: skill, stamina, staminaInitial: stamina, luck, luckInitial: luck,
    provisions: 10, gold: 25, attackModifier: 0, dagger: false, dead: false };
}

export function targets(fight) {
  if (!fight || fight.outcome) return [];
  const alive = fight.enemies.flatMap((enemy, index) => enemy.stamina > 0 ? [index] : []);
  return fight.config.simultaneous ? alive : alive.slice(0, 1);
}

export function startFight(section, character, { manualStamina = null, opponents = null } = {}) {
  validateCharacter(character, true);
  const source = section === 0 && opponents?.length ? {custom: true, section: 0, enemies: opponents}
    : ENCOUNTERS.find(encounter => encounter.section === section);
  if (!source) throw new RangeError('Unknown encounter');
  const config = clone(source), player = clone(character);
  if (opponents) {
    if (!Array.isArray(opponents) || !opponents.length || opponents.length > 100
        || !config.custom && opponents.length !== config.enemies.length) throw new RangeError('Invalid opponent count');
    config.enemies = opponents.map((enemy, index) => {
      integer(enemy.skill); integer(enemy.stamina, 1);
      if (typeof enemy.displayName !== 'string') throw new RangeError('Invalid opponent name');
      return {...config.enemies[index], ...enemy, key: config.enemies[index]?.key ?? 'custom' + index};
    });
  }
  const enemies = config.enemies.map(enemy => {
    const stamina = enemy.stamina === null ? integer(manualStamina, 1) : enemy.stamina;
    return { ...enemy, stamina, staminaInitial: stamina };
  });
  const ally = config.ally ? { ...config.ally, staminaInitial: config.ally.stamina } : null;
  const fight = { rulesRevision: 1, config, player, ally, enemies, rounds: 0, lostRounds: 0,
    pending: [], events: [], outcome: null, destination: null };
  if (config.fatalSkillZero && !actor(fight).skill) finish(fight, 'loss', 'skillZero');
  return fight;
}

function requireFight(fight) {
  if (!fight || fight.rulesRevision !== 1 || fight.outcome) throw new RangeError('No active fight');
  validateCharacter(fight.player, !fight.config.ally);
  if (actor(fight).stamina <= 0 || !Array.isArray(fight.pending)) throw new RangeError('Invalid combatant');
}
function finish(fight, outcome, reason) {
  fight.outcome = outcome; fight.reason = reason;
  if (outcome === 'loss') fight.player.dead = true;
  fight.destination = (outcome === 'win' ? fight.config.win : fight.config.loss) ?? null;
  fight.pending = [];
}
function complete(fight) {
  if (fight.outcome || fight.pending.length) return;
  if (!actor(fight).stamina) finish(fight, 'loss', 'stamina');
  else if (fight.config.drowning && fight.rounds >= actor(fight).skill) finish(fight, 'loss', 'drowning');
  else if (fight.enemies.every(enemy => !enemy.stamina)) finish(fight, 'win', 'defeated');
}
function applyHit(fight, hit, modifier = 0) {
  const damage = Math.max(0, hit.damage + modifier);
  const combatant = hit.kind === 'outgoing' ? fight.enemies[hit.enemy] : actor(fight);
  combatant.stamina = Math.max(0, combatant.stamina - damage);
  fight.events.push({ ...hit, damage });
  if (!actor(fight).stamina) finish(fight, 'loss', 'stamina');
}
function automaticHits(fight) {
  if (fight.config.ally || !fight.player.luck) {
    while (fight.pending.length && !fight.outcome) applyHit(fight, fight.pending.shift());
  }
  complete(fight);
}

export function round(input, target, roll) {
  requireFight(input);
  if (input.pending.length || !targets(input).includes(target)) throw new RangeError('Invalid target');
  const fight = clone(input);
  fight.rounds++; fight.events = [];
  const modifier = fight.config.ally ? 0 : fight.player.attackModifier - (fight.config.daggerPenalty && !fight.player.dagger ? TEMPLE_RULES.daggerPenalty : 0);
  const playerAttack = dice(roll) + actor(fight).skill + modifier;
  let lost = false;
  for (const index of targets(fight)) {
    const enemyAttack = dice(roll) + fight.enemies[index].skill;
    fight.events.push({ kind: 'attack', enemy: index, playerAttack, enemyAttack });
    if (playerAttack > enemyAttack && index === target) {
      let wounds = true;
      if (fight.config.partialImmunity) {
        const value = die(roll); wounds = value >= TEMPLE_RULES.immunityMinimum;
        fight.events.push({ kind: 'immunity', roll: value, wounds });
      }
      if (wounds) fight.pending.push({ kind: 'outgoing', enemy: index, damage: 2 });
    } else if (enemyAttack > playerAttack) {
      lost = true;
      let damage = 2;
      if (fight.config.lightning) {
        const value = die(roll);
        if (value <= TEMPLE_RULES.lightning.maximum) damage += TEMPLE_RULES.lightning.damage;
        fight.events.push({ kind: 'lightning', roll: value });
      }
      fight.pending.push({ kind: 'incoming', enemy: index, damage });
    }
  }
  if (lost) {
    fight.lostRounds++;
    if (fight.config.fatalHit) finish(fight, 'loss', 'fatalHit');
    else if (fight.config.paralysis && fight.lostRounds >= fight.config.paralysis) finish(fight, 'loss', 'paralysis');
  }
  if (!fight.outcome && fight.config.fireBreath) {
    const value = die(roll);
    fight.events.push({ kind: 'fire', roll: value });
    if (value <= TEMPLE_RULES.fireBreath.maximum) fight.pending.push({ kind: 'fireHit', damage: TEMPLE_RULES.fireBreath.damage });
  }
  automaticHits(fight);
  return fight;
}

export function resolveLuck(input, useLuck, roll) {
  requireFight(input);
  if (!input.pending.length || typeof useLuck !== 'boolean' || input.config.ally || useLuck && !input.player.luck) {
    throw new RangeError('No eligible pending wound');
  }
  const fight = clone(input), hit = fight.pending.shift();
  fight.events = [];
  let modifier = 0;
  if (useLuck) {
    const value = dice(roll), lucky = value <= fight.player.luck;
    fight.player.luck--;
    modifier = hit.kind === 'outgoing' ? (lucky ? 2 : -1) : (lucky ? -1 : 1);
    fight.events.push({ kind: 'luck', roll: value, lucky });
  }
  applyHit(fight, hit, modifier);
  automaticHits(fight);
  return fight;
}

export { dice as rollDice };

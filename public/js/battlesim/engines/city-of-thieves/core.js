import { THIEVES_FIGHTS, THIEVES_EQUIPMENT } from './roster.js';
import { customFightingEncounter } from '../fighting-fantasy/opponents.js';

const clone = value => structuredClone(value);
function integer(value, min = 0, max = 10000) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError('Invalid City of Thieves value');
  return value;
}
function die(roll = () => Math.floor(Math.random() * 6) + 1) { return integer(roll(6), 1, 6); }
function dice(roll) { return die(roll) + die(roll); }
export function validateThievesCharacter(character, alive = false) {
  if (!character) throw new RangeError('No character');
  for (const key of ['skill', 'stamina', 'luck']) {
    integer(character[key], alive && key === 'stamina' ? 1 : 0);
    integer(character[key + 'Initial'], 1);
    if (character[key] > character[key + 'Initial']) throw new RangeError('Stat exceeds initial value');
  }
  for (const key of ['provisions', 'gold']) integer(character[key]);
  integer(character.potionUses, 0, 1);
  if (!['skill', 'strength', 'fortune'].includes(character.potion)) throw new RangeError('Invalid potion');
  integer(character.attackModifier, -1000, 1000);
  for (const key of THIEVES_EQUIPMENT) {
    if (typeof character[key] !== 'boolean') throw new RangeError('Invalid equipment');
  }
  return character;
}
export function newThievesCharacter(roll) {
  const skill = die(roll) + 6, stamina = dice(roll) + 12, luck = die(roll) + 6;
  return { skill, skillInitial: skill, stamina, staminaInitial: stamina, luck, luckInitial: luck,
    provisions: 10, gold: 30, potion: 'skill', potionUses: 1, attackModifier: 0,
    ...Object.fromEntries(THIEVES_EQUIPMENT.map(key => [key, false])) };
}
function effectiveSkill(character) {
  return character.skill + (character.chainmail ? 2 : 0)
    + ['magicShield', 'unicornShield', 'magicHelmet', 'elvenBoots'].filter(key => character[key]).length
    - ['cursedShield', 'cursedBrooch'].filter(key => character[key]).length;
}
export function startThievesFight(section, character, { applyEntry = true, randomEnemy = 0, opponents } = {}, roll) {
  validateThievesCharacter(character, true);
  const config = THIEVES_FIGHTS.find(fight => fight.section === section) ?? customFightingEncounter(section, opponents);
  if (!config || typeof applyEntry !== 'boolean') throw new RangeError('Invalid encounter');
  const fight = { rulesRevision: 1, config: clone(config), character: clone(character),
    enemies: clone(config.enemies).map(enemy => ({ ...enemy, initialStamina: enemy.stamina })),
    group: 0, rounds: 0, status: 'fighting', pending: [], events: [], destination: null };
  if (config.randomEnemy) {
    integer(randomEnemy, 0, 6);
    const selected = randomEnemy || die(roll);
    fight.config.groups = [[selected - 1]];
    fight.events.push({ kind: 'randomEnemy', roll: selected, enemy: selected - 1 });
  }
  if (applyEntry && config.entry) {
    fight.character.stamina = Math.max(0, fight.character.stamina - config.entry.stamina);
    fight.character.skill = Math.max(0, fight.character.skill - config.entry.skill);
    fight.events.push({ kind: 'entry', ...config.entry });
  }
  if (!fight.character.stamina) fight.status = 'loss';
  return fight;
}
export function thievesTargets(fight) {
  return fight.status === 'fighting' ? fight.config.groups[fight.group]
    .filter(index => fight.enemies[index].stamina > 0) : [];
}
function requireFight(fight) {
  if (!fight || fight.rulesRevision !== 1 || fight.status !== 'fighting') throw new RangeError('No active fight');
  validateThievesCharacter(fight.character, true);
  if (!Array.isArray(fight.pending)) throw new RangeError('Invalid pending hits');
}
function complete(fight) {
  if (fight.pending.length) return;
  if (!fight.character.stamina) { fight.status = 'loss'; return; }
  if (fight.escaping) {
    const escape = fight.config.escape;
    fight.status = 'escaped'; fight.destination = escape.section;
    fight.character.skill = Math.max(0, fight.character.skill - (escape.skillLoss || 0));
    if (escape.discardShield) {
      for (const key of ['magicShield', 'unicornShield', 'cursedShield']) fight.character[key] = false;
    }
  } else {
    while (fight.group < fight.config.groups.length &&
      fight.config.groups[fight.group].every(index => !fight.enemies[index].stamina)) fight.group++;
    if (fight.group < fight.config.groups.length) return;
    fight.status = 'win';
    const timed = fight.config.timedWin;
    fight.destination = timed && fight.rounds > timed.rounds ? timed.late : fight.config.win;
  }
  if (fight.character.healingBrooch) {
    const before = fight.character.stamina;
    fight.character.stamina = Math.min(fight.character.staminaInitial, before + 1);
    fight.events.push({ kind: 'brooch', amount: fight.character.stamina - before });
  }
}
function applyHit(fight, event, modifier = 0) {
  const damage = Math.max(0, event.damage + modifier);
  if (event.kind === 'outgoing') {
    fight.enemies[event.enemy].stamina = Math.max(0, fight.enemies[event.enemy].stamina - damage);
  } else {
    fight.character.stamina = Math.max(0, fight.character.stamina - damage);
  }
  fight.events.push({ ...event, appliedDamage: damage });
  if (!fight.character.stamina) {
    fight.pending = []; fight.status = 'loss';
  }
}
export function thievesRound(input, target, roll) {
  requireFight(input);
  if (input.pending.length || !thievesTargets(input).includes(target)) throw new RangeError('Invalid target');
  const fight = clone(input);
  fight.events = []; fight.rounds++;
  const playerAttack = dice(roll) + effectiveSkill(fight.character)
    + fight.character.attackModifier + (fight.config.attackModifier || 0);
  for (const index of thievesTargets(fight)) {
    const enemyAttack = dice(roll) + fight.enemies[index].skill;
    fight.events.push({ kind: 'attack', enemy: index, playerAttack, enemyAttack });
    if (playerAttack > enemyAttack && index === target) {
      fight.pending.push({ kind: 'outgoing', enemy: index, damage: 2 });
    } else if (enemyAttack > playerAttack) {
      fight.pending.push({ kind: 'incoming', enemy: index, damage: fight.config.enemyDamage || 2 });
    }
  }
  if (fight.config.fireBreath) {
    const fire = die(roll);
    fight.events.push({ kind: 'fireRoll', roll: fire });
    if (fire <= 3) fight.pending.push({ kind: 'fire', damage: 1 });
  }
  if (!fight.character.luck) {
    while (fight.pending.length && fight.status === 'fighting') applyHit(fight, fight.pending.shift());
  }
  complete(fight);
  return fight;
}
export function resolveThievesLuck(input, useLuck, roll) {
  requireFight(input);
  if (!input.pending.length || typeof useLuck !== 'boolean') throw new RangeError('No pending wound');
  if (useLuck && !input.character.luck) throw new RangeError('No Luck remaining');
  const fight = clone(input), event = fight.pending.shift();
  fight.events = [];
  let modifier = 0;
  if (useLuck) {
    const total = dice(roll), lucky = total <= fight.character.luck;
    fight.character.luck--;
    modifier = event.kind === 'outgoing' ? (lucky ? 2 : -1) : (lucky ? -1 : 1);
    fight.events.push({ kind: 'luck', roll: total, lucky });
  }
  applyHit(fight, event, modifier);
  if (!fight.character.luck) {
    while (fight.pending.length && fight.status === 'fighting') applyHit(fight, fight.pending.shift());
  }
  complete(fight);
  return fight;
}
export function canEscapeThieves(fight) {
  return fight?.status === 'fighting' && !fight.pending.length && !!fight.config.escape
    && fight.rounds >= (fight.config.escape.rounds || 0)
    && fight.group >= (fight.config.escape.afterGroup || 0);
}
export function escapeThievesFight(input) {
  requireFight(input);
  if (!canEscapeThieves(input)) throw new RangeError('Cannot escape');
  const fight = clone(input);
  fight.events = []; fight.escaping = true;
  fight.pending.push({ kind: 'escape', damage: 2 });
  if (!fight.character.luck) applyHit(fight, fight.pending.shift());
  complete(fight);
  return fight;
}
export function bypassThievesFight(input) {
  requireFight(input);
  const bypass = input.config.bypass;
  if (input.rounds || input.pending.length || !bypass || !input.character[bypass.item]) {
    throw new RangeError('Cannot bypass encounter');
  }
  const fight = clone(input);
  fight.status = 'bypassed'; fight.destination = bypass.section; fight.events = [];
  return fight;
}
export function healThievesCharacter(character, item) {
  validateThievesCharacter(character, true);
  const next = clone(character);
  if (item === 'provisions') {
    if (!next.provisions || next.stamina === next.staminaInitial) throw new RangeError('Cannot eat');
    next.provisions--; next.stamina = Math.min(next.staminaInitial, next.stamina + 4);
  } else if (item === 'potion') {
    if (!next.potionUses) throw new RangeError('No potion');
    next.potionUses--;
    if (next.potion === 'fortune') { next.luckInitial++; next.luck = next.luckInitial; }
    else if (next.potion === 'strength') next.stamina = next.staminaInitial;
    else next.skill = next.skillInitial;
  } else throw new RangeError('Invalid healing item');
  return next;
}
export function testThievesLuck(character, roll) {
  validateThievesCharacter(character, true);
  if (!character.luck) throw new RangeError('No Luck');
  const next = clone(character), total = dice(roll), lucky = total <= next.luck;
  next.luck--;
  return { character: next, roll: total, lucky };
}

import { customFightingEncounter } from '../../engines/fighting-fantasy/opponents.js';
import { ENCOUNTERS, DEEP_RULES, RULES_REVISION, SWIFTSTINGER_DAMAGE } from './definition.js';

const clone = value => structuredClone(value);
function integer(value, min = 0, max = 10000) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError('Invalid Demons of the Deep value');
  return value;
}
function die(roll = sides => Math.floor(Math.random() * sides) + 1) { return integer(roll(6), 1, 6); }
export function rollDice(roll) { return die(roll) + die(roll); }

export function validateCharacter(character, alive = false) {
  if (!character || alive && character.dead) throw new RangeError('No living character');
  for (const key of ['skill', 'stamina', 'luck']) {
    integer(character[key], alive && key === 'stamina' ? 1 : 0);
    integer(character[key + 'Initial'], 1);
    if (character[key] > character[key + 'Initial']) throw new RangeError('Stat exceeds initial value');
  }
  integer(character.provisions); integer(character.gold);
  for (const key of ['attackModifier', 'weaponModifier', 'nextFightModifier']) integer(character[key], -1000, 1000);
  for (const key of ['unarmed', 'talisman', 'swiftstinger', 'anemoneRing', 'dead']) {
    if (typeof character[key] !== 'boolean') throw new RangeError('Invalid equipment state');
  }
  return character;
}

export function newCharacter(roll) {
  const skill = die(roll) + 6, stamina = rollDice(roll) + 12, luck = die(roll) + 6;
  return { skill, skillInitial: skill, stamina, staminaInitial: stamina, luck, luckInitial: luck,
    provisions: 10, gold: 0, attackModifier: 0, weaponModifier: 0, nextFightModifier: 0,
    unarmed: false, talisman: false, swiftstinger: false, anemoneRing: false, dead: false };
}

export function targets(fight) {
  if (!fight || fight.outcome) return [];
  const alive = fight.enemies.flatMap((enemy, index) => enemy.stamina > 0 ? [index] : []);
  if (fight.config.mode === 'simultaneous') return alive;
  return alive.slice(0, fight.config.mode === 'rolling-pair' ? 2 : 1);
}

export function startFight(section, character, options = {}) {
  validateCharacter(character, true);
  const source = ENCOUNTERS.find(encounter => encounter.section === section) ?? customFightingEncounter(section, options.opponents);
  if (!source) throw new RangeError('Unknown encounter');
  const config = clone(source), player = clone(character);
  let enemies = config.enemies.map(enemy => ({ ...enemy, staminaInitial: enemy.stamina }));
  if (config.remainingBatFish) enemies = enemies.slice(0, integer(options.remainingBatFish ?? config.enemies.length, 1, config.enemies.length));
  if (config.injuredOgre && options.previousOgreStamina != null) {
    enemies[0].stamina = integer(options.previousOgreStamina, 1) + DEEP_RULES.ogreRecovery;
    enemies[0].staminaInitial = enemies[0].stamina;
  }
  if (config.krakenInjuries) {
    if (options.axeFish) enemies[0].stamina -= DEEP_RULES.kraken.axeStamina;
    if (options.sawFish) { enemies[0].stamina -= DEEP_RULES.kraken.sawStamina; enemies[0].skill -= DEEP_RULES.kraken.sawSkill; }
  }
  if (options.enemyStamina != null) {
    if (!Array.isArray(options.enemyStamina) || options.enemyStamina.length !== enemies.length) throw new RangeError('Invalid enemy health override');
    enemies.forEach((enemy, index) => {
      if (options.enemyStamina[index] == null) return;
      enemy.stamina = integer(options.enemyStamina[index], 1);
      enemy.staminaInitial = Math.max(enemy.stamina, enemy.staminaInitial);
    });
  }
  if (config.training) player.stamina = Math.min(player.staminaInitial, Math.max(player.stamina + DEEP_RULES.training.recovery, DEEP_RULES.training.minimumStamina));
  if (config.preWound && !options.preWoundApplied) player.stamina = Math.max(0, player.stamina - config.preWound);
  const nextFightModifier = player.nextFightModifier;
  player.nextFightModifier = 0;
  const ally = config.ally ? { ...config.ally, staminaInitial: config.ally.stamina } : null;
  if (ally && options.allyStamina != null) ally.stamina = integer(options.allyStamina, 0, ally.staminaInitial);
  const fight = { rulesRevision: RULES_REVISION, config, player, enemies, ally, nextFightModifier,
    rounds: 0, receivedHits: 0, landedHits: 0, ringWounds: 0, trapped: !!config.trapped,
    pending: [], events: [], mercyPending: false, mercyDeclined: false, outcome: null, destination: null };
  if (!player.stamina) finish(fight, 'loss', 'stamina');
  return fight;
}

export function requireFight(fight) {
  if (!fight || fight.rulesRevision !== RULES_REVISION || fight.outcome) throw new RangeError('No active fight');
  validateCharacter(fight.player, true);
  if (!Array.isArray(fight.pending)) throw new RangeError('Invalid pending wounds');
}

function finish(fight, outcome, reason, destination) {
  fight.outcome = outcome;
  fight.reason = reason;
  fight.destination = destination ?? (outcome === 'win' ? fight.config.win : fight.config.loss) ?? null;
  fight.pending = [];
  fight.mercyPending = false;
  if (outcome === 'loss' && !fight.player.stamina) fight.player.dead = true;
  if (fight.config.anemoneRing && fight.ringWounds > DEEP_RULES.ring.removeAfterWounds) fight.player.anemoneRing = false;
  if (fight.config.rememberOgre) fight.ogreStamina = fight.enemies[0].stamina;
  if (fight.config.training && ['win', 'loss'].includes(outcome)) {
    const bonus = outcome === 'win' ? DEEP_RULES.training.winSkill : DEEP_RULES.training.lossSkill;
    fight.player.skill += bonus;
    fight.player.skillInitial += bonus;
  }
}

export function complete(fight) {
  if (fight.outcome || fight.pending.length) return;
  if (!fight.player.stamina) finish(fight, 'loss', 'stamina');
  else if (fight.escapePending) finish(fight, 'escape', 'escaped', fight.config.escape.destination);
  else if (fight.config.practiceHits && fight.receivedHits >= fight.config.practiceHits) finish(fight, 'loss', 'practice');
  else if (fight.config.practiceHits && fight.landedHits >= fight.config.practiceHits) finish(fight, 'win', 'practice');
  else if (fight.config.playerFloor && fight.player.stamina <= fight.config.playerFloor) finish(fight, 'loss', 'surrender');
  else if (fight.config.victoryHits && fight.landedHits >= fight.config.victoryHits) finish(fight, 'win', 'drivenOff');
  else if (fight.config.enemyFloor && fight.enemies[0].stamina <= fight.config.enemyFloor) finish(fight, 'win', 'surrender');
  else if (fight.enemies.every(enemy => !enemy.stamina)) finish(fight, 'win', 'defeated');
  else if (fight.config.mercyAt && !fight.mercyDeclined && fight.enemies[0].stamina <= fight.config.mercyAt) fight.mercyPending = true;
}

export function applyHit(fight, hit, modifier = 0) {
  const damage = Math.max(0, hit.damage + modifier) * (hit.multiplier ?? 1);
  const combatant = hit.kind === 'outgoing' ? fight.enemies[hit.enemy] : hit.kind === 'allyIncoming' ? fight.ally : fight.player;
  if (!combatant) throw new RangeError('Missing combatant');
  let floor = combatant === fight.player ? fight.config.playerFloor ?? 0
    : hit.kind === 'outgoing' ? fight.config.enemyFloor ?? 0 : 0;
  if (fight.config.practiceHits) floor = Math.max(1, floor);
  combatant.stamina = Math.max(Math.min(combatant.stamina, floor), combatant.stamina - damage);
  if (hit.kind === 'outgoing' && hit.actor !== 'ally') fight.landedHits++;
  if (hit.kind === 'incoming') {
    fight.receivedHits++;
    if (fight.config.anemoneRing && fight.player.anemoneRing) fight.ringWounds++;
  }
  fight.events.push({ ...hit, damage });
  if (!fight.player.stamina) finish(fight, 'loss', 'stamina');
}

function canModify(fight, hit) {
  return !hit.noLuck && hit.kind !== 'allyIncoming' && hit.actor !== 'ally'
    && (fight.player.luck > 0 || fight.player.talisman);
}
function settle(fight) {
  while (fight.pending.length && !fight.outcome && !canModify(fight, fight.pending[0])) {
    applyHit(fight, fight.pending.shift());
  }
  complete(fight);
}
function ready(input) {
  requireFight(input);
  if (input.pending.length || input.mercyPending) throw new RangeError('Resolve the pending decision first');
}
function attackModifier(fight) {
  return fight.player.attackModifier + fight.player.weaponModifier + fight.nextFightModifier
    + (fight.config.attackModifier ?? 0) - (fight.player.unarmed ? 3 : 0) - (fight.trapped ? DEEP_RULES.trap.penalty : 0);
}
function incoming(fight, enemy, roll) {
  if (fight.config.curse) {
    const value = die(roll);
    fight.events.push({ kind: 'curse', roll: value });
    if (value >= DEEP_RULES.curse.minimum) {
      const key = value <= DEEP_RULES.curse.skillMaximum ? 'skill' : 'luck', loss = value <= DEEP_RULES.curse.skillMaximum ? DEEP_RULES.curse.skillLoss : DEEP_RULES.curse.luckLoss;
      fight.player[key] = Math.max(0, fight.player[key] - loss);
      return;
    }
    fight.pending.push({ kind: 'incoming', enemy, damage: DEEP_RULES.curse.damage, noLuck: true });
    return;
  }
  fight.pending.push({ kind: 'incoming', enemy, damage: fight.config.incomingDamage ?? 2,
    multiplier: fight.enemies[enemy].damageMultiplier ?? 1 });
}

export function round(input, target, roll, { swiftstinger = false } = {}) {
  ready(input);
  const active = targets(input);
  if (!active.includes(target) || swiftstinger && !input.player.swiftstinger) throw new RangeError('Invalid attack');
  const fight = clone(input);
  fight.rounds++;
  fight.events = [];
  if (swiftstinger) {
    fight.player.swiftstinger = false;
    fight.pending.push({ kind: 'outgoing', enemy: target, damage: SWIFTSTINGER_DAMAGE, noLuck: true });
  }
  if (fight.ally && fight.ally.stamina > 0 && !swiftstinger) {
    const victim = die(roll) % 2 === 0 ? 'player' : 'ally';
    const playerAttack = rollDice(roll) + fight.player.skill + attackModifier(fight);
    const allyAttack = rollDice(roll) + fight.ally.skill;
    const enemyAttack = rollDice(roll) + fight.enemies[target].skill;
    fight.events.push({ kind: 'allyAttack', victim, playerAttack, allyAttack, enemyAttack });
    if (playerAttack > enemyAttack) fight.pending.push({ kind: 'outgoing', enemy: target, damage: 2 });
    if (allyAttack > enemyAttack) fight.pending.push({ kind: 'outgoing', actor: 'ally', enemy: target, damage: 2 });
    if (victim === 'player' && enemyAttack > playerAttack) incoming(fight, target, roll);
    if (victim === 'ally' && enemyAttack > allyAttack) fight.pending.push({ kind: 'allyIncoming', enemy: target, damage: 2 });
  } else {
    const opponents = swiftstinger ? active.filter(index => index !== target) : active;
    const playerAttack = opponents.length ? rollDice(roll) + fight.player.skill + attackModifier(fight) : null;
    for (const index of opponents) {
      const ringPenalty = fight.config.anemoneRing && fight.player.anemoneRing ? DEEP_RULES.ring.enemyPenalty : 0;
      const enemyAttack = rollDice(roll) + fight.enemies[index].skill - ringPenalty;
      fight.events.push({ kind: 'attack', enemy: index, playerAttack, enemyAttack });
      if (playerAttack > enemyAttack && index === target) fight.pending.push({ kind: 'outgoing', enemy: index, damage: 2 });
      else if (enemyAttack > playerAttack) incoming(fight, index, roll);
    }
  }
  settle(fight);
  return fight;
}

export function resolveWound(input, mode, roll) {
  requireFight(input);
  if (!input.pending.length || !['skip', 'luck', 'talisman'].includes(mode)) throw new RangeError('No eligible wound');
  if (mode !== 'skip' && !canModify(input, input.pending[0])) throw new RangeError('This wound cannot use Luck');
  if (mode === 'luck' && input.player.luck <= 0 || mode === 'talisman' && !input.player.talisman) throw new RangeError('Luck unavailable');
  const fight = clone(input), hit = fight.pending.shift();
  fight.events = [];
  let modifier = 0;
  if (mode !== 'skip') {
    let lucky = true, value = null;
    if (mode === 'talisman') fight.player.talisman = false;
    else {
      value = rollDice(roll);
      lucky = value <= fight.player.luck;
      fight.player.luck--;
    }
    modifier = hit.kind === 'outgoing' ? lucky ? 2 : -1
      : lucky ? fight.config.luckyIncomingModifier ?? -1 : 1;
    fight.events.push({ kind: mode, roll: value, lucky });
  }
  applyHit(fight, hit, modifier);
  settle(fight);
  return fight;
}

export function escapeFight(input) {
  ready(input);
  if (!input.config.escape || input.trapped) throw new RangeError('Escape unavailable');
  const fight = clone(input);
  fight.events = [];
  if (fight.config.escape.fatal) {
    fight.player.stamina = 0;
    finish(fight, 'loss', 'fatalEscape', fight.config.escape.destination);
  } else {
    fight.escapePending = true;
    if (fight.config.escape.damage) fight.pending.push({ kind: 'incoming', damage: fight.config.escape.damage, cause: 'escape' });
    settle(fight);
  }
  return fight;
}

export function freeFoot(input) {
  ready(input);
  if (!input.trapped) throw new RangeError('Foot is not trapped');
  const fight = clone(input);
  fight.trapped = false;
  fight.events = [];
  fight.pending.push({ kind: 'incoming', enemy: 0, damage: DEEP_RULES.trap.freeDamage });
  settle(fight);
  return fight;
}

export function decideMercy(input, spare) {
  requireFight(input);
  if (!input.mercyPending || input.pending.length || typeof spare !== 'boolean') throw new RangeError('No mercy decision');
  const fight = clone(input);
  if (spare) finish(fight, 'win', 'mercy', fight.config.mercyDestination);
  else { fight.mercyDeclined = true; fight.mercyPending = false; }
  return fight;
}

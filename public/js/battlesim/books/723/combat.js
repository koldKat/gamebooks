import { customFightingEncounter } from '../../engines/fighting-fantasy/opponents.js';
import { INITIAL_GOLD, INITIAL_PROVISIONS, RULES_REVISION, encounterFor } from './definition.js';

export function integer(value, min = 0, max = 10000) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError('Invalid Seven Serpents value');
  return value;
}

export function die(roll = sides => Math.floor(Math.random() * sides) + 1) {
  return integer(roll(6), 1, 6);
}

export function rollDice(roll) { return die(roll) + die(roll); }

export function effectiveSkill(character, modifier = 0) {
  return Math.max(0, character.skill + (character.chainmail ? 1 : 0) + modifier);
}

export function validateCharacter(character, alive = false) {
  if (!character || !['warrior', 'wizard'].includes(character.role)) throw new RangeError('Invalid character');
  for (const key of ['skill', 'stamina', 'luck']) {
    integer(character[key], alive && key === 'stamina' ? 1 : 0);
    integer(character[key + 'Initial'], 1);
    if (character[key] > character[key + 'Initial']) throw new RangeError('Stat exceeds initial value');
  }
  for (const key of ['gold', 'provisions', 'mealsToday', 'goblinTeeth', 'giantTeeth', 'pebbles', 'medicines']) integer(character[key]);
  integer(character.attackModifier, -1000, 1000);
  if (!Array.isArray(character.afflictions) || character.afflictions.some(value => typeof value !== 'string')) throw new RangeError('Invalid afflictions');
  for (const key of ['dead', 'libraUsed', 'libraRenounced', 'chainmail', 'nosePlugs', 'elementalStaff', 'wax', 'poisoned', 'antidote']) {
    if (typeof character[key] !== 'boolean') throw new RangeError('Invalid character flag');
  }
  if (alive && character.dead) throw new RangeError('No living character');
  return character;
}

export function newCharacter(role = 'warrior', roll) {
  if (!['warrior', 'wizard'].includes(role)) throw new RangeError('Invalid class');
  const skill = die(roll) + (role === 'wizard' ? 4 : 6);
  const stamina = rollDice(roll) + 12, luck = die(roll) + 6;
  return { role, skill, skillInitial: skill, stamina, staminaInitial: stamina, luck, luckInitial: luck,
    gold: INITIAL_GOLD, provisions: INITIAL_PROVISIONS, mealsToday: 0, attackModifier: 0,
    goblinTeeth: 0, giantTeeth: 0, pebbles: 0, medicines: 0, afflictions: [],
    dead: false, libraUsed: false, libraRenounced: false, chainmail: false,
    nosePlugs: false, elementalStaff: false, wax: false, poisoned: false, antidote: false };
}

export function testLuck(character, roll) {
  validateCharacter(character, true);
  if (!character.luck) throw new RangeError('Luck unavailable');
  const next = structuredClone(character), value = rollDice(roll), lucky = value <= next.luck;
  next.luck--;
  return { character: next, roll: value, lucky };
}

export function loseStamina(character, amount) {
  validateCharacter(character, true);
  integer(amount);
  const next = structuredClone(character), damage = amount * (next.poisoned ? 2 : 1);
  next.stamina = Math.max(0, next.stamina - damage);
  next.dead = next.stamina === 0;
  return { character: next, damage };
}

const supportedModes = new Set([undefined, 'snattacats', 'separate-attacks', 'centaurs', 'flying-fish',
  'night-hawks', 'rock-demon', 'confused-ghost', 'snake-charmer', 'acid-beetle', 'fire-fox', 'air-serpent']);
const elementalSerpents = new Set(['fireSerpent', 'weakenedFireSerpent', 'moonSerpent', 'weakenedMoonSerpent',
  'earthSerpent', 'waterSerpent', 'airSerpent', 'timeSerpent']);
const livingEnemies = fight => fight.enemies.flatMap((enemy, index) => enemy.stamina > (fight.config.enemyFloor ?? 0) ? [index] : []);

function allyAssignments(fight) {
  const enemies = livingEnemies(fight);
  return (fight.allies ?? []).flatMap((ally, index) => ally.stamina > 0 ? [index] : [])
    .slice(0, enemies.length).map((ally, index) => ({ ally, enemy: enemies[index] }));
}

export function targets(fight) {
  if (!fight || fight.outcome) return [];
  const indices = livingEnemies(fight);
  if (fight.allies?.length) {
    const occupied = new Set(allyAssignments(fight).map(pair => pair.enemy));
    return indices.filter(index => !occupied.has(index));
  }
  return fight.config.chooseTarget || fight.config.mode === 'separate-attacks' ? indices : indices.slice(0, 1);
}

function requireFight(fight) {
  if (!fight || fight.rulesRevision !== RULES_REVISION || fight.outcome) throw new RangeError('No active fight');
  validateCharacter(fight.player, true);
  if (!supportedModes.has(fight.config.mode)) throw new RangeError('Encounter mode not implemented');
}

function finish(fight, roll) {
  if (fight.pending.length) return fight;
  if (fight.rounds > fight.resolvedRounds) {
    fight.resolvedRounds = fight.rounds;
    if (fight.config.mode === 'fire-fox') {
      if (fight.fireActive) {
        const fox = fight.enemies[0];
        fox.skill = Math.max(0, fox.skill - fight.config.fireSkillCost);
        fox.stamina = Math.max(0, fox.stamina - fight.config.fireStaminaCost);
        fight.events.push({ kind: 'fireCost', skill: fox.skill, stamina: fox.stamina });
      }
      fight.fireActive = fight.nextFire;
    }
    if (fight.config.mode === 'confused-ghost' && !fight.confusionEnded && livingEnemies(fight).length && fight.player.stamina) {
      const value = die(roll);
      fight.events.push({ kind: 'confusion', roll: value });
      if (value >= fight.config.recoveryRollMinimum) {
        fight.confusionEnded = true;
        fight.enemies[0].skill = fight.config.normalSkill;
      }
      if (value === fight.config.recoveryDamageRoll) fight.player = loseStamina(fight.player, fight.config.recoveryDamage).character;
    }
  }
  if (!fight.player.stamina) {
    fight.player.dead = true;
    fight.outcome = 'loss';
  } else if (!livingEnemies(fight).length) {
    fight.outcome = 'win';
    fight.destination = fight.config.win;
    if (fight.config.mode === 'snake-charmer' && fight.snakeBitten) {
      fight.player.poisoned = true;
      if (!fight.player.afflictions.includes('snake-poison')) fight.player.afflictions.push('snake-poison');
      fight.events.push({ kind: 'poisonStarts' });
    }
  } else if (fight.config.roundLimit && fight.rounds >= fight.config.roundLimit) {
    fight.outcome = 'continue';
    fight.destination = fight.config.timeoutDestination;
  } else if (fight.config.mode === 'snake-charmer' && fight.phaseRounds >= fight.config.charmerRoundLimit) {
    fight.outcome = 'continue';
    fight.destination = fight.config.timeoutDestination;
  }
  return fight;
}

export function startFight(section, character, options = {}, roll) {
  validateCharacter(character, true);
  const config = Number(section) === 0 ? customFightingEncounter(section, options.opponents) : encounterFor(section);
  if (!config) throw new RangeError('Missing custom opponents');
  if (config.component) {
    const hasComponent = options.hasComponent ?? (config.component === 'wax' ? character.wax : config.component === 'coin' ? character.gold > 0 : undefined);
    if (typeof hasComponent !== 'boolean') throw new RangeError('Specify spell component availability');
    Object.assign(config, hasComponent ? config.success : config.failure);
  }
  if (!supportedModes.has(config.mode)) throw new RangeError('Encounter mode not implemented');
  if (config.spell && character.role !== 'wizard') throw new RangeError('Spell requires a wizard');
  if (options.applyEntry !== undefined && typeof options.applyEntry !== 'boolean') throw new RangeError('Invalid entry setting');
  const fight = { rulesRevision: RULES_REVISION, config, player: structuredClone(character),
    enemies: structuredClone(config.enemies), rounds: 0, pending: [], events: [], outcome: null,
    destination: null, name: '', recorded: false, visibility: [], playerSkillModifier: 0,
    resolvedRounds: 0, phaseRounds: 0, confusionEnded: false, escaped: false, acidStarted: false,
    fireActive: false, nextFire: false, playerStreak: 0, enemyStreak: 0, allies: [], mirrorEscapeRound: 0, snakeBitten: false };
  fight.playerSkillModifier = config.playerSkillModifier ?? 0;
  if (config.mirrorAlly) fight.allies = [{ ...structuredClone(config.enemies[0]), staminaInitial: config.enemies[0].stamina }];
  if (config.summonedGoblins) {
    const count = integer(options.summonCount, 0, character.goblinTeeth);
    config.entryCost = count;
    config.summonedGoblins = count > 0;
    fight.allies = Array.from({ length: count }, () => ({ key: 'summonedGoblin', skill: 5, stamina: 5, staminaInitial: 5 }));
    if (options.applyEntry !== false) fight.player.goblinTeeth -= count;
  }
  if (config.wastedTeeth) {
    if (character.goblinTeeth === 0) config.entryDamage = config.failureDamage;
    else {
      integer(character.goblinTeeth, config.wastedTeeth);
      config.entryCost = config.wastedTeeth;
      if (options.applyEntry !== false) fight.player.goblinTeeth -= config.wastedTeeth;
    }
  }
  if (config.usedGiantTooth && options.applyEntry !== false) {
    if (!fight.player.giantTeeth) throw new RangeError('No giant tooth');
    fight.player.giantTeeth--;
  }
  if (config.excludeEnemy) {
    const excluded = integer(options.excludeEnemy, 0, fight.enemies.length - 1);
    fight.enemies.splice(excluded, 1);
    fight.config.surrender = null;
  }
  let entryLucky = null;
  if (options.applyEntry === false && (config.testEntryLuck || config.optionalEntryLuck && options.testLuck)) {
    if (typeof options.entryLucky !== 'boolean') throw new RangeError('Specify the previously resolved Luck result');
    entryLucky = options.entryLucky;
  }
  if (options.applyEntry !== false && (config.testEntryLuck || config.optionalEntryLuck && options.testLuck)) {
    const tested = testLuck(fight.player, roll);
    fight.player = tested.character;
    entryLucky = tested.lucky;
    fight.events.push({ kind: 'luck', roll: tested.roll, lucky: entryLucky });
  }
  if (config.rollCount || config.count || config.requireManualCount) {
    let count = config.rollCount ? die(roll) : config.requireManualCount ? integer(options.count, 1, 1000) : config.count;
    if (entryLucky !== null) {
      count = (entryLucky ? config.luckyCount : config.unluckyCount) ?? count;
      if (entryLucky) count = Math.max(0, count - (config.luckyCountReduction ?? 0));
    }
    fight.enemies = Array.from({ length: count }, () => structuredClone(config.enemies[0]));
  }
  fight.enemies.forEach(enemy => { enemy.skill = Math.max(0, enemy.skill + (config.enemySkillModifier ?? 0)); enemy.staminaInitial = enemy.stamina; enemy.wounds = 0; });
  if (config.reverseOrder) fight.enemies.reverse();
  if (options.enemyOrder) {
    const order = options.enemyOrder;
    if (!config.chooseOrder || !Array.isArray(order) || order.length !== fight.enemies.length
      || new Set(order).size !== order.length || order.some(index => !Number.isInteger(index) || index < 0 || index >= order.length)) throw new RangeError('Invalid enemy order');
    fight.enemies = order.map(index => fight.enemies[index]);
  }
  fight.visibility = fight.enemies.map(() => Boolean(config.startsVisible));
  if (options.applyEntry !== false) {
    const damage = (config.entryCost ?? 0) + (config.entryDamage ?? 0) + (fight.player.nosePlugs ? 0 : config.smellDamage ?? 0);
    if (damage) fight.player = loseStamina(fight.player, damage).character;
    if (config.entrySkillLoss) fight.player.skill = Math.max(0, fight.player.skill - config.entrySkillLoss);
    if (config.arrows && fight.player.stamina) {
      if (config.extraArrow) {
        const value = die(roll), hit = value <= 3;
        fight.events.push({ kind: 'arrow', roll: value, hit });
        if (hit) fight.player = loseStamina(fight.player, 2).character;
      }
      let hits = 0;
      for (let index = 0; index < config.arrows.count && fight.player.stamina; index++) {
        const value = die(roll), hit = value <= config.arrows.hitMaximum;
        fight.events.push({ kind: 'arrow', roll: value, hit });
        if (hit) { hits++; fight.player = loseStamina(fight.player, config.arrows.damage).character; }
      }
      if (hits >= config.arrows.skillPenaltyAfterHits) fight.playerSkillModifier -= config.arrows.skillPenalty;
    }
  }
  if (config.avoidDestination && fight.player.stamina) {
    fight.outcome = 'continue';
    fight.destination = config.avoidDestination;
  }
  return finish(fight, roll);
}

export function round(input, target = targets(input)[0], roll) {
  requireFight(input);
  const available = targets(input);
  if (input.pending.length || (available.length ? !available.includes(target) : target != null || !allyAssignments(input).length)) throw new RangeError('Round unavailable');
  const fight = structuredClone(input);
  fight.events = [];
  fight.rounds++;
  fight.nextFire = false;
  const assignments = allyAssignments(fight);
  for (const pair of assignments) {
    const ally = fight.allies[pair.ally], enemy = fight.enemies[pair.enemy];
    const allyAS = rollDice(roll) + ally.skill, enemyAS = rollDice(roll) + enemy.skill;
    if (allyAS > enemyAS) enemy.stamina = Math.max(0, enemy.stamina - 2);
    if (enemyAS > allyAS) ally.stamina = Math.max(0, ally.stamina - 2);
    fight.events.push({ kind: 'allyAttack', ally: pair.ally, enemy: pair.enemy, allyAS, enemyAS });
  }
  if (!available.length) return finish(fight, roll);
  if (fight.config.mode === 'snake-charmer' && target === fight.enemies.length - 1) fight.phaseRounds++;
  const visible = fight.visibility[target];
  const playerAS = (fight.config.playerAttackDice === 1 ? die(roll) : rollDice(roll))
    + effectiveSkill(fight.player) * (fight.config.playerSkillMultiplier ?? 1) + fight.playerSkillModifier + fight.player.attackModifier
    - (fight.config.mode === 'rock-demon' && !fight.escaped ? fight.config.trappedAttackPenalty : 0)
    - (fight.config.mode === 'snattacats' && !visible ? fight.config.invisibleAttackPenalty : 0);
  const occupied = new Set(assignments.map(pair => pair.enemy));
  const defenders = ['separate-attacks', 'night-hawks'].includes(fight.config.mode) || fight.config.summonedGoblins
    ? [target, ...livingEnemies(fight).filter(index => index !== target && !occupied.has(index))] : [target];
  for (const index of defenders) {
    const enemy = fight.enemies[index], enemyAS = rollDice(roll) + Math.max(0, enemy.skill
      - (fight.player.elementalStaff && elementalSerpents.has(enemy.key) ? 2 : 0))
      + (fight.config.enemyAttackModifier ?? 0) + (fight.rounds === 1 ? fight.config.firstRoundEnemyAttackModifier ?? 0 : 0);
    fight.events.push({ kind: 'attack', enemy: index, playerAS, enemyAS });
    if (fight.config.mode === 'air-serpent') {
      if (playerAS > enemyAS) {
        fight.enemyStreak = 0;
        fight.playerStreak++;
        if (fight.playerStreak === fight.config.playerConsecutiveWins) {
          fight.pending.push({ kind: 'player-hit', enemy: index, damage: fight.config.playerPairDamage });
          fight.playerStreak = 0;
        }
      } else if (enemyAS > playerAS) {
        fight.playerStreak = 0;
        fight.enemyStreak++;
        fight.pending.push({ kind: 'enemy-hit', enemy: index, damage: Math.min(10000, 2 ** (fight.enemyStreak - 1)), variableDamage: true });
      } else { fight.playerStreak = 0; fight.enemyStreak = 0; }
      continue;
    }
    if (index === target && playerAS > enemyAS) fight.pending.push({ kind: 'player-hit', enemy: index, damage: fight.config.playerDamage ?? 2 });
    if (enemyAS > playerAS && !fight.config.harmlessEnemy) fight.pending.push({ kind: 'enemy-hit', enemy: index,
      damage: fight.config.enemyDamageDie ? die(roll) : fight.config.mode === 'fire-fox' && fight.fireActive ? fight.config.fireDamage : 2,
      variableDamage: Boolean(fight.config.enemyDamageDie) || fight.config.mode === 'fire-fox' && fight.fireActive });
  }
  if (fight.config.mode === 'snattacats') fight.visibility[target] = false;
  return finish(fight, roll);
}

export function resolveLuck(input, useLuck = false, roll) {
  requireFight(input);
  if (!input.pending.length || typeof useLuck !== 'boolean') throw new RangeError('No pending wound');
  const fight = structuredClone(input), hit = fight.pending.shift();
  fight.events = [];
  let damage = hit.damage;
  if (useLuck) {
    const tested = testLuck(fight.player, roll);
    fight.player = tested.character;
    damage = Math.max(0, damage + (hit.kind === 'player-hit' ? tested.lucky ? 2 : -1 : tested.lucky ? -1 : 1));
    fight.events.push({ kind: 'luck', roll: tested.roll, lucky: tested.lucky });
  }
  if (hit.kind === 'player-hit') {
    const enemy = fight.enemies[hit.enemy];
    enemy.stamina = Math.max(0, enemy.stamina - damage);
    if (damage) {
      enemy.wounds++;
      if (fight.config.mode === 'fire-fox') {
        fight.nextFire = true;
        fight.noticeDestination = 71;
      }
      if (fight.config.mode === 'snattacats') fight.visibility[hit.enemy] = true;
      if (fight.config.mode === 'acid-beetle') {
        let backlash = 1;
        if (fight.acidStarted) {
          const value = die(roll);
          backlash = [3, 2, 2, 1, 0, 0][value - 1];
          if (value === 1 && !fight.player.afflictions.includes('lost-left-eye')) fight.player.afflictions.push('lost-left-eye');
          if (value === 2) fight.player.skill = Math.max(0, fight.player.skill - 1);
          fight.events.push({ kind: 'acid', roll: value, damage: backlash });
        } else {
          fight.acidStarted = true;
          fight.noticeDestination = fight.config.firstWoundDestination;
          fight.events.push({ kind: 'acid', damage: backlash });
        }
        if (backlash) fight.player = loseStamina(fight.player, backlash).character;
      }
    }
  } else {
    if (fight.player.chainmail && damage === 2 && !hit.variableDamage && die(roll) >= 5) damage = 1;
    const lost = loseStamina(fight.player, damage);
    fight.player = lost.character;
    damage = lost.damage;
    if (fight.config.mode === 'snake-charmer' && hit.enemy < fight.enemies.length - 1 && damage && !fight.player.dead) {
      fight.snakeBitten = true;
    }
    if (fight.player.dead) fight.pending = [];
  }
  fight.events.push({ kind: 'damage', target: hit.kind === 'player-hit' ? 'enemy' : 'player', enemy: hit.enemy, damage });
  if (fight.player.dead) fight.pending = [];
  return finish(fight, roll);
}

export function canSpare(fight) {
  if (!fight || fight.outcome || fight.pending.length) return false;
  if (fight.config.mercyDestination && fight.enemies.length === 1) return fight.enemies[0].stamina <= (fight.config.mercyFloor ?? fight.enemies[0].staminaInitial);
  if (!fight.config.surrender) return false;
  const alive = livingEnemies(fight), rule = fight.config.surrender;
  return alive.length === 1 && fight.enemies.length - alive.length >= rule.enemiesDefeated
    && fight.enemies[alive[0]].wounds >= (rule.lastEnemyWounds ?? 0);
}

export function spare(input) {
  requireFight(input);
  if (!canSpare(input)) throw new RangeError('Surrender unavailable');
  const fight = structuredClone(input);
  fight.outcome = 'continue';
  fight.destination = fight.config.mercyDestination ?? fight.config.surrender.destination;
  fight.events = [];
  return fight;
}

export function attemptEscape(input, roll) {
  requireFight(input);
  if (input.config.mode !== 'rock-demon' || input.escaped || input.pending.length) throw new RangeError('Escape unavailable');
  const fight = structuredClone(input), value = rollDice(roll);
  if (fight.config.mirrorAlly && fight.allies.some(ally => ally.stamina > 0)) {
    if (fight.mirrorEscapeRound >= fight.rounds) throw new RangeError('Resolve the demons round before another escape attempt');
    fight.mirrorEscapeRound = fight.rounds;
  }
  fight.events = [{ kind: 'escape', roll: value, escaped: value < effectiveSkill(fight.player, fight.playerSkillModifier) }];
  fight.escaped = value < effectiveSkill(fight.player, fight.playerSkillModifier);
  fight.player = loseStamina(fight.player, fight.config.escapeAttemptDamage).character;
  return finish(fight, roll);
}

export function flee(input) {
  requireFight(input);
  if (input.pending.length || !input.config.fleeDestination) throw new RangeError('Flight unavailable');
  const fight = structuredClone(input);
  fight.outcome = 'continue';
  fight.destination = fight.config.fleeDestination;
  fight.events = [];
  return fight;
}

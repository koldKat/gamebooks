import { customFightingEncounter } from '../../engines/fighting-fantasy/opponents.js';
import * as core from '../../engines/sorcery/core.js';
import { CHARACTER_DEFAULTS, RULES_REVISION, encounterFor } from './definition.js';

export { die, integer, rollDice, testLuck } from '../../engines/sorcery/core.js';

export function validateCharacter(character, alive = false) {
  core.validateCharacter(character, alive);
  for (const [field, initial] of Object.entries(CHARACTER_DEFAULTS)) {
    if (typeof initial === 'boolean') {
      if (typeof character[field] !== 'boolean') throw new RangeError('Invalid equipment');
    } else core.integer(character[field]);
  }
  if (character.dartsGames > 2) throw new RangeError('Invalid darts count');
  return character;
}

export function newCharacter(role = 'warrior', roll) {
  return { ...core.newCharacter(role, roll), ...structuredClone(CHARACTER_DEFAULTS) };
}

function available(character, name) {
  const field = ({ coin: 'gold', medicine: 'medicines', giantTooth: 'giantTeeth' })[name] ?? name;
  if (!(field in character)) throw new RangeError('Unknown component');
  return Boolean(character[field]);
}

function spend(character, field, count = 1) {
  field = ({ giantTooth: 'giantTeeth' })[field] ?? field;
  if (typeof character[field] === 'boolean') {
    if (!character[field]) throw new RangeError('Missing component');
    character[field] = false;
  } else {
    core.integer(count, 1);
    if (core.integer(character[field]) < count) throw new RangeError('Missing component');
    character[field] -= count;
  }
}

const living = fight => fight.enemies.flatMap((enemy, index) => enemy.stamina > (fight.config.enemyFloor ?? 0) && !enemy.excluded ? [index] : []);
const livingAlly = (fight, enemy) => fight.allies.findIndex(ally => ally.stamina > 0 && (ally.enemy === null || ally.enemy === enemy));

export function activeEnemies(fight) {
  if (!fight || fight.outcome) return [];
  const indices = living(fight);
  if (fight.config.mode === 'captain') return indices.includes(0) || indices.includes(1) ? indices.filter(index => index < 2) : indices;
  return ['group', 'red-eyes'].includes(fight.config.mode) ? indices.slice(0, fight.config.activeLimit ?? indices.length) : indices.slice(0, 1);
}

export function targets(fight) {
  if (!fight || fight.outcome || fight.pending.length || fight.volleyActive) return [];
  return activeEnemies(fight);
}

function requireFight(fight, pending = false) {
  if (!fight || fight.rulesRevision !== RULES_REVISION || fight.outcome || !Array.isArray(fight.pending)
    || Boolean(fight.pending.length) !== pending) throw new RangeError('No active fight');
  validateCharacter(fight.player, true);
}

function damagePlayer(fight, amount, kind = 'damage') {
  if (!fight.player.dead && amount) fight.player = core.loseStamina(fight.player, amount);
  if (kind !== 'damage') fight.events.push({ kind, target: 'player', damage: amount });
}

function finish(fight) {
  if (fight.pending.length) return fight;
  if (fight.rounds > fight.resolvedRounds) {
    fight.resolvedRounds = fight.rounds;
    if (fight.whipRemaining) fight.whipRemaining--;
    if (fight.config.scheduledDamage?.round === fight.rounds && !fight.scheduledDamageApplied) {
      fight.scheduledDamageApplied = true;
      damagePlayer(fight, fight.config.scheduledDamage.damage, 'scheduledDamage');
    }
  }
  if (!fight.player.stamina || fight.player.dead) {
    fight.player.dead = true;
    fight.outcome = 'loss';
  } else if (fight.config.maximumEnemyWounds && fight.enemyWounds >= fight.config.maximumEnemyWounds) {
    fight.player.stamina = 0;
    fight.player.dead = true;
    fight.outcome = 'loss';
    fight.destination = fight.config.woundLimitDestination;
  } else if (fight.hydraResult) {
    fight.outcome = 'continue';
    fight.destination = fight.hydraResult === 'player' ? fight.config.playerHitDestination : fight.config.enemyHitDestination;
  } else if (!living(fight).length) {
    fight.outcome = fight.config.winOutcome ?? 'win';
    fight.destination = fight.config.win;
  } else if (fight.config.mode === 'captain' && living(fight).every(index => index === 2) && fight.enemies[2].stamina <= 6) {
    fight.outcome = 'continue';
    fight.destination = 391;
    fight.mercyDestination = 347;
  } else if (fight.config.secondHitDestination && fight.playerHits >= 2) {
    fight.outcome = 'continue';
    fight.destination = fight.config.secondHitDestination;
  } else if (fight.config.roundLimit && fight.rounds >= fight.config.roundLimit) {
    fight.outcome = fight.config.timeoutFatal ? 'loss' : 'continue';
    fight.destination = fight.config.timeoutDestination;
    if (fight.config.timeoutFatal) { fight.player.stamina = 0; fight.player.dead = true; }
  }
  return fight;
}

function carryWounds(fight, previous, options) {
  if (!fight.config.requiresCarryFrom) return;
  if (previous) {
    const source = previous.config.sourceSection ?? previous.config.section;
    if (previous.rulesRevision !== RULES_REVISION || previous.outcome !== 'continue' || previous.pending?.length
      || previous.destination !== fight.config.section || !fight.config.requiresCarryFrom.includes(source)) {
      throw new RangeError('Invalid combat handoff');
    }
    if (Object.keys(previous.player).length !== Object.keys(fight.player).length
      || Object.keys(previous.player).some(field => JSON.stringify(previous.player[field]) !== JSON.stringify(fight.player[field]))) {
      throw new RangeError('Character changed during handoff');
    }
    if (!fight.config.carryPlayerOnly) {
      const indices = fight.config.carryEnemyIndices ?? fight.enemies.map((_, index) => index);
      indices.forEach((sourceIndex, index) => {
        const old = previous.enemies[sourceIndex], current = fight.enemies[index];
        if (!old || !current || old.key !== current.key) throw new RangeError('Mismatched carried enemy');
        fight.enemies[index] = structuredClone(old);
      });
    }
    fight.playerHits = previous.playerHits;
    for (const field of ['playerAttackModifier', 'doubleWeaponDamage']) {
      if (previous.config[field] !== undefined) fight.config[field] = previous.config[field];
    }
    fight.events.push({ kind: 'carriedWounds', from: source });
  } else if (!fight.config.carryPlayerOnly) {
    if (!Array.isArray(options.remainingStamina)) throw new RangeError('Enter remaining enemy stamina');
    const count = fight.config.carryEnemyIndices?.length ?? fight.enemies.length;
    if (options.remainingStamina.length !== count) throw new RangeError('Invalid carried stamina');
    options.remainingStamina.forEach((value, index) => {
      fight.enemies[index].stamina = core.integer(value, 1, fight.config.carriedStaminaMaximum?.[index] ?? fight.enemies[index].stamina);
    });
  }
}

export function startFight(section, character, options = {}, roll) {
  validateCharacter(character, true);
  const config = Number(section) === 0 ? customFightingEncounter(section, options.opponents) : encounterFor(section);
  if (!config) throw new RangeError('Missing custom opponents');
  if (config.spell && (character.role !== 'wizard' || character.forgottenMagic)) throw new RangeError('Spell unavailable');
  const applyEntry = options.applyEntry ?? true;
  if (typeof applyEntry !== 'boolean') throw new RangeError('Invalid entry option');
  if (options.useHolySpear !== undefined && typeof options.useHolySpear !== 'boolean') throw new RangeError('Invalid spear option');
  if (options.useHolySpear && (!config.holySpearInstantKill || config.spell)) throw new RangeError('Holy spear unavailable');
  if (options.useHolySpear) Object.assign(config, { resolution: 'win', destination: config.win });
  let hasComponent = true;
  if (config.component) {
    const owned = available(character, config.component);
    hasComponent = options.hasComponent ?? owned;
    if (typeof hasComponent !== 'boolean' || hasComponent && !owned && applyEntry) throw new RangeError('Invalid component availability');
    Object.assign(config, hasComponent ? config.success : config.failure);
  }
  const copies = config.mirrorCopies ? options.copyEnemies ?? [0] : [];
  if (!Array.isArray(copies) || new Set(copies).size !== copies.length || copies.length > 3
    || config.mirrorCopies && copies.length === 0) throw new RangeError('Invalid mirror copies');
  copies.forEach(index => core.integer(index, 0, config.enemies.length - 1));
  const summonCount = config.summon === 'goblin' ? core.integer(options.summonCount ?? 1, 1) : config.summon === 'giant' ? 1 : 0;
  const cost = config.mirrorCopies ? copies.length : config.summonCostPer ? summonCount * config.summonCostPer : config.entryCost ?? 0;
  const fight = { rulesRevision: RULES_REVISION, config, player: structuredClone(character),
    enemies: config.enemies.map(enemy => ({ ...enemy, staminaInitial: enemy.stamina })), allies: [],
    rounds: 0, resolvedRounds: 0, pending: [], events: [], outcome: null, destination: null,
    playerHits: 0, enemyWounds: 0, whipRemaining: 0, mindReadTarget: config.mindRead ? 0 : null,
    gazeUses: {}, gazeBurns: 0, scheduledDamageApplied: false, volleyActive: Boolean(config.volley),
    volleyMisses: 0, frightened: 0, helpCopies: options.helpCopies ?? false,
    enemyDefender: options.enemyDefender ?? 'copy', secondWeaponEquipped: options.secondWeaponEquipped ?? false };
  if (typeof fight.helpCopies !== 'boolean' || !['copy', 'player'].includes(fight.enemyDefender)) throw new RangeError('Invalid mirror assistance');
  if (typeof fight.secondWeaponEquipped !== 'boolean' || fight.secondWeaponEquipped && (!character.twoWeapons || !character.armed)) {
    throw new RangeError('Two equipped weapons require the extra-arm mutation');
  }
  carryWounds(fight, options.carryFrom, options);
  if (config.volley) fight.volleyRemaining = core.integer(options.volleyCount ?? character.pebbles, 1, character.pebbles);
  if (config.surpriseChoice) {
    const surprise = options.surprise ?? 'none';
    if (!['none', '446', '553'].includes(surprise)) throw new RangeError('Invalid surprise');
    config.playerWinsTies = surprise !== 'none';
    if (surprise === '446') fight.enemies[0].skill = Math.max(0, fight.enemies[0].skill - 3);
  }
  for (const enemy of fight.enemies) {
    enemy.skill = Math.max(0, enemy.skill + (config.enemySkillModifier ?? 0));
    enemy.stamina += config.enemyStaminaModifier ?? 0;
    enemy.staminaInitial += config.enemyStaminaModifier ?? 0;
  }
  if (config.excludeFirst) fight.enemies[0].excluded = true;
  if (config.excludeEnemy || config.disableEnemy) {
    const selected = core.integer(options.enemyIndex ?? 0, 0, fight.enemies.length - 1);
    fight.enemies[selected][config.excludeEnemy ? 'excluded' : 'cannotAttack'] = true;
  }
  if (applyEntry) {
    if (cost) damagePlayer(fight, cost, 'spellCost');
    if (hasComponent) {
      if (config.consumeCoin) spend(fight.player, 'gold');
      if (config.consumeMedicine) spend(fight.player, 'medicines', config.consumeMedicine);
      if (config.consume) spend(fight.player, config.consume);
      if (config.destroy) fight.player[config.destroy] = false;
      if (config.summon === 'goblin') spend(fight.player, 'goblinTeeth', summonCount);
      if (config.consumeItem && options.itemRemovedManually !== true) throw new RangeError('Remove the offered item first');
    }
    if (!fight.player.dead && config.entryDamage) damagePlayer(fight, config.entryDamage, 'entryDamage');
    if (!fight.player.dead && config.smellDamage && !fight.player.nosePlugs) damagePlayer(fight, config.smellDamage, 'smell');
    if (!fight.player.dead && config.healing) fight.player = core.healStamina(fight.player, config.healing);
  }
  if (fight.player.reptileFear && config.mode === 'hydra') damagePlayer(fight, fight.player.stamina, 'reptileFear');
  if (!fight.player.dead && config.nosePlugsEscape && fight.player.nosePlugs) Object.assign(config, { resolution: 'continue', destination: config.nosePlugsEscape });
  if (!fight.player.dead && config.entryLuckEscape) {
    const tested = core.testLuck(fight.player, roll);
    fight.player = tested.character;
    fight.events.push({ kind: 'luck', roll: tested.roll, lucky: tested.lucky });
    if (tested.lucky) Object.assign(config, { resolution: 'continue', destination: config.entryLuckEscape });
  }
  if (!fight.player.dead && config.resolution) {
    fight.outcome = config.resolution;
    fight.destination = config.destination;
    fight.volleyActive = false;
    if (config.fatal) { fight.player.stamina = 0; fight.player.dead = true; }
    return fight;
  }
  if (fight.player.dead) return finish(fight);
  if (!options.carryFrom) {
    config.playerAttackModifier = (config.playerAttackModifier ?? 0) - fight.player.nextFightSkillLoss;
    if (fight.player.nextFightDoubleDamage && fight.player.armed) config.doubleWeaponDamage = true;
    fight.player.nextFightSkillLoss = 0;
    fight.player.nextFightDoubleDamage = false;
  }
  if (config.summon) {
    const ally = config.summon === 'giant' ? { key: 'giant', skill: 8, stamina: 9 } : { key: 'goblin', skill: 5, stamina: 5 };
    fight.allies = Array.from({ length: summonCount }, () => ({ ...ally, enemy: null, gazeUses: 0, gazeBurns: 0 }));
  }
  for (const index of copies) {
    const enemy = fight.enemies[index];
    fight.allies.push({ key: enemy.key, skill: enemy.skill, stamina: enemy.stamina, enemy: index, gazeUses: 0, gazeBurns: 0 });
  }
  return finish(fight);
}

function playerModifier(fight) {
  const player = fight.player;
  return player.attackModifier + (player.chainmail ? 1 : 0)
    + (player.armed ? (player.sharpened ? 1 : 0) - player.weaponPenalty : -(player.horn ? 1 : player.unarmedPenalty))
    + (fight.config.playerAttackModifier ?? 0) + (fight.config.entrySkillModifier ?? 0)
    - (fight.whipRemaining ? fight.config.whipPenalty : 0);
}

function enqueue(fight, direction, enemy, actor = 'player', ally = null) {
  const hydra = fight.config.mode === 'hydra';
  fight.pending.push({ direction, enemy, actor, ally, damage: hydra && direction === 'incoming' ? 0 : 2,
    multiplier: actor === 'player' && direction === 'outgoing' && fight.config.doubleWeaponDamage && fight.player.armed ? 2 : 1 });
}

export function round(fight, target = null, roll, options = {}) {
  requireFight(fight);
  if (fight.volleyActive) throw new RangeError('Finish the volley first');
  const next = structuredClone(fight), enemies = activeEnemies(next);
  target ??= enemies[0];
  if (!enemies.includes(target)) throw new RangeError('Invalid target');
  next.events = [];
  if (next.config.mode === 'whip') {
    const value = core.die(roll);
    if (value === 1) next.whipRemaining = next.config.whipDuration;
    next.events.push({ kind: 'whip', roll: value, rounds: next.whipRemaining });
  }
  const playerNeeded = enemies.some(index => livingAlly(next, index) < 0 || next.config.mirrorCopies && next.helpCopies);
  const player = playerNeeded ? core.attackStrength(next.player.skill, playerModifier(next), roll) : { dice: [], total: 0 };
  const secondTarget = options.secondTarget ?? target;
  if (next.secondWeaponEquipped && !enemies.includes(secondTarget)) throw new RangeError('Invalid second target');
  const secondAttack = playerNeeded && next.secondWeaponEquipped ? core.attackStrength(next.player.skill, playerModifier(next), roll) : null;
  next.rounds++;
  for (const index of enemies) {
    const enemy = next.enemies[index], allyIndex = livingAlly(next, index);
    const attack = core.attackStrength(enemy.skill, next.config.enemyAttackModifier ?? 0, roll);
    const copying = allyIndex >= 0 && next.config.mirrorCopies;
    const playerAttacks = index === target && (allyIndex < 0 || copying && next.helpCopies);
    const enemyAttacksPlayer = allyIndex < 0 || copying && playerAttacks && next.enemyDefender === 'player';
    const result = core.compareAttacks(player.total, attack.total, playerAttacks && Boolean(next.config.playerWinsTies));
    if (playerAttacks || enemyAttacksPlayer) next.events.push({ kind: 'attack', enemy: index, player: player.total, opponent: attack.total, playerDice: player.dice, enemyDice: attack.dice });
    if (playerAttacks && result === 'player') enqueue(next, 'outgoing', index);
    else if (enemyAttacksPlayer && result === 'enemy' && !enemy.cannotAttack && next.mindReadTarget !== index) enqueue(next, 'incoming', index);
    if (secondAttack && index === secondTarget && (allyIndex < 0 || copying && next.helpCopies)) {
      next.events.push({ kind: 'extraAttack', enemy: index, player: secondAttack.total, opponent: attack.total });
      if (core.compareAttacks(secondAttack.total, attack.total, Boolean(next.config.playerWinsTies)) === 'player') enqueue(next, 'outgoing', index);
    }
    if (allyIndex >= 0) {
      const ally = next.allies[allyIndex], allyAttack = core.attackStrength(ally.skill, 0, roll);
      const alliedResult = core.compareAttacks(allyAttack.total, attack.total);
      next.events.push({ kind: 'allyAttack', ally: allyIndex, enemy: index, player: allyAttack.total, opponent: attack.total });
      if (alliedResult === 'player') enqueue(next, 'outgoing', index, 'ally', allyIndex);
      else if (alliedResult === 'enemy' && !enemyAttacksPlayer && !enemy.cannotAttack) enqueue(next, 'incoming', index, 'ally', allyIndex);
    }
  }
  if (next.config.mode === 'hydra' && next.pending.length === 1 && !next.pending[0].damage) {
    next.hydraResult = 'enemy';
    next.pending = [];
  }
  return finish(next);
}

function gaze(fight, hit, direction, roll) {
  const ally = hit.ally === null ? null : fight.allies[hit.ally];
  const fromEnemy = direction === 'outgoing';
  const user = fromEnemy ? fight.gazeUses : ally;
  const uses = fromEnemy ? user[hit.enemy] ?? 0 : user.gazeUses;
  const threshold = Math.max(1, 6 - uses), value = core.die(roll);
  if (fromEnemy) user[hit.enemy] = uses + 1;
  else user.gazeUses++;
  const burnt = value >= threshold;
  fight.events.push({ kind: 'gaze', enemy: hit.enemy, ally: hit.ally, roll: value, threshold, burnt, fromEnemy });
  if (!burnt) return;
  const amount = core.die(roll);
  if (fromEnemy && hit.actor === 'player') {
    fight.gazeBurns++;
    damagePlayer(fight, amount, 'gazeDamage');
    if (fight.gazeBurns >= 2) { fight.player.stamina = 0; fight.player.dead = true; }
  } else if (fromEnemy) {
    ally.gazeBurns++;
    ally.stamina = ally.gazeBurns >= 2 ? 0 : Math.max(0, ally.stamina - amount);
  } else {
    const enemy = fight.enemies[hit.enemy];
    enemy.gazeBurns = (enemy.gazeBurns ?? 0) + 1;
    enemy.stamina = enemy.gazeBurns >= 2 ? 0 : Math.max(0, enemy.stamina - amount);
  }
}

export function resolveHit(fight, useLuck = false, roll) {
  requireFight(fight, true);
  if (typeof useLuck !== 'boolean') throw new RangeError('Invalid Luck choice');
  const next = structuredClone(fight), hit = next.pending.shift();
  next.events = [];
  if (useLuck && (hit.actor !== 'player' || !hit.damage)) throw new RangeError('Luck unavailable for this hit');
  let lucky = null;
  if (useLuck) {
    const tested = core.testLuck(next.player, roll);
    next.player = tested.character;
    lucky = tested.lucky;
    next.events.push({ kind: 'luck', roll: tested.roll, lucky });
  }
  const damage = core.damageWithLuck(hit.direction, hit.damage, lucky) * hit.multiplier;
  if (hit.direction === 'outgoing') {
    next.enemies[hit.enemy].stamina = Math.max(0, next.enemies[hit.enemy].stamina - damage);
    if (hit.actor === 'player') next.playerHits++;
  } else if (hit.actor === 'ally') next.allies[hit.ally].stamina = Math.max(0, next.allies[hit.ally].stamina - damage);
  else {
    damagePlayer(next, damage);
    if (damage) next.enemyWounds++;
  }
  next.events.push({ kind: 'hit', ...hit, damage });
  if (next.config.mode === 'hydra') next.hydraResult = hit.direction === 'outgoing' ? 'player' : 'enemy';
  if (next.config.mode === 'red-eyes' && damage > 0) {
    if (hit.direction === 'outgoing') gaze(next, hit, 'outgoing', roll);
    else if (hit.actor === 'ally') gaze(next, hit, 'incoming', roll);
    next.noticeDestination = next.config.gazeInstruction;
  }
  for (const ally of next.allies) {
    if (ally.enemy !== null && !next.enemies[ally.enemy].stamina) { ally.vanished = true; ally.stamina = 0; }
  }
  next.pending = next.pending.filter(pending => next.enemies[pending.enemy].stamina > 0
    && (pending.actor !== 'ally' || !next.allies[pending.ally].vanished));
  if (next.player.dead) next.pending = [];
  return finish(next);
}

export function flee(fight) {
  requireFight(fight);
  const destination = fight.config.optionalEscape ?? (fight.playerHits === 1 ? fight.config.firstHitEscape : null);
  if (!destination) throw new RangeError('Escape unavailable');
  const next = structuredClone(fight);
  next.outcome = 'continue'; next.destination = destination; next.events = [];
  return next;
}

export function spare(fight) {
  requireFight(fight);
  const mercy = fight.config.mercy, enemy = living(fight).at(0);
  if (!mercy || enemy === undefined || fight.enemies[enemy].stamina > mercy.floor) throw new RangeError('Mercy unavailable');
  const next = structuredClone(fight);
  next.outcome = 'win'; next.destination = mercy.destination; next.events = [];
  return next;
}

export function spareAtCheckpoint(fight) {
  if (!fight || fight.rulesRevision !== RULES_REVISION || fight.outcome !== 'continue'
    || !fight.mercyDestination || fight.pending.length) throw new RangeError('No mercy checkpoint');
  const next = structuredClone(fight);
  next.destination = next.mercyDestination;
  next.mercyDestination = null;
  next.events = [];
  return next;
}

export function recastMindRead(fight) {
  requireFight(fight);
  if (!fight.config.mindRead || fight.mindReadTarget === null || fight.enemies[fight.mindReadTarget].stamina > 0) throw new RangeError('Recast unavailable');
  const next = structuredClone(fight), target = living(next)[0];
  if (target === undefined) throw new RangeError('No opponent');
  next.events = [];
  damagePlayer(next, 1, 'spellCost');
  if (!next.player.dead) next.mindReadTarget = target;
  return finish(next);
}

export function throwPebble(fight, target = null, roll) {
  requireFight(fight);
  if (!fight.volleyActive || !fight.config.volley) throw new RangeError('No volley');
  const next = structuredClone(fight), volley = next.config.volley;
  next.events = [];
  target ??= living(next)[0];
  if (!living(next).includes(target)) throw new RangeError('Invalid target');
  spend(next.player, 'pebbles');
  next.volleyRemaining--;
  const value = volley.dice === 2 ? core.rollDice(roll) : core.die(roll), hit = value <= next.player.skill;
  if (hit) {
    if (volley.frightens) next.frightened++;
    else next.enemies[target].stamina = Math.max(0, next.enemies[target].stamina - volley.damage);
  } else next.volleyMisses++;
  next.events.push({ kind: 'pebble', enemy: target, roll: value, hit, damage: hit ? volley.damage ?? 0 : 0 });
  if (volley.frightens && next.frightened >= 3) { next.outcome = 'continue'; next.destination = 397; next.volleyActive = false; }
  else if (!living(next).length || !next.player.pebbles || !next.volleyRemaining || volley.missLimit && next.volleyMisses >= volley.missLimit) next.volleyActive = false;
  return next.outcome || next.volleyActive ? next : stopVolley(next);
}

export function stopVolley(fight) {
  requireFight(fight);
  if (!fight.config.volley) throw new RangeError('No volley');
  if (fight.volleyActive && fight.config.volley.frightens && fight.volleyRemaining > 0) throw new RangeError('Finish the declared volley');
  const next = structuredClone(fight);
  next.volleyActive = false;
  if (next.config.volley.frightens) {
    if (next.frightened >= 2) { next.outcome = 'continue'; next.destination = next.frightened >= 3 ? 397 : 401; }
    else if (next.frightened === 1) next.enemies[0].excluded = true;
  }
  return finish(next);
}

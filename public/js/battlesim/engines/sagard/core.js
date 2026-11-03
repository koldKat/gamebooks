// Resolve individual Sagard encounters using the book's database-owned damage charts.
import {validateSagardProjectiles, sagardProjectileRule, sagardProjectileEffect} from './effects.js';
import {validateSagardRecoveryRules, sagardHealedHp} from './recovery.js';
const clone = value => structuredClone(value);
const integer = (value, min, max) => {
  if (value === '' || value == null || !Number.isSafeInteger(Number(value)) || Number(value) < min || Number(value) > max) {
    throw new RangeError('Enter a valid combat value');
  }
  return Number(value);
};
const living = rows => rows.filter(row => !row.escaped && (row.immortal || row.hp > 0));
const present = fight => living(fight.opponents).filter(row => (row.joinsRound ?? 1) <= fight.round);
const actors = fight => [fight.hero, ...fight.allies, ...fight.opponents];
const find = (fight, id) => actors(fight).find(row => row.id === id);
const chart = value => {
  if (!Array.isArray(value) || value.length !== 4) throw new RangeError('Missing four-sided damage chart');
  return value.map(n => integer(n, 0, 100));
};

export const maxSagardLevel = rules => Object.keys(rules.damageByLevel).length - 1;

export function validateSagardRules(rules) {
  if (!rules?.damageByLevel || ![6, 7].includes(Object.keys(rules.damageByLevel).length)) throw new RangeError('Missing fighting levels');
  for (let level = 0; level <= maxSagardLevel(rules); level++) chart(rules.damageByLevel[level]);
  integer(rules.maxHeroHp, 1, 1000);
  if (rules.maxShield != null) integer(rules.maxShield, 0, 1000);
  if (rules.projectiles != null) validateSagardProjectiles(rules.projectiles);
  validateSagardRecoveryRules(rules);
  if (rules.magicDagger != null) {
    integer(rules.magicDagger.maximumPower, 1, 100);
    integer(rules.magicDagger.defeatsLevelAtMost, 0, maxSagardLevel(rules));
  }
  if (rules.initialHeroLevel != null) integer(rules.initialHeroLevel, 0, maxSagardLevel(rules));
  if (rules.spiritLuckEnabled != null && typeof rules.spiritLuckEnabled !== 'boolean') throw new RangeError('Invalid recovery rule');
  if (rules.stunStoneEnabled != null && typeof rules.stunStoneEnabled !== 'boolean') throw new RangeError('Invalid stun stone rule');
  return rules;
}

function actor(row, id, rules, jab = false, unknownLevel = false) {
  if (jab && (row.level != null || row.chart != null)) throw new RangeError('Jabbing opponents have no printed level or damage chart');
  const level = jab || (unknownLevel && row.level == null && row.chart != null)
    ? null : integer(row.level, 0, maxSagardLevel(rules)), hp = row.immortal ? null : integer(row.hp, 1, 1000000);
  const result = {id, name: String(row.displayName ?? row.name ?? 'Opponent').slice(0, 200), level, hp,
    maxHp: hp, chart: jab ? null : chart(row.chart ?? rules.damageByLevel[level]),
    damageBonus: integer(row.damageBonus ?? 0, 0, 100),
    damageReduction: integer(row.damageReduction ?? 0, 0, 100),
    shield: integer(row.shield ?? 0, 0, 1000),
    retaliationStartsRound: integer(row.retaliationStartsRound ?? 1, 1, 1000000)};
  if (row.immortal) result.immortal = true;
  for (const key of ['hpBands', 'attackTarget', 'damageIgnoresArmor', 'joinsRound', 'joinsFirst', 'damageOverrides', 'bonusOnHitOnly']) {
    if (Object.hasOwn(row, key)) result[key] = clone(row[key]);
  }
  return result;
}

export function createSagardHero(hero, encounter, rules) {
  validateSagardRules(rules);
  const result = actor({...hero, name: 'Sagard', level: encounter.temporaryHeroLevel
    ?? Math.max(0, integer(hero.level, 0, maxSagardLevel(rules)) - (encounter.heroLevelPenalty ?? 0))}, 'hero', rules);
  result.maxHp = integer(encounter.maxHeroHp ?? rules.maxHeroHp, result.hp, 1000);
  if (rules.maxShield != null) integer(result.shield, 0, rules.maxShield);
  if (encounter.heroWeaponDisabled) {result.damageBonus = 0; delete result.damageOverrides;}
  if (encounter.heroArmorDisabled) result.damageReduction = 0;
  if (encounter.printedHero?.level === result.level) result.chart = chart(encounter.printedHero.chart);
  return result;
}

export function sagardDamageForRoll(attacker, die) {
  const roll = integer(die, 1, 4), base = chart(attacker.chart)[roll - 1];
  return attacker.damageOverrides?.[roll] ?? (base + (attacker.bonusOnHitOnly && base === 0 ? 0 : attacker.damageBonus));
}

function validateEncounter(spec) {
  if (!spec || spec.mode === 'manual') throw new RangeError(spec?.manualReason || 'Choose an automatic encounter');
  if (!['hero', 'enemy', 'random'].includes(spec.initiative ?? 'hero')
      || !['all', 'serial'].includes(spec.enemyMode ?? 'all')
      || !['none', 'even', 'four', 'one', 'automatic', 'jump'].includes(spec.escape ?? 'even')) throw new RangeError('Invalid encounter rules');
  integer(spec.heroOpeningAttacks ?? 1, 1, 100);
  integer(spec.heroAttacksPerRound ?? 1, 1, 100);
  integer(spec.escapeAfterRounds ?? 0, 0, 1000000);
  if (spec.temporaryHeroLevel != null) integer(spec.temporaryHeroLevel, 0, 6);
  if (spec.heroLevelPenalty != null) integer(spec.heroLevelPenalty, 0, 6);
  if (spec.alternateEnemyHero != null && typeof spec.alternateEnemyHero !== 'boolean') throw new RangeError('Invalid alternating attacks');
  if (spec.maxHeroHp != null) integer(spec.maxHeroHp, 1, 1000);
  if (spec.mapRetrieval != null) integer(spec.mapRetrieval, 1, 4);
  if (spec.attackTargetOrder != null && (!Array.isArray(spec.attackTargetOrder) || !spec.attackTargetOrder.length
      || spec.attackTargetOrder.some(id => !/^hero$|^ally\d+$/.test(id)))) throw new RangeError('Invalid attack target order');
  if (spec.escapeVolley != null) integer(spec.escapeVolley, 1, 1000);
  for (const key of ['precombatMissiles', 'escapeAttack', 'heroWeaponDisabled', 'heroArmorDisabled', 'unknownOpponentLevel']) {
    if (spec[key] != null && typeof spec[key] !== 'boolean') throw new RangeError('Invalid encounter option');
  }
  if (spec.heroInitiativeDice != null && (!Array.isArray(spec.heroInitiativeDice)
      || spec.heroInitiativeDice.length !== 2 || new Set(spec.heroInitiativeDice).size !== 2
      || spec.heroInitiativeDice.some(n => !Number.isInteger(n) || n < 1 || n > 4))) throw new RangeError('Invalid initiative dice');
  integer(spec.enemyMeltBeforeAttack ?? 0, 0, 1000);
  if (spec.interference != null) {
    const rule = spec.interference, source = spec.opponents?.[rule.actorIndex];
    integer(rule.actorIndex, 0, 99);
    if (!source || source.hp != null || source.canBeTargeted !== false) throw new RangeError('Invalid interference actor');
    chart(source.chart);
    if (source.level != null) integer(source.level, 0, 6);
    if (!Array.isArray(rule.targetFaces) || rule.targetFaces.length !== 4
        || rule.targetFaces.some(target => !['hero', 'opponent', 'both', 'none'].includes(target))) throw new RangeError('Invalid interference targets');
    if (rule.activationFaces != null && (!Array.isArray(rule.activationFaces) || !rule.activationFaces.length
        || new Set(rule.activationFaces).size !== rule.activationFaces.length
        || rule.activationFaces.some(n => !Number.isInteger(n) || n < 1 || n > 4))) throw new RangeError('Invalid interference activation');
  }
  if (spec.escapeVariants != null) {
    if (!Array.isArray(spec.escapeVariants) || !spec.escapeVariants.length || spec.escapeVariants.length > 10) throw new RangeError('Invalid escape choices');
    for (const option of spec.escapeVariants) {
      if (!option.label || !option.target || !Array.isArray(option.faces) || !option.faces.length
          || new Set(option.faces).size !== option.faces.length
          || option.faces.some(n => !Number.isInteger(n) || n < 1 || n > 4)) throw new RangeError('Invalid escape choice');
    }
  }
  if (spec.printedHero != null) {integer(spec.printedHero.level, 0, 6); chart(spec.printedHero.chart);}
  if (spec.enemyEscapeFaces != null) {
    if (!Array.isArray(spec.enemyEscapeFaces) || !spec.enemyEscapeFaces.length
        || new Set(spec.enemyEscapeFaces).size !== spec.enemyEscapeFaces.length
        || spec.enemyEscapeFaces.some(n => !Number.isInteger(n) || n < 1 || n > 4)) throw new RangeError('Invalid enemy escape faces');
    integer(spec.storyGoldLossPerEscape ?? 0, 0, 1000000);
  }
  if (spec.enemyAttack != null) {
    if (spec.enemyAttack.kind !== 'jab' || !spec.enemyAttack.target) throw new RangeError('Invalid special enemy attack');
    for (const key of ['triggerFaces', 'confirmationFaces']) {
      const faces = spec.enemyAttack[key];
      if (!Array.isArray(faces) || !faces.length || new Set(faces).size !== faces.length
          || faces.some(n => !Number.isInteger(n) || n < 1 || n > 4)) throw new RangeError('Invalid jab faces');
    }
  }
  return spec;
}

function refreshLevels(fight) {
  for (const row of actors(fight)) {
    const band = row.hpBands?.find(value => row.hp >= value.minHp && row.hp <= value.maxHp);
    if (band) {row.level = band.level; row.chart = chart(band.chart ?? fight.rules.damageByLevel[band.level]);}
  }
}

function queue(fight, first = false) {
  const spec = fight.encounter;
  let foes = present(fight).filter(row => row.retaliationStartsRound <= fight.round);
  if (spec.enemyMode === 'serial') foes = foes.slice(0, 1);
  const joining = foes.filter(row => row.joinsFirst && row.joinsRound === fight.round && row.joinedRound == null);
  for (const row of joining) row.joinedRound = fight.round;
  const enemies = foes.filter(row => !joining.includes(row)).map(row => row.id);
  const attacks = first ? spec.heroOpeningAttacks ?? spec.heroAttacksPerRound ?? 1 : spec.heroAttacksPerRound ?? 1;
  const heroes = [...Array(attacks).fill('hero'), ...living(fight.allies).map(row => row.id)];
  if (spec.alternateEnemyHero) return [...joining.map(row => row.id),
    ...enemies.flatMap(id => fight.opponentFirst ? [id, 'hero'] : ['hero', id]), ...living(fight.allies).map(row => row.id)];
  const order = fight.opponentFirst ? [...enemies, ...heroes] : [...heroes, ...enemies];
  return [...joining.map(row => row.id), ...(first && spec.enemyOpeningFreeAttacks ? [...enemies, ...order] : order)];
}

export function startSagardFight(hero, encounter, rules, options = {}) {
  validateSagardRules(rules); validateEncounter(encounter);
  const supplied = options.opponents ?? encounter.opponents;
  const opponents = encounter.interference ? supplied?.filter(row => row.canBeTargeted !== false) : supplied;
  const allies = options.allies ?? encounter.allies ?? [];
  if (!Array.isArray(opponents) || !opponents.length || opponents.length > 100 || !Array.isArray(allies) || allies.length > 100) {
    throw new RangeError('Choose combatants');
  }
  if (encounter.interference && (opponents.length !== 1 || opponents[0].immortal)) throw new RangeError('Choose one mortal host');
  const effectiveRules = {...rules, maxHeroHp: encounter.maxHeroHp ?? rules.maxHeroHp};
  const fight = {rulesVersion: 1, rules: clone(effectiveRules), encounter: clone(encounter),
    hero: createSagardHero(hero, encounter, rules),
    opponents: opponents.map((row, index) => actor(row, 'enemy' + index, rules, encounter.enemyAttack?.kind === 'jab', encounter.unknownOpponentLevel)),
    allies: allies.map((row, index) => actor(row, 'ally' + index, rules)),
    healing: {fang: Boolean(options.fang), moss: Boolean(options.moss)},
    status: 'fighting', round: 1, phase: encounter.initiative === 'random' ? 'initiative' : 'round',
    opponentFirst: encounter.initiative === 'enemy', cursor: 0, queue: [],
    heroAttacksThisRound: 0, escapeAttempted: false, turnSerial: 0, log: []};
  if (rules.maxShield != null) integer(fight.hero.shield, 0, rules.maxShield);
  fight.hero.maxHp = integer(effectiveRules.maxHeroHp, fight.hero.hp, 1000);
  if (encounter.temporaryHeroLevel != null || encounter.heroLevelPenalty != null) fight.baseHeroLevel = integer(hero.level, 0, maxSagardLevel(rules));
  if (rules.spiritLuckEnabled) fight.healing.spiritLuck = Boolean(options.spiritLuck);
  if (rules.stunStoneEnabled) fight.stunStone = {held: Boolean(options.stunStone), broken: Boolean(options.stunStoneBroken)};
  if (rules.projectiles) {
    fight.ammo = Object.fromEntries(rules.projectiles.map(rule => [rule.id, integer(options.ammo?.[rule.id] ?? 0, 0, rule.maxHeld)]));
    fight.missilesThisRound = {}; fight.dahliaOil = Boolean(options.dahliaOil);
  }
  if (rules.magicDagger) fight.magicDaggerPower = integer(options.magicDaggerPower ?? 0, 0, rules.magicDagger.maximumPower);
  if (rules.salt) {
    fight.saltBags = integer(options.saltBags ?? 0, 0, rules.salt.maxHeld);
    if (encounter.zombies && options.useSalt) {
      const victims = fight.opponents.slice(0, Math.min(fight.saltBags, 1 + fight.allies.length));
      for (const row of victims) row.hp = 0;
      fight.saltBags -= victims.length;
      if (victims.length) log(fight, {kind: 'salt', count: victims.length});
    }
  }
  if (encounter.mapRetrieval) fight.mapRetrieved = false;
  refreshLevels(fight);
  if (fight.phase !== 'initiative' && !encounter.precombatMissiles) fight.queue = queue(fight, true);
  if (encounter.precombatMissiles) {fight.pendingInitiative = fight.phase === 'initiative'; fight.phase = 'prelude';}
  prepareInterference(fight); prepareEnemyEscapes(fight);
  if (fight.log.some(entry => entry.kind === 'salt')) outcome(fight);
  return validateSagardFight(fight);
}

export function validateSagardFight(fight) {
  if (fight?.rulesVersion !== 1 || !['fighting', 'win', 'loss', 'fled', 'withdrawn', 'cancelled'].includes(fight.status)
      || !['initiative', 'round', 'breakOff', 'prelude', 'recovery', 'escapeAftermath', 'stoneConfirm', 'stoneAttack', 'lamp', 'jabConfirm', 'enemyEscape',
        'interferenceActivate', 'interferenceTarget', 'interferenceDamage'].includes(fight.phase) || !Array.isArray(fight.opponents)
      || !fight.opponents.length || fight.opponents.length > 100 || !Array.isArray(fight.allies) || fight.allies.length > 100
      || !Array.isArray(fight.queue) || fight.queue.length > 300 || !Array.isArray(fight.log) || fight.log.length > 500
      || typeof fight.healing?.fang !== 'boolean' || typeof fight.healing?.moss !== 'boolean') throw new RangeError('Invalid saved Sagard fight');
  validateSagardRules(fight.rules); validateEncounter(fight.encounter);
  if (fight.rules.salt) integer(fight.saltBags, 0, fight.rules.salt.maxHeld);
  integer(fight.round, 1, 1000000); integer(fight.cursor, 0, fight.queue.length);
  integer(fight.turnSerial, 0, 1000000000); integer(fight.heroAttacksThisRound, 0, 100);
  if (typeof fight.escapeAttempted !== 'boolean' || typeof fight.opponentFirst !== 'boolean') throw new RangeError('Invalid combat order');
  const ids = new Set();
  for (const row of actors(fight)) {
    if (!row || ids.has(row.id) || typeof row.id !== 'string' || typeof row.name !== 'string') throw new RangeError('Invalid combatant');
    ids.add(row.id);
    if (row.escaped != null && (typeof row.escaped !== 'boolean' || !row.id.startsWith('enemy')
        || !fight.encounter.enemyEscapeFaces || row.immortal)) throw new RangeError('Invalid escaped opponent');
    const jab = row.id.startsWith('enemy') && fight.encounter.enemyAttack?.kind === 'jab';
    if (jab) {
      if (row.level !== null || row.chart !== null || row.immortal) throw new RangeError('Invented jabbing opponent statistics');
    } else {
      if (!(row.id.startsWith('enemy') && row.level === null && fight.encounter.unknownOpponentLevel)) integer(row.level, 0, maxSagardLevel(fight.rules));
      chart(row.chart);
    }
    if (row.immortal) {
      if (!row.id.startsWith('enemy') || row.hp !== null || row.maxHp !== null) throw new RangeError('Invalid immortal opponent');
    } else {integer(row.maxHp, 1, 1000000); integer(row.hp, 0, row.maxHp);}
    integer(row.damageBonus, 0, 100); integer(row.damageReduction, 0, 100);
    integer(row.shield, 0, 1000); integer(row.retaliationStartsRound, 1, 1000000);
    if (row.joinsRound != null) integer(row.joinsRound, 1, 1000000);
    if (row.joinedRound != null) integer(row.joinedRound, 1, fight.round);
    for (const key of ['damageIgnoresArmor', 'joinsFirst', 'immortal', 'bonusOnHitOnly']) {
      if (row[key] != null && typeof row[key] !== 'boolean') throw new RangeError('Invalid combatant option');
    }
    if (row.damageOverrides != null) {
      if (typeof row.damageOverrides !== 'object' || Array.isArray(row.damageOverrides)
          || Object.keys(row.damageOverrides).some(key => !/^[1-4]$/.test(key))) throw new RangeError('Invalid weapon damage override');
      for (const value of Object.values(row.damageOverrides)) integer(value, 0, 100);
    }
    if (row.attackTarget != null && !/^hero$|^ally\d+$/.test(row.attackTarget)) throw new RangeError('Invalid assigned target');
    if (row.hpBands != null) {
      if (!Array.isArray(row.hpBands) || !row.hpBands.length || row.hpBands.length > 100) throw new RangeError('Invalid HP bands');
      for (const band of row.hpBands) {
        integer(band.minHp, 1, 1000000); integer(band.maxHp, band.minHp, 1000000); integer(band.level, 0, maxSagardLevel(fight.rules));
        if (band.chart != null) chart(band.chart);
      }
    }
  }
  if (fight.hero.id !== 'hero' || fight.hero.maxHp !== fight.rules.maxHeroHp || fight.queue.some(id => !ids.has(id))
      || actors(fight).some(row => row.attackTarget && !ids.has(row.attackTarget))) throw new RangeError('Invalid saved combatants');
  if (fight.healing.spiritLuck != null && typeof fight.healing.spiritLuck !== 'boolean') throw new RangeError('Invalid Spirit luck');
  if (fight.rules.magicDagger) integer(fight.magicDaggerPower, 0, fight.rules.magicDagger.maximumPower);
  if (fight.rules.projectiles) {
    if (!fight.ammo || !fight.missilesThisRound || typeof fight.dahliaOil !== 'boolean') throw new RangeError('Invalid saved missiles');
    for (const definition of fight.rules.projectiles) {
      integer(fight.ammo[definition.id], 0, definition.maxHeld);
      integer(fight.missilesThisRound[definition.id] ?? 0, 0, definition.shotsPerRound);
      sagardProjectileRule(fight, definition.id);
    }
    if (fight.projectileWindow && (!fight.rules.projectiles.some(rule => rule.id === fight.projectileWindow)
        || fight.phase !== 'round' || fight.queue[fight.cursor] !== 'hero')) throw new RangeError('Invalid missile turn');
  }
  if (fight.baseHeroLevel != null) integer(fight.baseHeroLevel, 0, maxSagardLevel(fight.rules));
  if (fight.interferenceCheckedRound != null) integer(fight.interferenceCheckedRound, 1, fight.round);
  if (fight.phase.startsWith('interference')) {
    if (!fight.encounter.interference || fight.cursor !== 0 || fight.interferenceCheckedRound === fight.round
        || (fight.phase === 'interferenceActivate' && !fight.encounter.interference.activationFaces)) throw new RangeError('Invalid interference stage');
    if (fight.phase === 'interferenceDamage' && !['hero', 'opponent', 'both'].includes(fight.interferenceTarget)) throw new RangeError('Missing interference target');
  }
  if (fight.enemyEscapeCheckedRound != null) integer(fight.enemyEscapeCheckedRound, 1, fight.round);
  if (fight.phase === 'enemyEscape') {
    if (!fight.encounter.enemyEscapeFaces || !Array.isArray(fight.enemyEscapeQueue) || !fight.enemyEscapeQueue.length
        || new Set(fight.enemyEscapeQueue).size !== fight.enemyEscapeQueue.length
        || fight.enemyEscapeQueue.some(id => !fight.opponents.some(row => row.id === id))) throw new RangeError('Invalid enemy escape checks');
    integer(fight.enemyEscapeIndex, 0, fight.enemyEscapeQueue.length - 1);
    const next = find(fight, fight.enemyEscapeQueue[fight.enemyEscapeIndex]);
    if (!next.hp || next.escaped) throw new RangeError('Invalid pending enemy escape');
  }
  if (fight.phase === 'jabConfirm' && (fight.encounter.enemyAttack?.kind !== 'jab'
      || !fight.queue[fight.cursor]?.startsWith('enemy') || find(fight, fight.queue[fight.cursor]).hp === 0)) {
    throw new RangeError('Invalid pending jab confirmation');
  }
  if (fight.stunStone != null && (typeof fight.stunStone.held !== 'boolean' || typeof fight.stunStone.broken !== 'boolean')) {
    throw new RangeError('Invalid stun stone state');
  }
  if (fight.phase === 'stoneAttack' || fight.lampReturnPhase === 'stoneAttack') integer(fight.stoneAttacksRemaining, 1, 2);
  if (fight.phase === 'stoneConfirm' && (!fight.stunStone?.held || fight.stunStone.broken)) throw new RangeError('Unavailable stun stone');
  if (fight.phase === 'lamp' && (!fight.encounter.lampTarget || !['round', 'stoneAttack'].includes(fight.lampReturnPhase))) {
    throw new RangeError('Invalid lamp opportunity');
  }
  if (fight.phase === 'recovery' && (!fight.healing.spiritLuck || fight.hero.hp !== 0
      || !['round', 'escapeAftermath'].includes(fight.recoveryFrom))) throw new RangeError('Invalid recovery decision');
  if (fight.phase === 'escapeAftermath' || fight.recoveryFrom === 'escapeAftermath') {
    if (!Array.isArray(fight.escapeQueue) || !fight.escapeQueue.length || fight.escapeQueue.length > 100
        || fight.escapeQueue.some(id => !fight.opponents.some(row => row.id === id))) throw new RangeError('Invalid escape volley');
    integer(fight.escapeIndex, 0, fight.escapeQueue.length);
  }
  if (fight.status === 'fighting' && ((fight.hero.hp === 0 && fight.phase !== 'recovery') || !living(fight.opponents).length
      || (fight.phase === 'round' && !fight.queue[fight.cursor]))) throw new RangeError('Unresolved saved combat');
  return fight;
}

function log(fight, event) {
  fight.log.push({...event, round: fight.round});
  if (fight.log.length > 500) fight.log.splice(0, fight.log.length - 500);
  fight.turnSerial++;
}

function outcome(fight) {
  if (fight.hero.hp === 0 && fight.healing.spiritLuck && fight.phase !== 'recovery') {
    fight.recoveryFrom = fight.phase; fight.phase = 'recovery'; return true;
  }
  if (fight.hero.hp === 0) fight.status = 'loss';
  else if (fight.grappleReplyResolved) {fight.status = 'win'; fight.destination = fight.encounter.grappleTarget; return true;}
  else if (!present(fight).length) {
    fight.status = fight.opponents.some(row => row.escaped) ? 'withdrawn' : 'win';
    if (fight.status === 'withdrawn') {fight.destination = fight.encounter.enemiesEscapedTarget ?? fight.encounter.winTarget; return true;}
  }
  if (fight.status !== 'fighting') {
    fight.destination = fight.encounter[fight.status + 'Target'] ?? (fight.status === 'loss' && fight.encounter.restartOnLoss ? '1' : null);
    return true;
  }
  return false;
}

function prepareInterference(fight) {
  const rule = fight.encounter.interference;
  if (rule && fight.phase === 'round' && fight.cursor === 0 && fight.interferenceCheckedRound !== fight.round) {
    fight.phase = rule.activationFaces ? 'interferenceActivate' : 'interferenceTarget';
  }
}

function finishInterference(fight) {
  fight.interferenceCheckedRound = fight.round; fight.phase = 'round'; delete fight.interferenceTarget;
  advance(fight);
}

function prepareEnemyEscapes(fight) {
  if (fight.phase !== 'round' || !fight.encounter.enemyEscapeFaces || fight.enemyEscapeCheckedRound === fight.round
      || !fight.queue[fight.cursor]?.startsWith('enemy')) return;
  fight.enemyEscapeQueue = present(fight).map(row => row.id); fight.enemyEscapeIndex = 0;
  if (fight.enemyEscapeQueue.length) fight.phase = 'enemyEscape';
}

function advance(fight) {
  if (outcome(fight)) return;
  if (fight.phase === 'escapeAftermath') {
    if (fight.escapeIndex === fight.escapeQueue.length) {fight.status = 'fled'; fight.destination = fight.encounter.escapeTarget ?? null;}
    return;
  }
  while (fight.cursor < fight.queue.length && (find(fight, fight.queue[fight.cursor]).hp === 0
      || find(fight, fight.queue[fight.cursor]).escaped)) fight.cursor++;
  if (fight.cursor < fight.queue.length) {prepareEnemyEscapes(fight); return;}
  if (fight.round === 1 && fight.encounter.breakOffAfterFirstRound && !fight.breakOffDecided) {
    fight.phase = 'breakOff'; return;
  }
  fight.round++; fight.cursor = 0; fight.heroAttacksThisRound = 0; fight.escapeAttempted = false;
  if (fight.missilesThisRound) fight.missilesThisRound = {};
  fight.queue = queue(fight);
  prepareInterference(fight); prepareEnemyEscapes(fight);
}

export function sagardTurn(fight) {
  validateSagardFight(fight);
  if (fight.status !== 'fighting') return null;
  if (fight.phase === 'enemyEscape') {
    const row = find(fight, fight.enemyEscapeQueue[fight.enemyEscapeIndex]);
    return {kind: 'enemyEscape', attackerId: row.id, attackerName: row.name, targets: []};
  }
  if (fight.phase === 'jabConfirm') {
    const attacker = find(fight, fight.queue[fight.cursor]);
    return {kind: 'jabConfirm', attackerId: attacker.id, attackerName: attacker.name, targets: ['hero']};
  }
  if (fight.phase === 'escapeAftermath') return {kind: fight.encounter.escapeVolley ? 'escapeVolley' : 'escapeAttack',
    attackerId: fight.escapeQueue[fight.escapeIndex], attackerName: find(fight, fight.escapeQueue[fight.escapeIndex]).name, targets: ['hero']};
  if (!['round', 'stoneAttack'].includes(fight.phase)) return {kind: fight.phase, targets: fight.phase === 'prelude' ? present(fight).map(row => row.id) : []};
  const attackerId = fight.queue[fight.cursor], attacker = find(fight, attackerId);
  let targets;
  if (attackerId.startsWith('enemy')) {
    const allies = living(fight.allies);
    const assigned = fight.encounter.attackTargetOrder?.[(fight.round - 1) % fight.encounter.attackTargetOrder.length] ?? attacker.attackTarget;
    targets = assigned ? [allies.some(row => row.id === assigned) ? assigned : 'hero']
      : fight.encounter.alliesFirst && allies.length ? allies.map(row => row.id) : ['hero'];
  } else {
    const foes = present(fight);
    targets = (fight.encounter.enemyMode === 'serial' ? foes.slice(0, 1) : foes).map(row => row.id);
  }
  const mapAction = attackerId === 'hero' && fight.encounter.mapRetrieval ? (fight.mapRetrieved ? 'escape' : 'retrieve') : null;
  return {kind: (fight.strategy?.mode === 'pendant' && !attackerId.startsWith('enemy')
      ? (fight.strategy.pendingActor ? 'pendantConfirm' : 'pendant') : null)
      ?? mapAction ?? (fight.projectileWindow ? 'projectile' : null)
      ?? (attackerId.startsWith('enemy') && fight.encounter.enemyAttack?.kind === 'jab' ? 'jab' : null)
      ?? (attackerId.startsWith('enemy') && fight.encounter.enemyMeltBeforeAttack
      && fight.meltAppliedToTurn !== `${fight.round}:${fight.cursor}` ? 'melt' : 'attack'),
    attackerId, attackerName: attacker.name, targets: mapAction ? [] : targets,
    canFlee: fight.phase === 'round' && attackerId === 'hero' && fight.heroAttacksThisRound === 0 && !fight.escapeAttempted
      && !fight.projectileWindow
      && fight.round > (fight.encounter.escapeAfterRounds ?? 0) && (!fight.encounter.mapRetrieval || fight.mapRetrieved)
      && (Boolean(fight.encounter.escapeVariants?.length) || (fight.encounter.escape ?? 'even') !== 'none')};
}

export function spendSagardActorAction(original, event) {
  const turn = sagardTurn(original);
  if (original.phase !== 'round' || !turn || turn.attackerId.startsWith('enemy')) throw new RangeError('No friendly action available');
  const fight = clone(original);
  if (turn.attackerId === 'hero') fight.heroAttacksThisRound++;
  log(fight, {...event, attacker: turn.attackerId});
  fight.cursor++; advance(fight);
  return validateSagardFight(fight);
}

export function resolveSagardTurn(original, die, {target, decision} = {}) {
  const turn = sagardTurn(original);
  if (['pendant', 'pendantConfirm'].includes(turn?.kind)) throw new RangeError('Resolve the pendant attempt');
  if (!turn) throw new RangeError('This fight has ended');
  if (turn.kind === 'escape') return fleeSagardFight(original, die);
  const fight = clone(original);
  if (turn.kind === 'interferenceActivate') {
    const roll = integer(die, 1, 4), active = fight.encounter.interference.activationFaces.includes(roll);
    log(fight, {kind: 'interferenceActivate', die: roll, active});
    if (active) fight.phase = 'interferenceTarget'; else finishInterference(fight);
  } else if (turn.kind === 'interferenceTarget') {
    const roll = integer(die, 1, 4), selected = fight.encounter.interference.targetFaces[roll - 1];
    log(fight, {kind: 'interferenceTarget', die: roll, target: selected});
    if (selected === 'none') finishInterference(fight);
    else {fight.interferenceTarget = selected; fight.phase = 'interferenceDamage';}
  } else if (turn.kind === 'interferenceDamage') {
    const roll = integer(die, 1, 4), source = fight.encounter.opponents[fight.encounter.interference.actorIndex];
    const raw = chart(source.chart)[roll - 1], selected = fight.interferenceTarget;
    const targets = selected === 'both' ? [fight.hero, fight.opponents[0]] : [selected === 'hero' ? fight.hero : fight.opponents[0]];
    const victims = targets.map(defender => {
      const hit = Math.max(0, raw - defender.damageReduction), shieldUsed = Math.min(defender.shield, hit);
      const damage = Math.min(defender.hp, hit - shieldUsed); defender.shield -= shieldUsed; defender.hp -= damage;
      return {id: defender.id, damage, shieldUsed};
    });
    log(fight, {kind: 'interferenceDamage', die: roll, rawDamage: raw, victims});
    refreshLevels(fight); finishInterference(fight);
  } else if (turn.kind === 'enemyEscape') {
    const roll = integer(die, 1, 4), escaped = fight.encounter.enemyEscapeFaces.includes(roll);
    const row = find(fight, turn.attackerId); row.escaped = escaped;
    log(fight, {kind: 'enemyEscape', actor: row.id, die: roll, escaped,
      storyGoldLost: escaped ? fight.encounter.storyGoldLossPerEscape ?? 0 : 0});
    fight.enemyEscapeIndex++;
    if (fight.enemyEscapeIndex === fight.enemyEscapeQueue.length) {
      fight.enemyEscapeCheckedRound = fight.round; fight.phase = 'round';
      delete fight.enemyEscapeQueue; delete fight.enemyEscapeIndex; advance(fight);
    }
  } else if (turn.kind === 'initiative') {
    const roll = integer(die, 1, 4); fight.opponentFirst = fight.encounter.heroInitiativeDice
      ? !fight.encounter.heroInitiativeDice.includes(roll) : roll % 2 !== 0;
    fight.phase = 'round'; fight.queue = queue(fight, true); log(fight, {kind: 'initiative', die: roll, opponentFirst: fight.opponentFirst});
  } else if (turn.kind === 'jab' || turn.kind === 'jabConfirm') {
    const roll = integer(die, 1, 4), confirm = turn.kind === 'jabConfirm';
    const success = original.encounter.enemyAttack[confirm ? 'confirmationFaces' : 'triggerFaces'].includes(roll);
    log(fight, {kind: turn.kind, attacker: turn.attackerId, die: roll, success});
    if (!confirm && success) fight.phase = 'jabConfirm';
    else if (confirm && success) {fight.status = 'loss'; fight.destination = fight.encounter.enemyAttack.target;}
    else {fight.phase = 'round'; fight.cursor++; advance(fight);}
  } else if (turn.kind === 'prelude') {
    if (decision !== 'continue') throw new RangeError('Choose when to begin melee');
    fight.phase = fight.pendingInitiative ? 'initiative' : 'round';
    if (fight.phase === 'round') fight.queue = queue(fight, true);
    log(fight, {kind: 'beginMelee'});
  } else if (turn.kind === 'projectile') {
    if (decision !== 'continue') throw new RangeError('Throw another missile or finish this turn');
    delete fight.projectileWindow; fight.heroAttacksThisRound++; fight.cursor++; advance(fight);
  } else if (turn.kind === 'recovery') {
    if (decision !== 'decline') throw new RangeError('Use Spirit luck or accept defeat');
    fight.phase = fight.recoveryFrom; delete fight.recoveryFrom;
    fight.status = 'loss'; fight.destination = fight.encounter.lossTarget ?? (fight.encounter.restartOnLoss ? '1' : null);
    log(fight, {kind: 'declineRecovery'});
  } else if (turn.kind === 'stoneConfirm') {
    const roll = integer(die, 1, 4); fight.stunStone.broken = roll >= 3;
    log(fight, {kind: 'stoneConfirm', die: roll, broken: fight.stunStone.broken});
    if (fight.stunStone.broken) {fight.stunStone.held = false; fight.phase = 'round';}
    else beginStoneAttacks(fight);
  } else if (turn.kind === 'lamp') {
    const roll = decision === 'skip' ? null : integer(die, 1, 4);
    log(fight, {kind: 'lamp', die: roll, success: roll === 4});
    fight.phase = fight.lampReturnPhase; delete fight.lampReturnPhase;
    if (roll === 4) {fight.status = 'win'; fight.destination = fight.encounter.lampTarget;}
  } else if (turn.kind === 'retrieve') {
    const roll = integer(die, 1, 4); fight.mapRetrieved = roll === fight.encounter.mapRetrieval;
    log(fight, {kind: 'retrieve', die: roll, success: fight.mapRetrieved});
    fight.heroAttacksThisRound++; fight.cursor++; advance(fight);
  } else if (turn.kind === 'breakOff') {
    if (!['continue', 'leave'].includes(decision)) throw new RangeError('Choose whether to continue');
    fight.breakOffDecided = true;
    log(fight, {kind: 'breakOff', decision});
    if (decision === 'leave') {fight.status = 'withdrawn'; fight.destination = fight.encounter.breakOffTarget ?? null;}
    else {fight.phase = 'round'; advance(fight);}
  } else if (turn.kind === 'melt') {
    const enemy = find(fight, turn.attackerId), before = enemy.hp;
    enemy.hp = Math.max(0, enemy.hp - fight.encounter.enemyMeltBeforeAttack);
    fight.meltAppliedToTurn = `${fight.round}:${fight.cursor}`;
    log(fight, {kind: 'melt', actor: enemy.id, damage: before - enemy.hp});
    if (enemy.hp === 0) {fight.cursor++; advance(fight);}
  } else {
    const roll = integer(die, 1, 4), targetId = target ?? (turn.targets.length === 1 ? turn.targets[0] : null);
    if (!turn.targets.includes(targetId)) throw new RangeError('Choose a valid combat target');
    const attacker = find(fight, turn.attackerId), defender = find(fight, targetId);
    const raw = turn.kind === 'escapeVolley' ? (roll % 2 === 0 ? integer(fight.encounter.escapeVolley, 1, 1000) : 0)
      : sagardDamageForRoll(attacker, roll);
    let damage = defender.immortal ? 0 : Math.max(0, raw - (attacker.damageIgnoresArmor ? 0 : defender.damageReduction));
    const shieldUsed = Math.min(defender.shield, damage);
    defender.shield -= shieldUsed; damage -= shieldUsed;
    const before = defender.hp; if (!defender.immortal) defender.hp = Math.max(0, defender.hp - damage);
    const victims = [{id: defender.id, damage: defender.immortal ? 0 : before - defender.hp}];
    if (fight.encounter.swarmSpillover && !defender.immortal && !attacker.id.startsWith('enemy')) {
      let remaining = Math.max(0, damage - before);
      for (const other of living(fight.opponents)) {
        if (!remaining) break;
        const hit = Math.min(other.hp, remaining); other.hp -= hit; remaining -= hit;
        victims.push({id: other.id, damage: hit});
      }
    }
    const stoneAttack = fight.phase === 'stoneAttack';
    if (attacker.id === 'hero' && !stoneAttack) fight.heroAttacksThisRound++;
    log(fight, {kind: turn.kind === 'escapeVolley' ? 'escapeVolley' : 'attack', attacker: attacker.id, target: targetId, die: roll, rawDamage: raw,
      damage, shieldUsed, victims});
    refreshLevels(fight);
    if (defender.id === 'hero' && victims[0].damage && fight.encounter.firstDamageTarget) {
      fight.status = 'withdrawn'; fight.destination = fight.encounter.firstDamageTarget;
    } else {
      if (attacker.id.startsWith('enemy') && fight.grapplePending) fight.grappleReplyResolved = true;
      if (fight.phase === 'escapeAftermath') fight.escapeIndex++;
      else if (stoneAttack) {
        fight.stoneAttacksRemaining--;
        if (!fight.stoneAttacksRemaining) fight.phase = 'round';
      }
      else fight.cursor++;
      advance(fight);
      if (attacker.id === 'hero' && roll === 4 && fight.status === 'fighting' && fight.encounter.lampTarget) {
        fight.lampReturnPhase = fight.phase; fight.phase = 'lamp';
      }
    }
  }
  return validateSagardFight(fight);
}

function beginStoneAttacks(fight) {
  fight.stoneAttacksRemaining = 2; fight.phase = 'stoneAttack';
  if (fight.encounter.lampTarget) {fight.lampReturnPhase = 'stoneAttack'; fight.phase = 'lamp';}
}

export function useSagardStunStone(original, die) {
  const turn = sagardTurn(original);
  if (original.phase !== 'round' || turn?.kind !== 'attack' || turn.attackerId !== 'hero'
      || !original.stunStone?.held || original.stunStone.broken) throw new RangeError('The stun stone cannot be used now');
  const fight = clone(original), roll = integer(die, 1, 4);
  log(fight, {kind: 'stunStone', die: roll});
  if (roll === 4) fight.phase = 'stoneConfirm'; else beginStoneAttacks(fight);
  return validateSagardFight(fight);
}

export function grappleSagardFight(original, die) {
  const turn = sagardTurn(original);
  if (!original.encounter.grappleTarget || original.phase !== 'round' || turn?.kind !== 'attack'
      || turn.attackerId !== 'hero' || present(original).length !== 1) throw new RangeError('Grappling is unavailable');
  const fight = clone(original), roll = integer(die, 1, 4);
  fight.grapplePending = roll === 4;
  log(fight, {kind: 'grapple', die: roll, success: fight.grapplePending});
  fight.heroAttacksThisRound++; fight.cursor++; advance(fight);
  return validateSagardFight(fight);
}

export function fleeSagardFight(original, die, {variant} = {}) {
  const turn = sagardTurn(original);
  if (!turn?.canFlee) throw new RangeError('You may not flee now');
  const fight = clone(original), mode = fight.encounter.escape;
  const choice = fight.encounter.escapeVariants?.[variant];
  if (fight.encounter.escapeVariants && (!Number.isInteger(variant) || !choice)) throw new RangeError('Choose how to escape');
  const roll = mode === 'automatic' ? null : integer(die, 1, 4);
  const success = choice ? choice.faces.includes(roll)
    : ['automatic', 'jump'].includes(mode) || (mode === 'four' ? roll === 4 : mode === 'one' ? roll === 1 : roll % 2 === 0);
  fight.escapeAttempted = true; log(fight, {kind: 'flee', die: roll, success, ...(choice ? {variant: choice.label} : {})});
  if (success && mode === 'jump') {
    fight.status = 'withdrawn'; fight.destination = roll % 2 === 0 ? fight.encounter.jumpEvenTarget : fight.encounter.jumpOddTarget;
  } else if (success && (fight.encounter.escapeVolley || fight.encounter.escapeAttack)) {
    fight.phase = 'escapeAftermath'; fight.escapeQueue = present(fight).map(row => row.id); fight.escapeIndex = 0;
  } else if (success) {fight.status = 'fled'; fight.destination = choice?.target ?? fight.encounter.escapeTarget ?? null;}
  else if (fight.encounter.mapRetrieval) {fight.heroAttacksThisRound++; fight.cursor++; advance(fight);}
  return validateSagardFight(fight);
}

export function healSagardFight(original, item) {
  validateSagardFight(original);
  if (original.status !== 'fighting' || !['fang', 'moss', 'spiritLuck'].includes(item) || !original.healing[item]
      || (original.phase === 'recovery' && item !== 'spiritLuck')
      || original.hero.hp === original.hero.maxHp) throw new RangeError('This healing item cannot be used now');
  const fight = clone(original), before = fight.hero.hp;
  fight.hero.hp = sagardHealedHp(fight, item); fight.healing[item] = false;
  log(fight, {kind: 'heal', item, restored: fight.hero.hp - before});
  if (fight.phase === 'recovery') {fight.phase = fight.recoveryFrom; delete fight.recoveryFrom; advance(fight);}
  return validateSagardFight(fight);
}

export function withdrawSagardFight(original) {
  validateSagardFight(original);
  if (original.status !== 'fighting' || !original.encounter.withdrawTarget || original.phase === 'recovery') throw new RangeError('This encounter cannot be left now');
  const fight = clone(original); fight.status = 'withdrawn'; fight.destination = fight.encounter.withdrawTarget;
  log(fight, {kind: 'surrender'}); return validateSagardFight(fight);
}

export function canThrowSagardProjectile(fight, item) {
  if (!fight || fight.status !== 'fighting') return false;
  const turn = sagardTurn(fight), rule = sagardProjectileRule(fight, item);
  return rule.phases.includes(fight.phase)
    && (!rule.firstRoundOnly || fight.round === 1)
    && !fight.encounter.heroWeaponDisabled
    && (fight.phase !== 'round' || (turn.attackerId === 'hero' && ['attack', 'projectile'].includes(turn.kind)))
    && (!rule.requiresOil || fight.dahliaOil) && fight.ammo[item] > 0
    && (!fight.projectileWindow || fight.projectileWindow === item)
    && (fight.phase !== 'round' || (fight.missilesThisRound[item] ?? 0) < rule.shotsPerRound);
}

export function throwSagardProjectile(original, item, die, {target} = {}) {
  if (!canThrowSagardProjectile(original, item)) throw new RangeError('This missile cannot be used now');
  const turn = sagardTurn(original), rule = sagardProjectileRule(original, item);
  const targetId = target ?? (turn.targets.length === 1 ? turn.targets[0] : null);
  if (!turn.targets.includes(targetId)) throw new RangeError('Choose a valid missile target');
  const fight = clone(original), defender = find(fight, targetId);
  const effect = sagardProjectileEffect(rule, defender, die);
  fight.ammo[item]--; if (!defender.immortal) defender.hp -= effect.damage;
  log(fight, {kind: 'projectile', item, target: targetId, ...effect}); refreshLevels(fight);
  if (!outcome(fight) && fight.phase === 'round') {
    fight.missilesThisRound[item] = (fight.missilesThisRound[item] ?? 0) + 1;
    if (rule.shotsPerRound > fight.missilesThisRound[item] && fight.ammo[item]) fight.projectileWindow = item;
    else {delete fight.projectileWindow; fight.heroAttacksThisRound++; fight.cursor++; advance(fight);}
  }
  return validateSagardFight(fight);
}

export function canUseSagardDagger(fight) {
  if (!fight || fight.status !== 'fighting' || !fight.rules.magicDagger || !fight.magicDaggerPower
      || fight.encounter.heroWeaponDisabled) return false;
  const turn = sagardTurn(fight);
  return turn.kind === 'attack' && turn.attackerId === 'hero';
}

export function useSagardDagger(original, {target, mode = 'damage'} = {}) {
  if (!canUseSagardDagger(original) || !['damage', 'destroy'].includes(mode)) throw new RangeError('The magic dagger cannot be used now');
  const turn = sagardTurn(original), targetId = target ?? (turn.targets.length === 1 ? turn.targets[0] : null);
  if (!turn.targets.includes(targetId)) throw new RangeError('Choose a valid dagger target');
  const fight = clone(original), defender = find(fight, targetId), power = fight.magicDaggerPower;
  if (defender.immortal || (mode === 'destroy' && (!Number.isInteger(defender.level)
      || defender.level > fight.rules.magicDagger.defeatsLevelAtMost))) throw new RangeError('This opponent cannot be destroyed by the dagger');
  const raw = mode === 'destroy' ? defender.hp : power;
  const shieldUsed = mode === 'destroy' ? 0 : Math.min(defender.shield, Math.max(0, raw - defender.damageReduction));
  const damage = mode === 'destroy' ? defender.hp : Math.min(defender.hp, Math.max(0, raw - defender.damageReduction) - shieldUsed);
  defender.shield -= shieldUsed; defender.hp -= damage;
  fight.magicDaggerPower = mode === 'destroy' ? 0 : power - 1;
  log(fight, {kind: 'dagger', target: targetId, mode, power, rawDamage: raw, damage, shieldUsed});
  refreshLevels(fight);
  if (fight.phase === 'stoneAttack') {
    fight.stoneAttacksRemaining--;
    if (!fight.stoneAttacksRemaining) fight.phase = 'round';
  } else {fight.heroAttacksThisRound++; fight.cursor++;}
  advance(fight);
  return validateSagardFight(fight);
}

export function cancelSagardFight(original) {
  validateSagardFight(original);
  if (original.status !== 'fighting') throw new RangeError('This fight has ended');
  const fight = clone(original); fight.status = 'cancelled'; log(fight, {kind: 'cancel'}); return fight;
}

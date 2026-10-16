import { SAMURAI_FIGHTS } from './roster.js';
import { customFightingEncounter } from '../fighting-fantasy/opponents.js';
import { validateSamuraiCharacter, testSamuraiLuck, fireSamuraiArrow } from './character.js';

const clone = value => structuredClone(value);
function integer(value, min = 0, max = 10000) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError('Invalid Samurai fight value');
  return value;
}
function die(roll = () => Math.floor(Math.random() * 6) + 1) { return integer(roll(6), 1, 6); }
function dice(roll) { return die(roll) + die(roll); }
function end(fight, status, destination = null, reason = status) {
  fight.status = status; fight.destination = destination; fight.reason = reason;
  fight.pending = null; fight.queue = [];
}
function death(fight) {
  if (fight.character.honour === 0) { end(fight, 'honourDeath', 99); return true; }
  if (fight.character.stamina === 0) { end(fight, 'loss'); return true; }
  return false;
}
function active(fight) {
  const first = fight.groupStart, count = fight.config.mode === 'sequential' ? 1 : fight.config.groupSize || fight.enemies.length;
  return fight.enemies.map((enemy, index) => index)
    .filter(index => index >= first && index < first + count && fight.enemies[index].stamina > 0);
}
function advanceGroup(fight) {
  while (fight.groupStart < fight.enemies.length && !active(fight).length) {
    fight.groupStart += fight.config.mode === 'sequential' ? 1 : fight.config.groupSize || fight.enemies.length;
  }
  if (!active(fight).includes(fight.target)) fight.target = active(fight)[0] ?? 0;
}
function requireFight(fight, idle = false) {
  if (!fight || fight.rulesRevision !== 1 || fight.status !== 'fighting'
    || !fight.config || !Array.isArray(fight.enemies) || !fight.enemies.length
    || !Array.isArray(fight.queue) || !Array.isArray(fight.events)) throw new RangeError('No active Samurai fight');
  validateSamuraiCharacter(fight.character, true);
  if (!['sequential', 'simultaneous'].includes(fight.config.mode)) throw new RangeError('Invalid fight mode');
  for (const foe of fight.enemies) {
    if (!foe || typeof foe.name !== 'string') throw new RangeError('Invalid opponent');
    integer(foe.skill); integer(foe.stamina); integer(foe.staminaInitial, 1);
  }
  integer(fight.groupStart, 0, fight.enemies.length - 1);
  integer(fight.target, 0, fight.enemies.length - 1);
  integer(fight.rounds); integer(fight.hits); integer(fight.defenceRemaining);
  integer(fight.playerModifier, -1000, 1000); integer(fight.enemyModifier, -1000, 1000); integer(fight.incomingDamage);
  if (typeof fight.openingUsed !== 'boolean' || typeof fight.wounded !== 'boolean'
    || !['firstKill', 'firstWound'].includes(fight.charcoalTiming)) throw new RangeError('Invalid saved fight setting');
  if (idle && (fight.pending || fight.queue.length)) throw new RangeError('Resolve the pending action');
}
function storyCheck(fight) {
  if (death(fight)) return true;
  const spec = fight.config;
  if (spec.threshold && fight.enemies.some(enemy => enemy.stamina <= spec.threshold.stamina)) {
    end(fight, 'story', spec.threshold.section, 'threshold'); return true;
  }
  if (spec.hitExit && fight.hits >= spec.hitExit.hits) {
    end(fight, 'story', spec.hitExit.section, 'hitExit'); return true;
  }
  if (spec.firstKill && (fight.enemies.some(enemy => enemy.stamina === 0)
    || fight.charcoalTiming === 'firstWound' && fight.wounded)) {
    if (!fight.wounded) fight.enemies.filter(enemy => enemy.stamina > 0).forEach(enemy => { enemy.surrendered = true; });
    end(fight, fight.wounded ? 'story' : 'win', fight.wounded ? spec.firstKill.wounded : spec.firstKill.unhurt, 'firstKill'); return true;
  }
  return false;
}
function finishRound(fight) {
  if (fight.status !== 'fighting' || storyCheck(fight)) return;
  advanceGroup(fight);
  if (fight.enemies.every(enemy => enemy.stamina === 0)) end(fight, 'win', fight.config.win);
  else if (fight.config.deadline && fight.rounds >= fight.config.deadline.rounds) {
    if (fight.config.deadline.fatal) fight.character.stamina = 0;
    end(fight, fight.config.deadline.result || 'story', fight.config.deadline.section, 'deadline');
  }
}

export function startSamuraiFight(section, input, options = {}, roll) {
  validateSamuraiCharacter(input, true);
  const spec = SAMURAI_FIGHTS.find(item => item.section === section) ?? customFightingEncounter(section, options.opponents);
  if (spec?.custom) spec.mode = 'sequential';
  if (!spec || !options || typeof options !== 'object' || Array.isArray(options)) throw new RangeError('Invalid encounter');
  const { applyEntry = true, preArrows = [], carryFrom = null, continuationStamina = null,
    playerModifier = 0, enemyModifier = 0, incomingDamage = null, acrobatics = true,
    iaijutsuUsed = false, charcoalTiming = 'firstKill', recover = true } = options;
  for (const flag of [applyEntry, acrobatics, iaijutsuUsed, recover]) {
    if (typeof flag !== 'boolean') throw new RangeError('Invalid encounter setting');
  }
  integer(playerModifier, -1000, 1000); integer(enemyModifier, -1000, 1000);
  if (incomingDamage !== null) integer(incomingDamage);
  if (!['firstKill', 'firstWound'].includes(charcoalTiming) || !Array.isArray(preArrows)
    || preArrows.length > (spec.preArrowMax || 0)) throw new RangeError('Invalid opening attack');
  const enemies = spec.copies ? Array.from({ length: spec.copies }, () => clone(spec.enemies[0])) : clone(spec.enemies);
  enemies.forEach(enemy => { enemy.staminaInitial = enemy.stamina; });
  const fight = { rulesRevision: 1, config: clone(spec), character: clone(input), enemies,
    groupStart: 0, target: 0, rounds: 0, hits: 0, wounded: false, status: 'fighting', destination: null,
    reason: null, pending: null, queue: [], events: [], playerModifier, enemyModifier,
    incomingDamage: incomingDamage ?? (typeof spec.incoming === 'number' ? spec.incoming : 2),
    charcoalTiming, openingUsed: !!spec.iaijutsuUsed || iaijutsuUsed, defenceRemaining: spec.defenceAttacks || 0 };
  if (spec.acrobatics && acrobatics && input.art === 'acrobatics') fight.enemyModifier--;
  if (spec.continuation) {
    if (carryFrom) {
      if (carryFrom.rulesRevision !== 1 || carryFrom.status !== 'story' || carryFrom.pending || carryFrom.queue?.length
        || carryFrom.config?.section !== spec.continuation || carryFrom.destination !== section
        || JSON.stringify(input) !== JSON.stringify(carryFrom.character)) throw new RangeError('Invalid continued fight');
      fight.enemies[0].stamina = integer(carryFrom.enemies[0].stamina, 1, 5);
      fight.wounded = carryFrom.wounded;
    } else {
      fight.enemies[0].stamina = integer(continuationStamina, 1, 5);
    }
    fight.events.push({ kind: 'carriedWounds', stamina: fight.enemies[0].stamina });
  } else if (carryFrom || continuationStamina !== null) throw new RangeError('Unexpected fight continuation');
  if (applyEntry) {
    for (const [stat, amount] of Object.entries(spec.entry || {})) fight.character[stat] = Math.max(0, fight.character[stat] + amount);
    if (spec.entry) fight.events.push({ kind: 'entry', changes: clone(spec.entry) });
    if (spec.unarmed) fight.character.swords = 0;
    if (spec.entryRecovery && recover) {
      fight.character.stamina = Math.max(fight.character.stamina,
        Math.min(fight.character.staminaInitial, fight.character.stamina + spec.entryRecovery));
      fight.events.push({ kind: 'rest', stamina: fight.character.stamina });
    }
    if (death(fight)) return fight;
  }
  for (const type of preArrows) {
    if (spec.preArrowType && type !== spec.preArrowType) throw new RangeError('Wrong opening arrow type');
    const shot = fireSamuraiArrow(fight.character, type, roll);
    fight.character = shot.character;
    fight.enemies[0].stamina = Math.max(0, fight.enemies[0].stamina - shot.damage);
    fight.events.push({ kind: 'arrow', ...shot, character: undefined });
  }
  if (applyEntry && spec.entryDefence) {
    const total = dice(roll), defended = total <= fight.character.skill;
    if (!defended) fight.character.stamina = Math.max(0, fight.character.stamina - 3);
    fight.events.push({ kind: 'spearDefence', total, defended });
  }
  if (!death(fight) && !storyCheck(fight)) {
    advanceGroup(fight);
    if (fight.enemies.every(enemy => enemy.stamina === 0)) end(fight, 'win', spec.win);
  }
  return fight;
}

function skill(fight) { return fight.character.skill + (fight.config.skillModifier || 0) + fight.playerModifier; }
function outgoingDamage(fight, hit, roll) {
  if (fight.config.outgoing === 'armour') return 1;
  if (fight.config.outgoing === 'phantom') {
    const total = die(roll); fight.events.push({ kind: 'phantom', total }); return total % 2 ? 1 : 2;
  }
  return hit.iaijutsu ? 3 : 2;
}
function incomingDamage(fight, roll) {
  if (fight.config.incoming !== 'phoenix') return fight.incomingDamage;
  const total = die(roll); fight.events.push({ kind: 'flame', total }); return total - 1;
}
function applyHit(fight, hit, lucky = null) {
  let amount = hit.damage;
  if (lucky !== null) {
    if (hit.direction === 'outgoing') amount = fight.config.outgoing === 'armour'
      ? lucky ? 2 : 0 : Math.max(0, amount + (lucky ? 2 : -1));
    else amount = Math.max(0, amount + (lucky ? -1 : 1));
  }
  const foe = fight.enemies[hit.enemy];
  if (hit.direction === 'outgoing') {
    foe.stamina = Math.max(0, foe.stamina - amount);
    if (amount > 0) fight.hits++;
    if (amount > 0 && fight.config.critical) fight.queue.unshift({ kind: 'critical' });
  } else {
    fight.character.stamina = Math.max(0, fight.character.stamina - amount);
    if (amount > 0) fight.wounded = true;
    if (fight.character.stamina > 0) {
      if (fight.config.curse) fight.queue.unshift({ kind: 'curse' });
      if (fight.config.swordRunes) fight.queue.unshift({ kind: 'runes' });
      if (fight.config.enemySpells) fight.queue.unshift({ kind: 'spell' });
    }
  }
  fight.events.push({ kind: 'damage', ...hit, amount });
  storyCheck(fight);
}
function runeLoss(fight) {
  fight.character.skill = Math.max(0, fight.character.skill - 1);
  fight.character.luck = Math.max(0, fight.character.luck - 1);
  fight.events.push({ kind: 'runeLoss', section: 47 });
}
function pump(fight, roll) {
  while (fight.status === 'fighting' && !fight.pending && fight.queue.length) {
    const action = fight.queue.shift();
    if (action.kind === 'hit') {
      if (fight.enemies[action.enemy].stamina === 0) continue;
      const hit = { ...action, damage: action.direction === 'outgoing'
        ? outgoingDamage(fight, action, roll) : incomingDamage(fight, roll) };
      if (fight.character.luck > 0) fight.pending = { kind: 'damageLuck', hit };
      else applyHit(fight, hit);
    } else if (action.kind === 'nito') {
      if (fight.enemies[action.enemy].stamina > 0) fight.pending = action;
    } else if (action.kind === 'curse' || action.kind === 'critical') {
      fight.pending = action;
    } else if (action.kind === 'runes') {
      const total = dice(roll), stamina = fight.character.stamina;
      fight.events.push({ kind: 'runeRoll', total, stamina });
      if (total > stamina) runeLoss(fight);
      else if (total === stamina) fight.pending = { kind: 'runeEquality', total };
    } else if (action.kind === 'spell') {
      const total = die(roll), stat = total <= 2 ? 'stamina' : total <= 4 ? 'luck' : 'skill';
      const amount = stat === 'stamina' ? 2 : 1, section = stat === 'stamina' ? 90 : stat === 'luck' ? 102 : 118;
      fight.character[stat] = Math.max(0, fight.character[stat] - amount);
      fight.events.push({ kind: 'spell', total, stat, amount, section }); death(fight);
    } else if (action.kind === 'beam') {
      const total = die(roll), amount = total % 2 ? 4 : 0;
      fight.character.stamina = Math.max(0, fight.character.stamina - amount);
      fight.events.push({ kind: 'beam', total, amount }); death(fight);
    } else throw new RangeError('Unknown Samurai action');
  }
  if (fight.status === 'fighting' && !fight.pending && !fight.queue.length) finishRound(fight);
  return fight;
}

export function samuraiRound(input, roll) {
  requireFight(input, true);
  const fight = clone(input), indices = active(fight), spec = fight.config;
  if (!indices.includes(fight.target)) throw new RangeError('Invalid attack target');
  fight.events = []; fight.rounds++;
  if (fight.defenceRemaining) {
    for (const index of indices) {
      if (!fight.defenceRemaining) break;
      const playerAttack = dice(roll) + skill(fight), enemyAttack = dice(roll) + fight.enemies[index].skill + fight.enemyModifier;
      fight.events.push({ kind: 'attack', enemy: index, playerAttack, enemyAttack, defenceOnly: true });
      if (enemyAttack > playerAttack) fight.queue.push({ kind: 'hit', direction: 'incoming', enemy: index });
      fight.defenceRemaining--;
    }
    return pump(fight, roll);
  }
  const iaijutsu = fight.character.art === 'iaijutsu' && fight.character.swords > 0 && !spec.unarmed && !fight.openingUsed;
  fight.openingUsed = true;
  const playerRoll = iaijutsu && indices.length === 1 ? null : dice(roll);
  const playerAttack = playerRoll === null ? null : playerRoll + skill(fight);
  const incoming = [];
  for (const index of indices) {
    if (iaijutsu && index === fight.target) {
      fight.events.push({ kind: 'iaijutsu', enemy: index });
      fight.queue.push({ kind: 'hit', direction: 'outgoing', enemy: index, iaijutsu: true });
      continue;
    }
    const enemyAttack = dice(roll) + fight.enemies[index].skill + fight.enemyModifier;
    fight.events.push({ kind: 'attack', enemy: index, playerAttack, enemyAttack });
    if (index === fight.target && playerAttack > enemyAttack) {
      fight.queue.push({ kind: 'hit', direction: 'outgoing', enemy: index });
    } else if (enemyAttack > playerAttack && fight.rounds > (spec.noCounterRounds || 0)) {
      incoming.push({ kind: 'hit', direction: 'incoming', enemy: index });
    }
  }
  if (fight.character.art === 'nito' && fight.character.swords === 2 && !spec.unarmed && playerRoll >= 9) {
    fight.queue.push({ kind: 'nito', enemy: fight.target });
  }
  fight.queue.push(...incoming);
  if (spec.periodicBeam && fight.rounds % 3 === 0) fight.queue.push({ kind: 'beam' });
  return pump(fight, roll);
}

export function resolveSamuraiAction(input, choice, roll) {
  requireFight(input);
  if (!input.pending || typeof choice !== 'boolean') throw new RangeError('No pending Samurai choice');
  const fight = clone(input), action = fight.pending;
  fight.pending = null; fight.events = [];
  if (action.kind === 'damageLuck') {
    let lucky = null;
    if (choice) {
      if (!fight.character.luck) throw new RangeError('No Luck');
      const result = testSamuraiLuck(fight.character, roll);
      fight.character = result.character; lucky = result.lucky;
      fight.events.push({ kind: 'luck', total: result.total, lucky, mandatory: false });
    }
    applyHit(fight, action.hit, lucky);
  } else if (action.kind === 'nito') {
    if (choice) {
      const playerRoll = dice(roll), playerAttack = playerRoll + skill(fight);
      const enemyAttack = dice(roll) + fight.enemies[action.enemy].skill + fight.enemyModifier;
      fight.events.push({ kind: 'nito', playerRoll, playerAttack, enemyAttack });
      if (playerAttack > enemyAttack) fight.queue.unshift({ kind: 'hit', direction: 'outgoing', enemy: action.enemy });
    }
  } else if (action.kind === 'curse' || action.kind === 'critical') {
    if (!choice) throw new RangeError('The printed Luck check is mandatory');
    const result = testSamuraiLuck(fight.character, roll);
    fight.character = result.character;
    fight.events.push({ kind: 'luck', total: result.total, lucky: result.lucky, mandatory: true });
    if (action.kind === 'curse' && !result.lucky) {
      fight.character.stamina = 0; end(fight, 'loss', fight.config.curse, 'curse');
    } else if (action.kind === 'critical' && result.lucky) {
      fight.enemies.forEach(enemy => { enemy.stamina = 0; }); end(fight, 'win', fight.config.critical, 'critical');
    }
  } else if (action.kind === 'runeEquality') {
    if (choice) runeLoss(fight);
    fight.events.push({ kind: 'runeEquality', applyLoss: choice });
  } else throw new RangeError('Unknown Samurai choice');
  return pump(fight, roll);
}

export function setSamuraiTarget(input, target) {
  requireFight(input, true); integer(target, 0, input.enemies.length - 1);
  if (!active(input).includes(target)) throw new RangeError('Target is not in the active group');
  const fight = clone(input); fight.target = target; fight.events = []; return fight;
}

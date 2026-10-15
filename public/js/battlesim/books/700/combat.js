import { CHECKS, RULE_VERSION, UNARMED_RETURNS, SHOOTING_RETURNS, unarmedEncounter, shootingEncounter } from './definition.js';

const PHYSICAL = ['strength', 'dexterity', 'speed'];
const NONNEGATIVE = [...PHYSICAL, 'endurance', 'enduranceMax', 'combatSkill', 'damageCode', 'shooting'];
const initialTactics = aggression => aggression === 1 ? 2 : aggression === 2 ? 3 : 1;
const hitTactics = aggression => aggression <= 2 ? 2 : aggression === 3 ? 3 : 1;

// These are advisory calculations, not fights or automatic character changes.
export function evaluateCheck(id, values) {
  const fields = CHECKS[id];
  if (!fields) throw new RangeError('Unknown check');
  const flags = ['strikingStyle', 'douglas', 'attackHelis', 'sequential', 'guardPosted'];
  for (const key of fields) {
    if (flags.includes(key)) {
      if (typeof values[key] !== 'boolean') throw new RangeError(`Invalid ${key}`);
    } else if (!Number.isFinite(values[key]) || values[key] < 0 || values[key] > 1000000) {
      throw new RangeError(`Invalid ${key}`);
    }
    if (['fighters', 'squads', 'groups', 'groupSize', 'day', 'labDamage', 'barracksDamage'].includes(key)
      && !Number.isInteger(values[key])) throw new RangeError(`Invalid ${key}`);
  }
  const v = values, sum = (...keys) => keys.reduce((n, key) => n + v[key], 0);
  const route = (score, success, win, loss) => ({ score, result: success ? 'success' : loss ? 'failure' : 'death', destination: success ? win : loss });
  const manual = (reason, score) => ({ result: 'manual', reason, ...(score === undefined ? {} : { score }) });
  const casualties = (losses, destination = null, fatalAtZero = false) => {
    if (!Number.isInteger(losses)) return { ...manual('half'), proposedLosses: losses, destination };
    const remaining = Math.max(0, v.fighters - losses);
    const fatal = fatalAtZero && remaining === 0;
    return { result: fatal ? 'death' : 'casualties', losses: Math.min(v.fighters, losses), remaining, destination: fatal ? null : destination };
  };
  switch (String(id)) {
    case '42': { const n = sum('strength', 'speed', 'combatSkill'); return route(n, n >= 25, 23, 13); }
    case '101':
    case '111': {
      const n = sum('strength', 'dexterity', 'combatSkill');
      return route(n, String(id) === '101' ? n >= 24 : n > 26, v.strikingStyle ? 131 : 121, 141);
    }
    case '175': { const n = sum('strength', 'dexterity', 'combatSkill') * (v.douglas ? 2 : 1); return route(n, n > 32, 157, 167); }
    case '210': { const n = sum('speed', 'shooting'); return route(n, n >= 16, 240, 230); }
    case '230': { const n = sum('strength', 'speed', 'dexterity', 'combatSkill'); return route(n, n >= 30, 260, 250); }
    case '252': {
      const n = sum('shooting', 'combatSkill', 'primaryPower');
      return n === 14 ? manual('overlap', n) : route(n, n > 14, 262, null);
    }
    case '256': { const n = sum('speed', 'dexterity', 'combatSkill'); return route(n, n > 20, 296, 286); }
    case '257': { const n = sum('strength', 'dexterity'); return { score: n, result: n >= 12 ? 'success' : 'injury', destination: null }; }
    case '83-smg': {
      const n = sum('shooting', 'speed');
      return n >= 6 && n < 8 ? manual('gap', n) : route(n, n >= 8, 124, 114);
    }
    case '83-pistol': { const n = sum('shooting', 'speed'); return route(n, n >= 16, 104, 114); }
    case '216': return casualties(v.primaryPower <= 30 ? 6 : v.primaryPower < 60 ? 4 : 2, 207);
    case '226': return casualties(v.primaryPower <= 15 ? v.fighters : v.primaryPower < 20 ? v.fighters / 2 : 1, v.primaryPower <= 15 ? 216 : 207);
    case '220': return { ...casualties(v.fighters), result: v.fighters >= 10 ? 'success' : 'death', destination: v.fighters >= 10 ? 210 : null };
    case '228': { const n = 2 * v.shooting + v.primaryPower; return route(n, n > 35, 209, null); }
    case '242':
    case '282': {
      const losses = String(id) === '242' ? [6, 4, 2, 0] : [3, 2, 1];
      if (v.labDamage >= losses.length) throw new RangeError('Invalid laboratory damage');
      return casualties(losses[v.labDamage], null, true);
    }
    case '243':
    case '273': {
      const losses = String(id) === '243' ? [4, 3, 0] : [2, 1];
      if (v.barracksDamage >= losses.length) throw new RangeError('Invalid barracks damage');
      return casualties(losses[v.barracksDamage], null, true);
    }
    case '261':
      if (v.squads < 1 || v.fighters !== 8 * v.squads) throw new RangeError('Each transport carries eight commandos');
      return { ...casualties(v.attackHelis ? 0 : 16), ...(!v.attackHelis && v.squads <= 2 ? { result: 'death' } : {}) };
    case '268':
    case '284': {
      if (v.day < 1 || v.day > 31) throw new RangeError('Invalid calendar day');
      const odd = v.day % 2 === 1;
      return String(id) === '284' ? casualties(!v.guardPosted && odd ? 2 : 0, 269)
        : casualties(v.sequential ? 2 : odd ? 1 : 0, v.sequential && odd ? 298 : 288);
    }
    case '283':
    case '292':
      if (v.groupSize < 2 || v.groups < 1 || v.fighters !== v.groups * v.groupSize) throw new RangeError('Enter the fighters assigned to equal-sized groups');
      return casualties(v.groupSize >= 4 ? String(id) === '283' ? 0 : 1 : v.groupSize === 3 ? v.groups : v.fighters / 2,
        v.groupSize === 2 ? String(id) === '283' ? 273 : 282 : null, true);
    default: throw new RangeError('Unknown check');
  }
}

function validatePlayer(player) {
  for (const stat of NONNEGATIVE) {
    if (!Number.isFinite(player[stat]) || player[stat] < 0) throw new RangeError(`Invalid ${stat}`);
  }
  if (player.endurance <= 0) throw new RangeError('A defeated character cannot start a fight');
  if (player.endurance > player.enduranceMax) throw new RangeError('Endurance exceeds its maximum');
}

export function startUnarmedFight(player, origin, options = {}) {
  validatePlayer(player);
  const multiplier = options.playerMultiplier ?? 1;
  if (!Number.isFinite(multiplier) || multiplier <= 0) throw new RangeError('Invalid player multiplier');
  const opponents = unarmedEncounter(origin, options);
  const fight = {
    ruleVersion: RULE_VERSION, mode: 'unarmed', origin: Number(origin),
    player: { ...player }, beforeOpponent: { ...player },
    opponents, enemyIndex: 0, defeated: 0, phase: 'entry', tactics: null,
    playerMultiplier: multiplier, outcome: null, destination: null,
    fatal: false, rounds: 0, steps: 0, events: [],
  };
  prepareOpponent(fight);
  return fight;
}

function prepareOpponent(fight) {
  fight.enemy = { ...fight.opponents[fight.enemyIndex] };
  const remaining = fight.opponents.length - fight.enemyIndex;
  if (fight.origin === 102) fight.enemy.damageCode = remaining === 2 ? 12 : 8;
  if (fight.origin === 177) fight.enemy.damageCode = 4 + 6 * (remaining - 1);
  fight.beforeOpponent = { ...fight.player };
  fight.phase = 'entry';
  fight.tactics = null;
}

function event(fight, type, values = {}) {
  fight.events.push({ type, ...values });
  if (fight.events.length > 160) fight.events.splice(0, fight.events.length - 160);
}

function recover(fight, victory) {
  for (const stat of PHYSICAL) fight.player[stat] = fight.beforeOpponent[stat];
  const lostEndurance = Math.max(0, fight.beforeOpponent.endurance - fight.player.endurance);
  fight.player.endurance += victory ? lostEndurance : lostEndurance / 2;
}

function finish(fight, outcome) {
  fight.outcome = outcome;
  fight.phase = 'complete';
  const route = fight.returnRoutes ?? UNARMED_RETURNS[fight.origin];
  fight.destination = route[outcome] ?? null;
  fight.fatal = outcome === 'loss' && Boolean(route.fatal);
  event(fight, 'outcome', { outcome, source: outcome === 'win' ? 70 : outcome === 'loss' ? 90 : 77,
    destination: fight.destination, fatal: fight.fatal });
}

function victory(fight) {
  recover(fight, true);
  fight.player.combatSkill += 1;
  fight.defeated += 1;
  event(fight, 'opponent-defeated', { source: 70, index: fight.enemyIndex });
  fight.enemyIndex += 1;
  if (fight.enemyIndex < fight.opponents.length) prepareOpponent(fight);
  else finish(fight, 'win');
}

function defeat(fight) {
  recover(fight, false);
  finish(fight, 'loss');
}

function hurtPlayer(fight, damage, physicalLoss = null) {
  fight.player.endurance = Math.max(0, fight.player.endurance - damage);
  if (physicalLoss) {
    const [stat, amount] = physicalLoss;
    fight.player[stat] = Math.max(0, fight.player[stat] - amount);
  }
  event(fight, 'player-damaged', { damage, physicalLoss });
  if (fight.player.endurance <= 0) {
    defeat(fight);
    return true;
  }
  return false;
}

function attackFailure(fight, kind) {
  const enemy = fight.enemy;
  if (kind === 'throw' && enemy.skillCode >= 3) return defeat(fight);
  const damage = kind === 'fast' ? enemy.damageCode / 2 : enemy.damageCode;
  const loss = kind === 'force' ? ['strength', enemy.skillCode]
    : kind === 'fast' ? ['speed', enemy.skillCode] : null;
  if (hurtPlayer(fight, damage, loss)) return;
  fight.tactics = kind === 'fast'
    ? (enemy.aggression <= 2 ? 2 : 1) : (enemy.aggression === 1 ? 2 : 1);
}

function attackSuccess(fight, kind) {
  const { player, enemy } = fight;
  const damage = kind === 'force' ? player.damageCode : Math.max(0, player.damageCode - enemy.skillCode);
  if (kind === 'fast') {
    enemy.strength = Math.max(0, enemy.strength - damage);
    enemy.speed = Math.max(0, enemy.speed - damage);
  } else enemy.endurance = Math.max(0, enemy.endurance - damage);
  event(fight, 'enemy-damaged', { damage, kind });
  if (enemy.endurance <= 0 || (kind === 'fast' && (enemy.strength <= 0 || enemy.speed <= 0))) {
    victory(fight);
    return;
  }
  fight.tactics = kind === 'throw' ? (enemy.aggression <= 3 ? 2 : 1) : hitTactics(enemy.aggression);
}

function attack(fight, kind) {
  const { player: p, enemy: e, tactics } = fight;
  let playerTotal, enemyTotal;
  if (kind === 'force') {
    playerTotal = 2 * p.strength + p.combatSkill;
    enemyTotal = tactics === 1 ? e.strength * e.skillCode
      : tactics === 2 ? e.strength + e.speed + e.skillCode : e.dexterity + e.speed + e.skillCode;
  } else if (kind === 'fast') {
    playerTotal = p.strength + p.speed + p.combatSkill;
    enemyTotal = tactics === 1 ? 2 * e.strength
      : tactics === 2 ? e.strength + e.speed + e.skillCode : e.dexterity + e.speed;
  } else {
    playerTotal = p.dexterity + p.speed + p.combatSkill;
    enemyTotal = tactics === 1 ? e.strength + e.skillCode
      : tactics === 2 ? e.strength + e.dexterity + e.skillCode : e.dexterity + e.speed + 2 * e.skillCode;
  }
  playerTotal *= fight.playerMultiplier;
  const hit = playerTotal >= enemyTotal;
  event(fight, 'attack', { kind, playerTotal, enemyTotal, hit,
    source: kind === 'force' ? 58 : kind === 'fast' ? 68 : 78 });
  if (hit) attackSuccess(fight, kind);
  else attackFailure(fight, kind);
}

function disarm(fight) {
  const amount = fight.enemy.weaponCode;
  fight.enemy.damageCode = Math.max(0, fight.enemy.damageCode - amount);
  fight.enemy.weaponCode = 0;
  event(fight, 'disarmed', { amount });
}

function passiveDefenceReturn(fight) {
  // Both 60 and 69 explicitly award the passive first-code-1 opponent's win route.
  if (fight.enemy.aggression === 1) victory(fight);
  else fight.tactics = fight.enemy.aggression === 2 ? 3 : 1;
}

export function unarmedActions(fight) {
  if (fight.mode !== 'unarmed' || fight.outcome) return [];
  if (fight.phase === 'entry') return fight.enemy.weaponCode > 0 ? ['begin', 'kick', 'grab'] : ['begin'];
  return ['force', 'fast', 'throw', 'wait', 'block', 'dodge', 'evade', 'feint', 'fatigue', 'flee'];
}

export function stepUnarmedFight(fight, action, { defenceTie } = {}) {
  if (!unarmedActions(fight).includes(action)) throw new RangeError('Action unavailable in this phase');
  if (fight.ruleVersion !== RULE_VERSION) throw new RangeError('Unsupported saved fight rules');
  const { player: p, enemy: e } = fight;
  if (['block', 'dodge', 'evade'].includes(action) && fight.tactics === 1) {
    const stat = action === 'block' ? 'strength' : action === 'dodge' ? 'speed' : 'dexterity';
    const playerTotal = (p[stat] + p.combatSkill) * fight.playerMultiplier;
    const enemyTotal = e.strength * e.skillCode;
    if (playerTotal === enemyTotal && !['success', 'failure'].includes(defenceTie)) {
      return { needsDecision: { source: 69, reason: 'defence-equality', playerTotal, enemyTotal } };
    }
  }
  fight.steps += 1;
  if (action !== 'begin') fight.rounds += 1;
  event(fight, 'action', { action, tactics: fight.tactics });
  if (action === 'begin') {
    fight.phase = 'tactics';
    fight.tactics = initialTactics(e.aggression);
  } else if (action === 'kick') {
    const playerTotal = (p.speed + p.dexterity + p.combatSkill) * fight.playerMultiplier;
    const enemyTotal = e.speed * e.skillCode;
    if (playerTotal >= enemyTotal) disarm(fight);
    event(fight, 'comparison', { source: 60, playerTotal, enemyTotal });
    fight.phase = 'tactics';
    passiveDefenceReturn(fight);
  } else if (action === 'grab') {
    if (e.aggression === 1 && e.skillCode === 1 && p.combatSkill >= 8) {
      disarm(fight);
      fight.tactics = 2;
    } else {
      if (hurtPlayer(fight, 2 * e.damageCode)) return { fight };
      fight.tactics = 1;
    }
    fight.phase = 'tactics';
  } else if (['force', 'fast', 'throw'].includes(action)) attack(fight, action);
  else if (action === 'wait') {
    if (fight.tactics === 1) {
      const enemyTotal = e.strength + e.dexterity + e.speed + e.skillCode;
      const playerTotal = (p.speed + p.dexterity + p.combatSkill) * fight.playerMultiplier;
      event(fight, 'comparison', { source: 59, playerTotal, enemyTotal });
      if (enemyTotal >= playerTotal && hurtPlayer(fight, e.damageCode)) return { fight };
    }
    fight.tactics = 1;
  } else if (['block', 'dodge', 'evade'].includes(action)) {
    if (fight.tactics !== 1) passiveDefenceReturn(fight);
    else {
      const stat = action === 'block' ? 'strength' : action === 'dodge' ? 'speed' : 'dexterity';
      const playerTotal = (p[stat] + p.combatSkill) * fight.playerMultiplier;
      const enemyTotal = e.strength * e.skillCode;
      const hit = playerTotal > enemyTotal || (playerTotal === enemyTotal && defenceTie === 'success');
      event(fight, 'comparison', { source: 69, playerTotal, enemyTotal, hit });
      if (hit) attackSuccess(fight, 'force');
      else attackFailure(fight, 'force');
    }
  } else if (action === 'feint' || action === 'fatigue') {
    if (fight.tactics === 1) {
      if (action === 'feint' && hurtPlayer(fight, e.damageCode)) return { fight };
      fight.tactics = 1;
    } else fight.tactics = action === 'feint' ? 2 : 1;
  } else if (action === 'flee') {
    if (e.aggression === 1) victory(fight);
    else if (e.aggression === 2) {
      if (p.speed > 5) finish(fight, 'escape');
      else fight.tactics = 1;
    } else if (e.aggression === 3 && p.speed >= 8) finish(fight, 'escape');
    else defeat(fight);
  }
  return { fight };
}

const SHOOTING_CHOICES = {
  64: [84, 94, 55], 65: [84, 94, 55, 65], 74: [84, 94, 55, 65],
  75: [85, 150], 85: [107, 'continue'],
  109: [129, 139, 149], 116: [107, 127, 137, 147],
  117: [107, 118, 108], 119: [110, 120, 130], 120: [160, 110, 130],
  128: [107, 118, 108], 129: [109, 139, 149], 138: [158, 140], 148: [110, 120, 130],
  160: [110, 130, 120], 169: [180, 190, 200],
  178: [169, 189, 199], 188: [169, 179, 189, 199], 198: [169, 179, 189, 199],
};

function finiteStat(value, name, minimum = 0) {
  if (!Number.isFinite(value) || value < minimum) throw new RangeError(`Invalid ${name}`);
  return value;
}

export function startShootingFight(player, origin, options = {}) {
  validatePlayer(player);
  const source = shootingEncounter(origin, options);
  const opponents = options.opponents ?? source.opponents;
  if (opponents.length !== source.opponents.length) throw new RangeError('Incorrect opponent count');
  const weapon = { ...options.weapon };
  for (const key of ['power', 'range', 'weight']) finiteStat(weapon[key], `weapon ${key}`);
  const fight = {
    ruleVersion: RULE_VERSION, mode: 'shooting', origin: source.origin, terrain: source.terrain,
    player: { ...player }, weapon, playerCover: options.playerCover ?? source.playerCover,
    simplifiedMap: source.simplifiedMap, opponents: opponents.map(e => ({ ...e, defeated: false })),
    enemyIndex: options.firstTargetIndex ?? 0, defeated: 0, temporaryShooting: 0,
    temporarySkill: 0, steps: 0, rounds: 0, outcome: null, destination: null,
    fatal: false, pending: null, events: [], node: null,
  };
  finiteStat(fight.playerCover, 'player cover');
  for (const e of fight.opponents) {
    for (const key of ['effectiveFire', 'strength', 'dexterity', 'speed', 'cover', 'distance']) {
      finiteStat(e[key], `opponent ${key}`);
    }
    if (e.weaponPower !== null) finiteStat(e.weaponPower, 'opponent weapon power');
    if (![1, 2, 3, 4].includes(e.aggression) || ![1, 2, 3, 4].includes(e.skillCode)) {
      throw new RangeError('Invalid opponent combat code');
    }
  }
  if (!Number.isInteger(fight.enemyIndex) || !fight.opponents[fight.enemyIndex]) throw new RangeError('Invalid target');
  if (fight.terrain !== 3 && fight.enemyIndex !== 0) throw new RangeError('This fight is sequential');
  if (fight.simplifiedMap) fight.opponents.forEach(e => { e.distance = 4; });
  enterShootingTerrain(fight);
  return fight;
}

function shootingEnemy(fight) { return fight.opponents[fight.enemyIndex]; }
function shootingTotal(fight) { return fight.player.shooting + fight.temporaryShooting; }
function shootingSkill(fight) { return fight.player.combatSkill + fight.temporarySkill; }

function moveShootingDistance(fight, amount) {
  const e = shootingEnemy(fight);
  e.distance = fight.simplifiedMap ? 4 : Math.max(0, e.distance + amount);
}

function finishShooting(fight, outcome) {
  fight.outcome = outcome;
  fight.fatal = outcome === 'loss';
  fight.destination = outcome === 'loss' ? null : SHOOTING_RETURNS[fight.origin];
  fight.node = outcome === 'loss' ? 108 : outcome === 'escape' ? 158 : 150;
  fight.pending = null;
  if (fight.fatal) fight.player.endurance = 0;
  event(fight, 'outcome', { outcome, source: fight.node, destination: fight.destination, fatal: fight.fatal });
}

function enterShootingTerrain(fight) {
  const e = shootingEnemy(fight);
  if (fight.terrain === 1) enterShootingNode(fight, 116);
  else if (fight.terrain === 2) enterShootingNode(fight, e.aggression === 1 ? 119 : e.aggression === 2 ? 148 : 109);
  else if (fight.terrain === 3) {
    enterShootingNode(fight, fight.playerCover > 0
      ? (e.aggression >= 3 ? 188 : 198)
      : (e.aggression === 4 ? 178 : e.aggression >= 2 ? 188 : 198));
  } else enterShootingNode(fight, e.aggression >= 3 ? 64 : 74);
}

function killShootingOpponent(fight, options, { all = false, wound = false } = {}) {
  const alive = fight.opponents.filter(e => !e.defeated).length;
  if (wound && fight.lastOpenAttack && alive > 1) {
    for (const stat of PHYSICAL) fight.player[stat] = Math.max(0, fight.player[stat] - 1);
    event(fight, 'shooting-wound', { source: 95 });
  }
  for (const [index, e] of fight.opponents.entries()) {
    if (!e.defeated && (all || index === fight.enemyIndex)) {
      e.defeated = true;
      fight.defeated += 1;
    }
  }
  event(fight, 'opponent-shot', { source: all ? 75 : fight.node, count: all ? alive : 1 });
  const remaining = fight.opponents.findIndex(e => !e.defeated);
  if (remaining === -1) return finishShooting(fight, 'win');
  const target = fight.terrain === 3 ? (options.nextTargetIndex ?? remaining) : remaining;
  if (!Number.isInteger(target) || !fight.opponents[target] || fight.opponents[target].defeated) {
    throw new RangeError('Invalid next target');
  }
  fight.enemyIndex = target;
  if (fight.simplifiedMap) shootingEnemy(fight).distance = 4;
  if (fight.terrain === 3 && !fight.simplifiedMap) {
    fight.node = 136;
    fight.pending = { kind: 'position', source: 136, reason: 'update-map-positions' };
  } else enterShootingTerrain(fight);
}

function manualShootingBranch(fight, score, choices, reason = 'source-range-ambiguity') {
  fight.pending = { kind: 'branch', source: fight.node, reason, score, choices };
}

function applyShootingBranch(fight, branch, options) {
  if (branch.temporaryShooting) fight.temporaryShooting += branch.temporaryShooting;
  if (branch.enemyPowerIncrease) shootingEnemy(fight).weaponPower += branch.enemyPowerIncrease;
  if (branch.target === 'escape') return finishShooting(fight, 'escape');
  enterShootingNode(fight, branch.target, options);
}

function enterShootingNode(fight, node, options = {}) {
  fight.node = node;
  fight.pending = null;
  const e = shootingEnemy(fight), p = fight.player, w = fight.weapon;
  const calculate = score => { event(fight, 'calculation', { source: node, score }); return score; };
  const go = target => enterShootingNode(fight, target, options);
  if ([108, 137].includes(node)) return finishShooting(fight, 'loss');
  if ([150, 159].includes(node)) return killShootingOpponent(fight, options);
  if (node === 95) return killShootingOpponent(fight, options, { wound: true });
  if (node === 64) fight.enemyAttacking = true;
  if (node === 74) fight.enemyAttacking = false;
  if (node === 178) e.cover = 0;
  if (node === 188) e.cover = 1;
  if (node === 148) moveShootingDistance(fight, -1);
  if (node === 65 && p.dexterity + shootingSkill(fight) < 12) return finishShooting(fight, 'loss');
  if (SHOOTING_CHOICES[node] && ![120, 129, 160].includes(node)) return;
  switch (node) {
    case 55: {
      if (typeof options.clearExit !== 'boolean') {
        fight.pending = { kind: 'exit', source: 55, reason: 'confirm-exit-path' };
        return;
      }
      if (options.clearExit) return go(158);
      const score = calculate(p.speed - e.effectiveFire);
      if (score <= 3) return go(108);
      if (score > 5) return go(85);
      return manualShootingBranch(fight, score, [{ target: 108 }, { target: 85 }]);
    }
    case 84: {
      fight.lastOpenAttack = false;
      const score = calculate(shootingTotal(fight) / 2 + w.power - (fight.enemyAttacking ? 1 : e.cover) - e.effectiveFire);
      if (score <= 0) return go(108);
      if (score < 4) { p.shooting = Math.max(0, p.shooting - 2); return go(85); }
      return go(score < 8 ? 95 : 75);
    }
    case 94: {
      fight.lastOpenAttack = true;
      const score = calculate(shootingTotal(fight) + w.power - (fight.enemyAttacking ? 0 : e.cover) - e.effectiveFire / 2);
      if (score === 2) return manualShootingBranch(fight, score, [{ target: 108 }, { target: 85, temporaryShooting: 2 }]);
      if (score < 0) return manualShootingBranch(fight, score, [{ target: 108 }], 'undefined-negative-result');
      if (score < 2) return go(108);
      if (score < 6) { fight.temporaryShooting += 2; return go(85); }
      return go(score < 12 ? 95 : 75);
    }
    case 107: {
      const score = calculate(shootingTotal(fight) * (options.shotScale ?? 1) + p.speed - w.weight);
      return go(score > 2 * e.effectiveFire ? 150 : 108);
    }
    case 110: {
      if (e.weaponPower === null) {
        fight.pending = { kind: 'weapon-power', source: 110, reason: 'missing-enemy-weapon-power',
          shotPenalty: options.shotPenalty ?? 0 };
        return;
      }
      const score = calculate(shootingTotal(fight) - (options.shotPenalty ?? 0) + w.range + w.power - e.distance - e.weaponPower);
      if (score <= 8) return go(108);
      const fallback = e.aggression <= 2 ? 119 : 148;
      if (score === 16) return manualShootingBranch(fight, score,
        [{ target: fallback, enemyPowerIncrease: 2 }, { target: 159 }]);
      if (score < 16) { e.weaponPower += 2; return go(fallback); }
      return go(159);
    }
    case 118:
      if (fight.terrain === 1 || fight.playerCover <= 0) return go(108);
      return enterShootingTerrain(fight);
    case 120:
      if (calculate(p.dexterity + shootingSkill(fight)) < 14) return go(108);
      moveShootingDistance(fight, -1);
      if (e.distance === 0) return go(107);
      return;
    case 127:
      return go(calculate(p.speed + p.dexterity) > e.effectiveFire + e.speed ? 117 : 108);
    case 129:
      moveShootingDistance(fight, -1);
      if (e.distance === 0) return go(108);
      return;
    case 130: {
      const score = calculate(shootingTotal(fight) + p.speed + w.power - e.distance - w.weight);
      if (score < 6) return go(108);
      if (score < 12) return go(107);
      if (score > 12) return go(159);
      return manualShootingBranch(fight, score, [{ target: 107 }, { target: 159 }]);
    }
    case 139: {
      const score = calculate(shootingTotal(fight) + w.range + w.power - e.distance);
      return go(score <= 8 ? 109 : score < 16 ? 119 : 149);
    }
    case 140:
      fight.pending = { kind: 'conversion', source: 140, reason: 'manual-unarmed-stats' };
      return;
    case 147:
      if (calculate(p.speed + p.dexterity + shootingSkill(fight) - e.effectiveFire) <= 12) return go(128);
      e.disarmed = true;
      e.weaponPower = 0;
      return go(138);
    case 149: {
      const score = calculate(shootingTotal(fight) + p.speed + w.power - e.distance - w.weight);
      return go(score <= 6 ? 108 : score < 12 ? 119 : 159);
    }
    case 158:
      if (p.speed < 6) return go(108);
      if (p.speed >= 8) return finishShooting(fight, 'escape');
      return manualShootingBranch(fight, p.speed, [{ target: 108 }, { target: 'escape' }], 'source-speed-inconsistency');
    case 160:
      if (calculate(p.dexterity + p.speed + shootingSkill(fight)) <= 18) return go(108);
      moveShootingDistance(fight, -2);
      if (e.distance === 0) return go(108);
      return;
    case 179:
    case 189:
      if (calculate(p.dexterity + shootingSkill(fight) + 1 - e.effectiveFire) <= 8) return go(108);
      if (typeof options.occupiedCover !== 'boolean') {
        fight.pending = { kind: 'cover', source: node, reason: 'confirm-occupied-cover' };
        return;
      }
      if (options.occupiedCover) return go(107);
      moveShootingDistance(fight, node === 179 ? -2 : 2);
      return go(200);
    case 180:
    case 190: {
      moveShootingDistance(fight, node === 180 ? -3 : -1);
      if (e.distance === 0) return go(107);
      const score = calculate(shootingTotal(fight) + w.power - e.distance - e.cover);
      if (node === 190) return go(score < 4 ? 108 : score < 6 ? 200 : 150);
      if (score < 6) return go(108);
      if (score < 8) return go(200);
      if (score >= 10) return go(150);
      return manualShootingBranch(fight, score, [{ target: 200 }, { target: 150 }]);
    }
    case 199:
      return go(calculate(shootingTotal(fight) - 2 + w.power - e.distance - e.cover) < 8 ? 200 : 150);
    case 200:
      if (calculate(e.effectiveFire - e.distance - fight.playerCover) >= 6) return go(108);
      return go(e.aggression === 1 ? 198 : e.aggression === 4 ? 178 : 188);
    default:
      throw new RangeError('Unknown shooting section');
  }
}

export function shootingActions(fight) {
  if (fight.mode !== 'shooting' || fight.outcome) return [];
  if (fight.pending) {
    if (fight.pending.kind === 'branch') return fight.pending.choices.map(c => c.target);
    return [fight.pending.kind === 'conversion' ? 'convert' : 'update'];
  }
  return [...(SHOOTING_CHOICES[fight.node] ?? [])];
}

function shootingPosition(fight, position) {
  if (!position) return;
  const e = shootingEnemy(fight);
  for (const [key, target] of [['distance', e], ['cover', e], ['playerCover', fight]]) {
    if (position[key] !== undefined) target[key] = finiteStat(position[key], key);
  }
  if (fight.simplifiedMap) e.distance = 4;
}

export function stepShootingFight(fight, action, options = {}) {
  if (!shootingActions(fight).includes(action)) throw new RangeError('Action unavailable in this phase');
  if (fight.ruleVersion !== RULE_VERSION) throw new RangeError('Unsupported saved fight rules');
  if (action === 'convert') throw new RangeError('Use explicit unarmed conversion');
  const next = structuredClone(fight), previous = next.node;
  shootingPosition(next, options.position);
  next.steps += 1;
  if (!next.pending) next.rounds += 1;
  event(next, 'shooting-action', { source: previous, action });
  const pending = next.pending;
  if (pending) {
    next.pending = null;
    if (pending.kind === 'branch') applyShootingBranch(next, pending.choices.find(c => c.target === action), options);
    else if (pending.kind === 'weapon-power') {
      shootingEnemy(next).weaponPower = finiteStat(options.weaponPower, 'opponent weapon power');
      enterShootingNode(next, previous, { ...options, shotPenalty: pending.shotPenalty });
    } else if (pending.kind === 'position') {
      if (!options.position || ['distance', 'cover', 'playerCover'].some(k => options.position[k] === undefined)) {
        throw new RangeError('Enter the new map positions');
      }
      enterShootingTerrain(next);
    } else enterShootingNode(next, previous, options);
  } else if (previous === 75 && action === 150) {
    if (next.playerCover <= 4) {
      for (const e of next.opponents) {
        if (!e.defeated) next.defeated += 1;
        e.defeated = true;
      }
      event(next, 'grenade', { source: 75 });
      finishShooting(next, 'loss');
    } else killShootingOpponent(next, options, { all: true });
  } else if (previous === 85 && action === 'continue') {
    enterShootingNode(next, shootingEnemy(next).aggression === 1 ? 74 : 64, options);
  } else {
    if (previous === 85 && action === 107 && options.adjacent !== true) throw new RangeError('Confirm adjacent cover');
    if (previous === 65 && action === 65) next.temporarySkill -= 2;
    const context = { ...options };
    if ([117, 128].includes(previous) && action === 107) context.shotScale = 0.5;
    if (previous === 148 && action === 110) context.shotPenalty = 4;
    enterShootingNode(next, action, context);
  }
  Object.assign(fight, next);
  return { fight, ...(fight.pending ? { needsDecision: fight.pending } : {}) };
}

export function convertShootingToUnarmed(fight, opponents) {
  if (fight.mode !== 'shooting' || fight.pending?.kind !== 'conversion' || fight.outcome) {
    throw new RangeError('No unarmed conversion is pending');
  }
  const remaining = fight.opponents.filter(e => !e.defeated).length;
  if (!opponents && fight.origin === 143) {
    opponents = unarmedEncounter(133).slice(0, remaining);
    if (shootingEnemy(fight).disarmed) {
      opponents[0].damageCode -= opponents[0].weaponCode;
      opponents[0].weaponCode = 0;
    }
  }
  if (!Array.isArray(opponents) || opponents.length !== remaining) throw new RangeError('Preserve the remaining opponent count');
  for (const e of opponents) {
    for (const key of [...PHYSICAL, 'damageCode', 'endurance', 'weaponCode']) finiteStat(e[key], `opponent ${key}`);
    if (e.endurance <= 0 || ![1, 2, 3, 4].includes(e.aggression) || ![1, 2, 3, 4].includes(e.skillCode)) {
      throw new RangeError('Invalid unarmed opponent');
    }
  }
  if (shootingEnemy(fight).disarmed && opponents[0].weaponCode > 0) throw new RangeError('Keep the current opponent disarmed');
  const converted = startUnarmedFight(fight.player, 133);
  converted.origin = fight.origin;
  converted.opponents = opponents.map(e => ({ ...e }));
  converted.returnRoutes = fight.origin === 143 ? { ...UNARMED_RETURNS[133] }
    : { win: SHOOTING_RETURNS[fight.origin], loss: null, fatal: false };
  converted.shootingDefeated = fight.defeated;
  converted.events = structuredClone(fight.events);
  event(converted, 'converted-to-unarmed', { source: 140, remaining });
  prepareOpponent(converted);
  return converted;
}

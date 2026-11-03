// Preserve one encounter while switching between combat and a printed pendant-breaking strategy.
import {startSagardFight, validateSagardFight, sagardTurn, resolveSagardTurn,
  spendSagardActorAction, cancelSagardFight} from './core.js';

function validateRule(rule) {
  if (!rule || !['normal', 'pendant'].includes(rule.initialMode)
      || !Number.isSafeInteger(rule.normalMaxHp) || rule.normalMaxHp < 1
      || !rule.normalAlly || !Array.isArray(rule.attempts) || !rule.attempts.length) throw new RangeError('Invalid combat strategies');
  for (const attempt of rule.attempts) {
    if (!/^hero$|^ally\d+$/.test(attempt.actor)) throw new RangeError('Invalid pendant actor');
    for (const faces of [attempt.faces, attempt.confirmFaces]) {
      if (!Array.isArray(faces) || !faces.length || new Set(faces).size !== faces.length
          || faces.some(n => !Number.isInteger(n) || n < 1 || n > 4)) throw new RangeError('Invalid pendant rolls');
    }
  }
}

export function validateSagardStrategy(fight) {
  validateSagardFight(fight); validateRule(fight.encounter.strategy);
  const state = fight.strategy;
  if (fight.kind !== 'strategy' || !state || !['normal', 'pendant'].includes(state.mode)
      || typeof state.normalStarted !== 'boolean' || fight.opponents.length !== 1 || fight.allies.length !== 1
      || (state.mode === 'normal' && !state.normalStarted)
      || Boolean(fight.opponents[0].immortal) !== !state.normalStarted) throw new RangeError('Invalid saved combat strategy');
  if (state.pendingActor != null && (state.mode !== 'pendant' || fight.phase !== 'round'
      || state.pendingActor !== fight.queue[fight.cursor]
      || !fight.encounter.strategy.attempts.some(row => row.actor === state.pendingActor))) throw new RangeError('Invalid pending pendant attempt');
  return fight;
}

export function startSagardStrategy(hero, encounter, rules, options = {}) {
  validateRule(encounter.strategy);
  const mode = encounter.strategy.initialMode;
  const opponents = structuredClone(options.opponents ?? encounter.opponents);
  if (mode === 'pendant') Object.assign(opponents[0], {hp: null, immortal: true});
  const sourceAlly = encounter.allies?.[0] ?? {}, normalAlly = encounter.strategy.normalAlly;
  const allies = (options.allies ?? [sourceAlly]).map(row => ({...normalAlly, ...row,
    level: row.level ?? normalAlly.level, chart: row.chart ?? normalAlly.chart}));
  const fight = startSagardFight(hero, {...encounter, initiative: mode === 'pendant' ? 'enemy' : 'hero'}, rules,
    {...options, opponents, allies});
  fight.kind = 'strategy'; fight.strategy = {mode, normalStarted: mode === 'normal'};
  return validateSagardStrategy(fight);
}

export function sagardStrategyTurn(fight) {
  validateSagardStrategy(fight);
  return sagardTurn(fight);
}

export function resolveSagardStrategy(original, die, options) {
  const turn = sagardStrategyTurn(original);
  if (!['pendant', 'pendantConfirm'].includes(turn?.kind)) return validateSagardStrategy(resolveSagardTurn(original, die, options));
  if (!Number.isInteger(die) || die < 1 || die > 4) throw new RangeError('Roll a four-sided die');
  const fight = structuredClone(original), rule = fight.encounter.strategy.attempts.find(row => row.actor === turn.attackerId);
  if (!rule) throw new RangeError('Missing pendant attack');
  if (turn.kind === 'pendant' && rule.faces.includes(die)) {
    fight.strategy.pendingActor = turn.attackerId;
    fight.log.push({kind: 'pendantAttempt', attacker: turn.attackerId, die, round: fight.round});
    if (fight.log.length > 500) fight.log.shift(); fight.turnSerial++;
    return validateSagardStrategy(fight);
  }
  delete fight.strategy.pendingActor;
  if (turn.kind === 'pendantConfirm' && rule.confirmFaces.includes(die)) {
    fight.status = 'win'; fight.destination = fight.encounter.winTarget;
    fight.log.push({kind: 'pendantBroken', attacker: turn.attackerId, die, round: fight.round});
    if (fight.log.length > 500) fight.log.shift(); fight.turnSerial++;
    return validateSagardStrategy(fight);
  }
  return validateSagardStrategy(spendSagardActorAction(fight, {kind: 'pendantMiss', die, confirmation: turn.kind === 'pendantConfirm'}));
}

export function switchSagardStrategy(original, mode) {
  validateSagardStrategy(original);
  if (original.status !== 'fighting' || original.phase !== 'round' || !['normal', 'pendant'].includes(mode)
      || original.strategy.mode === mode || original.projectileWindow) throw new RangeError('This strategy cannot be selected now');
  let fight = structuredClone(original);
  if (fight.strategy.pendingActor) {
    delete fight.strategy.pendingActor;
    fight = spendSagardActorAction(fight, {kind: 'pendantAbandoned'});
  }
  if (mode === 'normal' && !fight.strategy.normalStarted) {
    Object.assign(fight.opponents[0], {immortal: false, hp: fight.encounter.strategy.normalMaxHp,
      maxHp: fight.encounter.strategy.normalMaxHp});
    fight.strategy.normalStarted = true;
  }
  fight.strategy.mode = mode; fight.opponentFirst = mode === 'pendant';
  fight.log.push({kind: 'strategy', mode, round: fight.round});
  if (fight.log.length > 500) fight.log.shift(); fight.turnSerial++;
  return validateSagardStrategy(fight);
}

export const cancelSagardStrategy = fight => validateSagardStrategy(cancelSagardFight(fight));

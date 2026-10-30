// Start and persist one personnel, artillery or rotating-wave combat independently of the story.
import { personnelChart, personnelCopy, personnelDice, personnelFinish, personnelForce,
  personnelHits, personnelInteger, personnelLiving, personnelOutcome } from './personnel-rules.js';
import { personnelEscapeAllowed, personnelNext, personnelQueueRound, personnelResolveTask } from './personnel-flow.js';

function guard(previous) {
  if (previous?.personnelRulesVersion !== 1 || previous.status !== 'fighting') throw new RangeError('No active personnel combat');
}
export function startPersonnelFight(player, encounter, charts, setup = {}) {
  if (!encounter || !Array.isArray(encounter.enemies)) throw new RangeError('Choose a combat setup');
  const config = personnelCopy(encounter);
  config.rules ??= {};
  const rules = config.rules;
  if (config.initiative) rules.initiative = config.initiative;
  if (rules.initiative && !['player', 'enemy'].includes(rules.initiative)) throw new RangeError('Invalid initiative');
  const force = personnelForce(player);
  if (force.length > (rules.maxPlayerUnits ?? 100)) throw new RangeError('Too many friendly units for this encounter');
  if (rules.fixedAttack && config.enemies.length) throw new RangeError('Fixed strikes do not use an invented enemy force');
  const enemies = rules.fixedAttack ? [] : personnelForce(config.enemies);
  for (const matrix of Object.values(charts ?? {})) {
    if (!Array.isArray(matrix) || matrix.length !== 11 || matrix.some(row => !Array.isArray(row) || row.length !== 11
        || row.some(cell => !Number.isSafeInteger(cell) || cell < 0))) throw new RangeError('Invalid combat charts');
  }
  if (Object.keys(charts ?? {}).sort().join('') !== 'ABCDEFG') throw new RangeError('Missing combat charts');
  for (const unit of force) if (unit.count) {
    if (!rules.fixedAttack) personnelChart(config.playerChart ?? unit.chart, rules.playerChartShift ?? 0);
    if (rules.meleeOnly && unit.melee === null) throw new RangeError('Enter a Melee value');
  }
  for (const unit of enemies) {
    if (config.enemyChart) unit.chart = config.enemyChart;
    if (!rules.playerOnly) personnelChart(unit.chart, rules.enemyChartShift ?? 0);
    if (setup.useScrambler && rules.scramblerOrdnance !== undefined) unit.ordnance = personnelInteger(rules.scramblerOrdnance);
    if (rules.supplyOrdnanceReduction !== undefined) personnelInteger(rules.supplyOrdnanceReduction);
    if (rules.meleeOnly && unit.melee === null) throw new RangeError('Melee is not applicable to this opponent');
  }
  if (rules.fixedAttack) {
    personnelInteger(rules.fixedAttack.strength); personnelChart(rules.fixedAttack.chart);
    if (setup.useScrambler && rules.scramblerStrength !== undefined) rules.fixedAttack.strength = personnelInteger(rules.scramblerStrength);
  }
  for (const field of ['roundLimit', 'freePlayerRounds', 'playerMoraleRound', 'meleeFromRound']) {
    if (rules[field] !== undefined) personnelInteger(rules[field], 1);
  }
  for (const name of Object.keys(charts)) personnelHits(charts, name, 1, 2);
  const fight = { personnelRulesVersion: 1, config, charts: personnelCopy(charts), player: force, enemies,
    startPlayer: personnelCopy(force), startEnemies: personnelCopy(enemies), setup: personnelCopy(setup),
    round: 0, enemyReplies: 0, waveCursor: 0, platformsDestroyed: 0, melee: Boolean(rules.meleeOnly),
    openingRemaining: 0, phase: 'ready', status: 'fighting', section: null,
    history: [{ round: 0, attacks: [], checks: [] }], pending: null, queue: [], roundOptions: {} };
  if (!personnelLiving(force).length || !rules.fixedAttack && !personnelLiving(enemies).length) throw new RangeError('A force has no surviving units');
  if (rules.fixedAttack?.dice) {
    personnelInteger(rules.fixedAttack.dice, 1, 2);
    fight.queue.push({ kind: 'strike-count', dice: rules.fixedAttack.dice, label: 'Number of incoming attacks' });
  } else if (rules.fixedAttack) fight.attackLimit = personnelInteger(rules.fixedAttack.count, 1);
  if (rules.openingAttacks) {
    personnelInteger(rules.openingAttacks.dice, 1, 2);
    fight.queue.push({ kind: 'opening-count', dice: rules.openingAttacks.dice, label: 'Number of opening attacks' });
  }
  personnelNext(fight);
  return fight;
}

export function beginPersonnelRound(previous, options = {}) {
  guard(previous);
  if (previous.phase !== 'ready') throw new RangeError('Resolve the pending combat roll first');
  const fight = personnelCopy(previous), rules = fight.config.rules;
  if (options.melee && !fight.melee) {
    if (!rules.meleeFromRound || fight.round + 1 < rules.meleeFromRound
        || [...fight.player, ...fight.enemies].some(unit => unit.count && unit.melee === null)) throw new RangeError('Close combat is unavailable');
    fight.melee = true;
  }
  if (options.charges && (!Array.isArray(options.charges) || new Set(options.charges).size !== options.charges.length
      || options.charges.some(key => !personnelLiving(fight.player).some(unit => unit.key === key)))) throw new RangeError('Invalid charge selection');
  if (personnelOutcome(fight)) return fight;
  fight.round++;
  fight.history.push({ round: fight.round, attacks: [], checks: [], melee: fight.melee });
  fight.history = fight.history.slice(-100);
  personnelQueueRound(fight, options);
  personnelNext(fight);
  return fight;
}

export function resolvePersonnelRoll(previous, total, roll) {
  guard(previous);
  if (previous.phase !== 'roll' || !previous.pending) throw new RangeError('No combat roll pending');
  const fight = personnelCopy(previous), task = fight.pending;
  const result = personnelDice(total, task.dice, roll);
  fight.pending = null;
  personnelResolveTask(fight, task, result);
  if (!personnelOutcome(fight)) personnelNext(fight);
  return fight;
}

export function canEscapePersonnelFight(fight) {
  return fight?.phase === 'ready' && personnelEscapeAllowed(fight);
}
export function escapePersonnelFight(previous) {
  guard(previous);
  if (!canEscapePersonnelFight(previous)) throw new RangeError('Withdrawal is unavailable at this point');
  const fight = personnelCopy(previous);
  if (fight.config.rules.escape?.test === 'free' || fight.config.rules.openingEscapeChoice) personnelFinish(fight, 'escaped');
  else {
    fight.queue = [{ kind: 'escape', dice: 2, label: 'Your force: withdrawal check' }];
    personnelNext(fight);
  }
  return fight;
}
export function cancelPersonnelFight(previous) {
  guard(previous);
  const fight = personnelCopy(previous);
  personnelFinish(fight, 'cancelled');
  return fight;
}

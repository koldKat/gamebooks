// Orchestrate one optional fleet battle without advancing campaign or story state.
import { fleetUnits, repairFleetDamage } from './fleet-force.js';
import { startFleetTactics, planFleetAttack } from './fleet-tactics.js';
import { startFleetExchange, resolveFleetExchangeLosses } from './fleet-exchange.js';
import { moveFreedFleetShips } from './fleet-sectors.js';
import { startFleetOpposition, fleetOppositionTotals, currentFleetPlayer, allFleetPlayers,
  currentFleetEnemies, commitFleetExchange, reinforceFleetOpposition, shipCount } from './fleet-opposition.js';
import { resolveFleetRetreat, rollFleetTest } from './fleet-retreat.js';
import { combatCommandHits } from './core.js';

const die = () => Math.floor(Math.random() * 6) + 1;
const integer = (value, min = 0, max = 1000000) => {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError('Invalid fleet battle value');
  return value;
};
const terminal = new Set(['victory', 'defeat', 'withdrawn', 'stopped', 'support-arrived', 'time-limit', 'unengaged-enemies']);
export const fleetBattlePlayers = fight => allFleetPlayers(fight);

function finish(fight, outcome) {
  fight.status = outcome;
  if (fight.opposition.kind === 'dispersed') {
    for (const sector of fight.opposition.state.sectors) sector.player = repairFleetDamage(sector.player);
  } else fight.player = repairFleetDamage(fight.player);
  fight.exchange = null;
  fight.history.push({ kind: 'outcome', outcome, round: fight.round });
  return fight;
}

function cloneActive(saved) {
  if (!saved || saved.rulesVersion !== 1 || terminal.has(saved.status)) throw new RangeError('No active fleet battle');
  return structuredClone(saved);
}

export function startFleetBattle(player, entry, charts, setup = {}, random = die) {
  const force = fleetUnits(player), config = structuredClone(entry);
  if (!shipCount(force)) throw new RangeError('Enter surviving ships');
  for (const key of ['enemyInitial', 'enemyPoolTotal', 'enemyOrdnance', 'enemyChart', 'enemySectors', 'enemyDivisions']) {
    if (setup[key] !== undefined) config[key] = structuredClone(setup[key]);
  }
  if (!config.enemies) integer(config.enemyOrdnance);
  if (!/^[A-G]$/.test(config.enemyChart ?? '')) throw new RangeError('Enter the enemy firing chart');
  const requiredCharts = [config.enemyChart, config.playerChart, ...Object.values(config.playerCharts ?? {}),
    config.specialAttack?.chart, ...(config.enemyChartOverrides ?? []).map(rule => rule.chart)].filter(Boolean);
  if (!config.playerChart && !Object.keys(config.playerCharts ?? {}).length) throw new RangeError('Choose a combat chart');
  for (const chart of new Set(requiredCharts)) combatCommandHits(charts, chart, 1, 2);
  if (config.playerAllowedTypes && force.some(unit => unit.count && !config.playerAllowedTypes.includes(unit.type))) {
    throw new RangeError('This encounter cannot use these ship types');
  }
  if (config.roundLimit !== undefined) integer(config.roundLimit, 1);
  const morale = integer(setup.morale ?? config.morale), stealth = integer(setup.stealth ?? config.stealth);
  const opposition = startFleetOpposition(force, config, setup, random);
  const initialEnemyShips = fleetOppositionTotals(opposition).remaining;
  if (!initialEnemyShips) throw new RangeError('Enter opposing ships');
  const fight = { rulesVersion: 1, config, charts: structuredClone(charts), player: opposition.kind === 'dispersed' ? null : force,
    opposition, tactics: startFleetTactics(force), morale, stealth, round: 0, status: 'fighting',
    initialPlayerShips: shipCount(force), initialEnemyShips,
    priorPlayerShipLosses: integer(setup.priorPlayerShipLosses ?? 0), priorEnemyShipLosses: integer(setup.priorEnemyShipLosses ?? 0),
    roundStart: { player: shipCount(force), enemy: initialEnemyShips }, atRoundBoundary: false,
    enemyStrengthOverride: setup.enemyStrengthOverride ?? null, exchange: null, history: [], lastEnemyFired: false };
  if (fight.enemyStrengthOverride !== null) integer(fight.enemyStrengthOverride);
  if (!fleetOppositionTotals(opposition).active) {
    fight.status = opposition.kind === 'divisions' ? 'awaiting-wave' : 'awaiting-reserves';
    fight.atRoundBoundary = true;
  }
  return fight;
}

function validateAction(action) {
  for (const key of ['enemyRoll', 'moraleRoll']) if (action[key] !== undefined) integer(action[key], 2, 12);
  if (action.blockRoll !== undefined) integer(action.blockRoll, 1, 6);
  if (action.playerRolls !== undefined) {
    if (!Array.isArray(action.playerRolls) || action.playerRolls.length !== (action.special ? 2 : 1)) {
      throw new RangeError('Enter every player volley roll');
    }
    action.playerRolls.forEach(total => integer(total, 2, 12));
  }
  if (action.reinforcementDice !== undefined) {
    if (!Array.isArray(action.reinforcementDice) || action.reinforcementDice.length > 2) throw new RangeError('Invalid reinforcement dice');
    action.reinforcementDice.forEach(value => integer(value, 1, 6));
  }
}

function reinforcementDice(fight, action, random) {
  const rule = fight.config.reinforcement, pool = fight.opposition.state;
  if (fight.opposition.kind !== 'pool' || !rule || !pool.reserve
      || rule.mode === 'cumulative-casualty-check-once' && pool.reinforcementArrived) return [];
  const count = rule.dice ?? 0;
  if (action.reinforcementDice !== undefined) {
    if (action.reinforcementDice.length !== count) throw new RangeError('Enter the required reinforcement dice');
    return [...action.reinforcementDice];
  }
  return Array.from({ length: count }, () => integer(random(6), 1, 6));
}

function roundResult(fight, action, random, desiredStatus) {
  if (!shipCount(allFleetPlayers(fight))) return finish(fight, 'defeat');
  const reinforcement = reinforceFleetOpposition(fight, reinforcementDice(fight, action, random));
  if (reinforcement) fight.history.push({ kind: 'reinforcement', round: fight.round, ...reinforcement });
  const enemy = fleetOppositionTotals(fight.opposition);
  if (fight.config.roundLimit && fight.round >= fight.config.roundLimit) {
    if (fight.config.limitCondition === 'unengaged-enemy-sectors-remain') {
      if (enemy.unengaged) return finish(fight, 'unengaged-enemies');
    } else if (fight.config.victoryRequires === 'before-round-limit') return finish(fight, 'time-limit');
    else if (enemy.remaining) return finish(fight, fight.config.limitOutcome ?? 'time-limit');
  }
  if (!enemy.remaining) return finish(fight, 'victory');
  if (fight.opposition.kind === 'sectors' && !enemy.active && !fight.config.canEngageAnotherSector) {
    return finish(fight, 'unengaged-enemies');
  }
  fight.status = desiredStatus ?? (enemy.active ? 'fighting'
    : fight.opposition.kind === 'divisions' ? 'awaiting-wave'
      : fight.opposition.kind === 'sectors' ? 'awaiting-sector' : 'awaiting-reserves');
  const rule = fight.config.retreat;
  if (rule?.kind === 'voluntary-or-forced') {
    const currentPlayer = shipCount(allFleetPlayers(fight));
    const cumulative = rule.forcedWhen === 'total-player-ship-losses-exceed-total-enemy-ship-losses';
    const playerLoss = cumulative ? fight.initialPlayerShips - currentPlayer + fight.priorPlayerShipLosses
      : fight.roundStart.player - currentPlayer;
    const enemyLoss = cumulative ? fight.initialEnemyShips - enemy.remaining + fight.priorEnemyShipLosses
      : fight.roundStart.enemy - enemy.remaining;
    if (playerLoss > enemyLoss) {
      const result = rollFleetTest(fight.morale, action.moraleRoll, random);
      fight.history.push({ kind: 'combat-morale', round: fight.round, playerLoss, enemyLoss, ...result });
      if (!result.passed) { fight.resumeStatus = fight.status; fight.status = 'retreat-required'; }
    }
  }
  return fight;
}

function commit(fight, action, random) {
  const exchange = fight.exchange;
  if (exchange.status !== 'resolved') { fight.status = exchange.status; return fight; }
  const sectorId = fight.opposition.kind === 'dispersed'
    ? fight.opposition.state.sectors[fight.opposition.state.cursor].id : null;
  const result = commitFleetExchange(fight, exchange);
  fight.tactics = exchange.plan.nextPhase;
  fight.lastEnemyFired = exchange.history.some(event => event.side === 'enemy');
  fight.history.push({ kind: 'exchange', round: fight.round + 1, sector: sectorId, events: exchange.history });
  fight.exchange = null; fight.roundAction = null;
  if (result.roundCompleted) fight.round++;
  fight.atRoundBoundary = result.roundCompleted;
  let desired;
  if (fight.opposition.kind === 'dispersed') {
    desired = !result.ongoing ? 'blocked-sectors' : result.clearedSector ? 'awaiting-redistribution' : 'fighting';
    fight.freedSector = result.clearedSector;
    if (!shipCount(allFleetPlayers(fight))) return finish(fight, 'defeat');
    if (!fleetOppositionTotals(fight.opposition).remaining) return finish(fight, 'victory');
  }
  if (result.roundCompleted) return roundResult(fight, action, random, desired);
  fight.status = desired ?? 'fighting';
  return fight;
}

export function fleetBattleRound(saved, action = {}, random = die) {
  const fight = cloneActive(saved);
  if (fight.status !== 'fighting') throw new RangeError('Resolve the pending battle action first');
  validateAction(action);
  // Validate the expected end-round manual dice before consuming any attack or duration dice.
  if (action.reinforcementDice !== undefined) reinforcementDice(fight, action, random);
  if (fight.atRoundBoundary) {
    fight.roundStart = { player: shipCount(allFleetPlayers(fight)), enemy: fleetOppositionTotals(fight.opposition).remaining };
  }
  const force = currentFleetPlayer(fight);
  let blockRoll = action.blockRoll;
  if (fight.config.firingOrder === 'battlecruiser-first-d6-blocks' && !fight.tactics.coneLeft
      && ['battlecruiser', 'destroyer'].every(type => force.some(unit => unit.type === type && unit.count))
      && blockRoll === undefined) blockRoll = integer(random(6), 1, 6);
  const plan = planFleetAttack(force, fight.config, fight.tactics, { ...action, blockRoll });
  const enemies = currentFleetEnemies(fight);
  const overrides = (fight.config.enemyChartOverrides ?? []).filter(rule => enemies.some(unit => unit.key === rule.division))
    .map(rule => ({ key: rule.division, chart: rule.chart }));
  fight.atRoundBoundary = false;
  fight.roundAction = structuredClone(action);
  fight.exchange = startFleetExchange(force, enemies, fight.charts, plan, { enemyChart: fight.config.enemyChart,
    enemyChartOverrides: overrides, enemyStrengthOverride: fight.enemyStrengthOverride,
    playerRolls: action.playerRolls, enemyRoll: action.enemyRoll }, random);
  return commit(fight, action, random);
}

export function resolveFleetBattleLosses(saved, allocation, random = die) {
  const fight = cloneActive(saved);
  if (!['awaiting-enemy-losses', 'awaiting-player-losses'].includes(fight.status)) throw new RangeError('No fleet allocation is pending');
  fight.exchange = resolveFleetExchangeLosses(fight.exchange, allocation, random);
  return commit(fight, fight.roundAction, random);
}

export function chooseFleetBattleSector(saved, sector) {
  const fight = cloneActive(saved);
  if (fight.status !== 'awaiting-sector' || fight.opposition.kind !== 'sectors') throw new RangeError('No sector choice is pending');
  const index = integer(sector, 1) - 1;
  if (index >= fight.opposition.state.counts.length || !fight.opposition.state.counts[index]) throw new RangeError('Choose a nonempty sector');
  fight.opposition.state.current = index;
  fight.tactics = startFleetTactics(fight.player, fight.tactics);
  fight.status = 'fighting';
  return fight;
}

export function redistributeFleetBattle(saved, allocation, woundedDestination, fromId) {
  const fight = cloneActive(saved);
  if (!['fighting', 'awaiting-redistribution'].includes(fight.status) || fight.opposition.kind !== 'dispersed') {
    throw new RangeError('No sector redistribution is available');
  }
  const source = fromId ?? fight.freedSector;
  if (allocation !== undefined) fight.opposition.state = moveFreedFleetShips(fight.opposition.state, source, allocation, woundedDestination);
  fight.freedSector = null; fight.status = 'fighting';
  return fight;
}

export function waitFleetBattle(saved, action = {}, random = die) {
  const fight = cloneActive(saved);
  if (!['awaiting-wave', 'awaiting-reserves', 'blocked-sectors'].includes(fight.status)) throw new RangeError('No combat wait is available');
  validateAction(action);
  if (fight.status === 'awaiting-wave') {
    const rounds = fight.opposition.state.divisions.filter(division => !division.arrived && division.count).map(division => division.arrivalRound);
    if (!rounds.length) throw new RangeError('No further divisions are due');
    fight.round = Math.min(...rounds);
  } else if (fight.status === 'blocked-sectors') {
    if (!fight.config.roundLimit) throw new RangeError('No sector round limit is defined');
    fight.round = Math.max(fight.round, fight.config.roundLimit);
  } else fight.round++;
  fight.atRoundBoundary = true;
  fight.roundStart = { player: shipCount(allFleetPlayers(fight)), enemy: fleetOppositionTotals(fight.opposition).remaining };
  fight.history.push({ kind: 'wait', round: fight.round });
  return roundResult(fight, action, random, fight.status === 'blocked-sectors' ? 'blocked-sectors' : undefined);
}

export function retreatFleetBattle(saved, options = {}, random = die) {
  const fight = cloneActive(saved), forced = fight.status === 'retreat-required';
  if (!forced && (!fight.atRoundBoundary || !['fighting', 'awaiting-wave', 'awaiting-sector', 'awaiting-reserves', 'blocked-sectors', 'awaiting-redistribution'].includes(fight.status))) {
    throw new RangeError('Retreat is available only at the end of a round');
  }
  const result = resolveFleetRetreat(fight.config, fight, { ...options, forced }, random);
  fight.history.push({ kind: 'retreat', round: fight.round, ...result });
  if (result.outcome) return finish(fight, result.outcome);
  if (forced) { fight.status = fight.resumeStatus; delete fight.resumeStatus; }
  return fight;
}

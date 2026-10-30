// Resolve one player-first fleet exchange, persisting rolls while hit allocation is pending.
import { combatCommandHits } from './core.js';
import { fleetUnits, fleetStrength, fleetHitCapacity, applyFleetHits } from './fleet-force.js';

const die = () => Math.floor(Math.random() * 6) + 1;
const integer = (value, min, max) => {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError('Invalid combat roll or value');
  return value;
};
const alive = force => force.some(unit => unit.count > 0);

function roll(total, random) {
  if (total !== undefined) return { total: integer(total, 2, 12), dice: null, manual: true };
  const dice = [integer(random(6), 1, 6), integer(random(6), 1, 6)];
  return { total: dice[0] + dice[1], dice, manual: false };
}

function enemyChart(state) {
  const overrides = state.enemyChartOverrides.filter(rule => state.enemy.some(unit => unit.key === rule.key && unit.count));
  if (new Set(overrides.map(rule => rule.chart)).size > 1) throw new RangeError('Conflicting enemy combat charts');
  return overrides[0]?.chart ?? state.enemyChart;
}

function prepareVolley(state, random) {
  const player = state.stage === 'player';
  if (!player && !alive(state.enemy)) {
    state.stage = 'complete';
    return;
  }
  const force = player ? state.player : state.enemy;
  const keys = player ? state.plan.keys : force.map(unit => unit.key);
  const strength = !player && state.enemyStrengthOverride !== null
    ? state.enemyStrengthOverride : fleetStrength(force, keys);
  const chart = player ? state.plan.chart : enemyChart(state);
  const rolled = roll(player ? state.playerRolls?.[state.volleyIndex] : state.enemyRoll, random);
  const hits = combatCommandHits(state.charts, chart, strength, rolled.total);
  state.current = { side: player ? 'player' : 'enemy', volley: player ? state.volleyIndex + 1 : 1,
    strength, chart, roll: rolled, hits, remainingHits: hits, hitsApplied: 0, losses: [], lossStage: 0 };
}

function advance(state, allocation, random) {
  state.status = 'resolving';
  while (state.stage !== 'complete') {
    if (!state.current) prepareVolley(state, random);
    if (state.stage === 'complete') break;
    const current = state.current, playerAttack = current.side === 'player';
    const force = playerAttack ? state.enemy : state.player;
    const stages = playerAttack ? [force.map(unit => unit.key)]
      : [state.plan.casualtyKeys, state.plan.fallbackCasualtyKeys ?? []].filter(keys => keys.length);
    const keys = stages[current.lossStage];
    if (!keys) throw new RangeError('Missing casualty targets');
    const required = Math.min(current.remainingHits, fleetHitCapacity(force, keys));
    const candidates = force.filter(unit => keys.includes(unit.key) && unit.count);
    if (allocation === undefined && required > 0 && candidates.length > 1
        && required < fleetHitCapacity(force, keys)) {
      state.status = playerAttack ? 'awaiting-enemy-losses' : 'awaiting-player-losses';
      state.pending = { side: playerAttack ? 'enemy' : 'player', hits: required, keys: candidates.map(unit => unit.key) };
      return state;
    }
    const result = applyFleetHits(force, current.remainingHits, { keys, allocation });
    allocation = undefined;
    if (playerAttack) state.enemy = result.force;
    else state.player = result.force;
    current.remainingHits = result.hitsUnused;
    current.hitsApplied += result.hitsApplied;
    current.losses.push(...result.losses);
    if (current.remainingHits && current.lossStage + 1 < stages.length) {
      current.lossStage++;
      continue;
    }
    state.history.push({ side: current.side, volley: current.volley, chart: current.chart,
      strength: current.strength, roll: current.roll, hits: current.hits, hitsApplied: current.hitsApplied,
      unusedHits: current.remainingHits, losses: current.losses,
      shipsLost: current.losses.reduce((sum, loss) => sum + loss.count, 0) });
    if (playerAttack) {
      state.volleyIndex++;
      if (state.volleyIndex === state.plan.volleys) state.stage = 'enemy';
    } else state.stage = 'complete';
    state.current = null;
  }
  state.status = 'resolved';
  delete state.pending;
  return state;
}

export function startFleetExchange(player, enemy, charts, plan, {
  enemyChart: baseEnemyChart, enemyChartOverrides = [], enemyStrengthOverride = null,
  playerRolls, enemyRoll,
} = {}, random = die) {
  const allies = fleetUnits(player), foes = fleetUnits(enemy);
  if (!alive(allies) || !alive(foes)) throw new RangeError('Both forces must be engaged');
  if (!plan || !Array.isArray(plan.keys) || !plan.keys.length
      || !Array.isArray(plan.casualtyKeys) || !plan.casualtyKeys.length) throw new RangeError('Invalid firing plan');
  integer(plan.volleys, 1, 2);
  fleetStrength(allies, plan.keys);
  fleetHitCapacity(allies, plan.casualtyKeys);
  if (plan.fallbackCasualtyKeys) fleetHitCapacity(allies, plan.fallbackCasualtyKeys);
  combatCommandHits(charts, plan.chart, 1, 2);
  combatCommandHits(charts, baseEnemyChart, 1, 2);
  if (!Array.isArray(enemyChartOverrides) || enemyChartOverrides.some(rule => !foes.some(unit => unit.key === rule.key))) {
    throw new RangeError('Invalid enemy chart override');
  }
  for (const rule of enemyChartOverrides) combatCommandHits(charts, rule.chart, 1, 2);
  if (enemyStrengthOverride !== null) integer(enemyStrengthOverride, 0, 1000000);
  if (playerRolls !== undefined) {
    if (!Array.isArray(playerRolls) || playerRolls.length !== plan.volleys) throw new RangeError('Enter each player volley roll');
    playerRolls.forEach(total => integer(total, 2, 12));
  }
  if (enemyRoll !== undefined) integer(enemyRoll, 2, 12);
  return advance({ rulesVersion: 1, player: allies, enemy: foes, charts: structuredClone(charts),
    plan: structuredClone(plan), enemyChart: baseEnemyChart, enemyChartOverrides: structuredClone(enemyChartOverrides),
    enemyStrengthOverride, playerRolls: playerRolls && [...playerRolls], enemyRoll,
    stage: 'player', volleyIndex: 0, current: null, history: [], status: 'resolving' }, undefined, random);
}

export function resolveFleetExchangeLosses(saved, allocation, random = die) {
  if (!saved || saved.rulesVersion !== 1 || !['awaiting-enemy-losses', 'awaiting-player-losses'].includes(saved.status)
      || !saved.current || !saved.pending) throw new RangeError('No fleet hit allocation is pending');
  return advance(structuredClone(saved), allocation, random);
}

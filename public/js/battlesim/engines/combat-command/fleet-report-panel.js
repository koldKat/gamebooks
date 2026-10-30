// Render saved fleet combat strengths, dice, casualties and encounter history.
import { fleetOppositionTotals, allFleetPlayers, currentFleetEnemies } from './fleet-opposition.js';
import { escapeFleet } from './fleet-form.js';

const describe = event => {
  if (event.kind === 'exchange') return `Round ${event.round}${event.sector ? `, sector ${event.sector}` : ''}: `
    + event.events.map(shot => `${shot.side === 'player' ? 'You' : 'Enemy'}: strength ${shot.strength}, chart ${shot.chart}, roll ${shot.roll?.total ?? shot.roll ?? '—'}, ${shot.hits} hits`
      + (shot.losses?.length ? ` (${shot.losses.map(loss => `${loss.count ?? loss.shipsLost ?? 0} ${loss.name ?? loss.key}`).join(', ')})` : '')).join('; ');
  if (event.kind === 'reinforcement') return `After round ${event.round}: `
    + (Array.isArray(event.arrived) ? event.arrived.map(group => `division ${group.id}: ${group.count} ships arrived`).join('; ') || 'no divisions arrived'
      : `${event.arrived ?? 0} enemy ships arrived${event.checked ? `, check dice ${(event.dice ?? []).join(' + ')}` : ''}`);
  if (event.kind === 'combat-morale') return `Round ${event.round}: Morale ${event.total} — ${event.passed ? 'passed' : 'failed'}, your ship losses ${event.playerLoss}, enemy losses ${event.enemyLoss}`;
  if (event.kind === 'retreat') return `Round ${event.round}: ${event.outcome ?? (event.gateFailed ? 'Morale prevents voluntary retreat' : 'withdrawal failed')}`
    + (event.tests ?? []).map(test => `; ${test.kind ?? test.type ?? 'test'} ${test.total}: ${test.passed ? 'passed' : 'failed'}`).join('');
  if (event.kind === 'wait') return `Waited to combat round ${event.round}`;
  return `Round ${event.round}: ${String(event.outcome ?? event.kind).replaceAll('-', ' ')}`;
};

export function renderFleetReport({ result, forces, log, history }, state) {
  const fight = state.fight;
  result.textContent = fight ? `${fight.status.replaceAll('-', ' ')} · Round ${fight.round}` : 'Ready';
  if (fight) {
    const totals = fleetOppositionTotals(fight.opposition);
    const current = fight.opposition.kind === 'dispersed'
      ? fight.opposition.state.sectors[fight.opposition.state.cursor]?.id : null;
    const players = fight.opposition.kind === 'dispersed'
      ? fight.opposition.state.sectors.flatMap(sector => sector.player.map(unit => ({ ...unit, name: `Sector ${sector.id}: ${unit.name}` })))
      : allFleetPlayers(fight);
    const enemies = fight.opposition.kind === 'dispersed'
      ? fight.opposition.state.sectors.map(sector => ({ name: `Enemy sector ${sector.id}`, count: sector.enemy, damage: 0 }))
      : fight.opposition.kind === 'sectors'
        ? fight.opposition.state.counts.map((count, index) => ({ name: `Enemy sector ${index + 1}`, count, damage: 0 }))
        : currentFleetEnemies(fight);
    forces.innerHTML = `<p>${current ? `Current sector ${escapeFleet(current)}. ` : ''}Enemy ships: ${totals.active} engaged, ${totals.reserve} in reserve, ${totals.destroyed} destroyed.</p>`
      + '<table class="bsim-report-table"><thead><tr><th>Ships</th><th>Surviving</th><th>Damage</th></tr></thead><tbody>'
      + [...players, ...enemies].map(unit => `<tr><td>${escapeFleet(unit.name)}</td><td>${unit.count}</td><td>${unit.damage ?? 0}</td></tr>`).join('') + '</tbody></table>';
    const events = [...fight.history];
    if (fight.exchange?.history.length) events.push({ kind: 'exchange', round: fight.round + 1, sector: current,
      events: fight.exchange.history });
    log.innerHTML = events.slice(-100).reverse().map(event => `<p>${escapeFleet(describe(event))}</p>`).join('');
  } else { forces.replaceChildren(); log.replaceChildren(); }
  history.innerHTML = state.history.slice(-30).reverse().map(event => `<p>${escapeFleet(event.enemy)} · ${escapeFleet(event.result ?? event.outcome)}</p>`).join('');
}

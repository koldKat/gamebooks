// Render the current combat result, original page draw and encounter history.
import {vitalityNames, blackSunCombatValues, blackSunEnemyValues} from './combat.js';

export function renderBlackSunReport(document, root, state) {
  root.replaceChildren();
  const text = (value, parent = root) => {const node = document.createElement('p'); node.textContent = value; parent.append(node); return node;};
  const report = document.createElement('div'); report.className = 'bsim-report'; report.setAttribute('role', 'status'); root.append(report);
  const f = state.fight;
  if (!f) text('Enter your current combat values and choose an opponent.', report);
  else {
    const player = blackSunCombatValues(f), enemy = blackSunEnemyValues(f);
    text(`${f.encounter.label || 'Custom encounter'} · Round ${f.round} · ${f.status}`, report);
    text(`Vitality: ${vitalityNames[f.player.vitality] || 'dead'} · Karma: ${f.player.karma}`, report);
    text(`Attack ${player.attack} · Defense ${player.defense}`, report);
    text(`Enemy Attack ${f.encounter.separatePartAttacks ? 'by limb' : enemy.attack} · Defense ${enemy.defense ?? '-'}`, report);
    for (const unit of f.opponents) text(`${unit.name || 'Opponent'}: ${unit.resistance == null ? 'no printed resistance' : unit.resistance + ' resistance'}${unit.attack != null ? ' · Attack ' + unit.attack : ''}`, report);
    if (f.ally) text(`${f.ally.name}: ${f.ally.vitality} vitality`, report);
    if (f.pending) text(f.pending.text || `Read section ${f.pending.section}, then apply its combat instructions.`, report);
    if (f.lastSpecialAttack) {
      const special = f.lastSpecialAttack;
      text(`Special attack ${special.section}${special.total == null ? '' : ': test ' + special.total + (special.success ? ', passed' : ', failed')}.`, report);
    }
    if (f.continuation) text(`Continue reading at ${f.continuation}.`, report);
    if (f.availableEscapes?.length) text(`An escape attempt is available. Read ${f.availableEscapes.join(' or ')} for the choices.`, report);
  }
  if (state.page && f?.status === 'fighting') text(`Page ${state.page.sourcePdfPage}: Attack die ${state.page.attack} · Base die ${state.page.base} · Defense die ${state.page.defense} · ${state.page.moon} moon`, report);
  if (state.recoveryPage) text(`Printed combat result: ${state.recoveryPage.moon} moon.`, report);
  const log = document.createElement('div'); log.className = 'bsim-log'; root.append(log);
  for (const round of [...(f?.log ?? [])].reverse()) text(`Round ${round.round}: Attack ${round.attackTotal}, Defense ${round.defenseTotal}; resistance lost ${round.enemyLoss ?? 0}, vitality lost ${round.playerLoss}.`, log);
  const history = document.createElement('div'); history.className = 'bsim-history-list'; root.append(history);
  for (const entry of [...state.history].reverse()) text(`${entry.enemy}: ${entry.outcome} (${entry.rounds} rounds)`, history);
}

// Display Sagard hit points, combat events and history without adding action controls.
import {sagardEncounterActors} from './turn-panel.js';
import {renderSagardSpecialSummary, sagardSpecialEventText} from './special-report.js';
export function renderSagardReport(document, root, state) {
  root.replaceChildren();
  const text = (parent, value) => {const p = document.createElement('p'); p.textContent = value; parent.append(p);};
  const report = document.createElement('div'); report.className = 'bsim-report'; report.setAttribute('role', 'status'); root.append(report);
  const fight = state.fight;
  if (!fight) text(report, 'Enter your current combat values and choose an opponent.');
  else {
    const names = new Map(sagardEncounterActors(fight).map(row => [row.id, row.name]));
    text(report, `${fight.encounter.name || 'Custom encounter'} · Round ${fight.round} · ${fight.status}`);
    const special = renderSagardSpecialSummary(fight, report, text);
    for (const actor of special ? [] : [fight.hero, ...fight.allies, ...fight.opponents]) {
      text(report, `${actor.name}: ${actor.level == null ? 'Level not printed' : `Level ${actor.level}`} · ${actor.immortal
        ? fight.strategy ? 'HP not printed for this strategy' : 'Cannot be defeated' : `${actor.hp}/${actor.maxHp} HP`}${actor.hp === 0 ? ' · Defeated' : ''}`
        + ((actor.joinsRound ?? 1) > fight.round ? ` · May join in round ${actor.joinsRound}` : ''));
    }
    if (!special) text(report, `Shield: ${fight.hero.shield} points remaining`);
    for (const item of fight.rules?.projectiles ?? []) text(report, `${item.label}: ${fight.ammo[item.id]} remaining`);
    if (fight.destination) text(report, `Continue reading at section ${fight.destination}.`);
    const log = document.createElement('div'); log.className = 'bsim-log'; root.append(log);
    for (const event of fight.log.slice(-200).reverse()) {
      const specialText = sagardSpecialEventText(event);
      if (specialText) text(log, specialText);
      else if (event.kind === 'strategy') text(log, event.mode === 'normal' ? 'Switched to fighting the demon.' : 'Switched to breaking the pendant.');
      else if (event.kind === 'pendantAttempt') text(log, `${names.get(event.attacker)}: roll ${event.die}; roll again to confirm.`);
      else if (event.kind === 'pendantBroken') text(log, `${names.get(event.attacker)}: confirmation ${event.die}; the pendant breaks.`);
      else if (event.kind === 'pendantMiss') text(log, `${names.get(event.attacker)}: ${event.confirmation ? 'confirmation ' : ''}roll ${event.die}; the pendant remains intact.`);
      else if (event.kind === 'pendantAbandoned') text(log, `${names.get(event.attacker)} abandoned the pendant attempt.`);
      else if (['attack', 'escapeVolley'].includes(event.kind)) text(log, `${names.get(event.attacker)} → ${names.get(event.target)}: roll ${event.die}, ${event.damage} damage${event.shieldUsed ? `, shield absorbed ${event.shieldUsed}` : ''}.`
        + (event.victims.length > 1 ? ` ${event.victims.filter(row => row.damage).length} foes struck.` : ''));
      else if (event.kind === 'melt') text(log, `${names.get(event.actor)} loses ${event.damage} HP before attacking.`);
      else if (event.kind === 'flee') text(log, event.die == null ? 'Left combat by abandoning story valuables.'
        : `${fight.encounter.escape === 'jump' ? 'Jump' : 'Escape'} roll ${event.die}: ${event.success ? 'succeeded' : 'failed'}.`);
      else if (event.kind === 'initiative') text(log, `Initiative roll ${event.die}: ${event.opponentFirst ? 'opponent' : 'Sagard'} attacks first.`);
      else if (event.kind === 'heal') text(log, `${fight.rules.healingLabels?.[event.item] ?? event.item}: restored ${event.restored} HP.`);
      else if (event.kind === 'breakOff') text(log, event.decision === 'leave' ? 'Broke off the fight.' : 'Continued the fight.');
      else if (event.kind === 'cancel') text(log, 'Encounter cancelled.');
      else if (event.kind === 'retrieve') text(log, `Map retrieval roll ${event.die}: ${event.success ? 'recovered the map' : 'not recovered'}.`);
      else if (event.kind === 'beginMelee') text(log, 'Began melee.');
      else if (event.kind === 'declineRecovery') text(log, 'Accepted defeat.');
      else if (event.kind === 'surrender') text(log, 'Offered story valuables. Read the next section and carry remaining combat values forward.');
      else if (event.kind === 'projectile') {
        const label = fight.rules.projectiles.find(item => item.id === event.item)?.label ?? event.item;
        text(log, `${label} → ${names.get(event.target)}${event.die == null ? '' : `: roll ${event.die}`}: ${event.success
          ? event.knockout ? 'out of combat' : `${event.damage} damage` : 'missed or ineffective'}.`);
      }
    }
  }
  const history = document.createElement('details'); history.className = 'bsim-history';
  const heading = document.createElement('summary'); heading.textContent = 'Combat history'; history.append(heading);
  const list = document.createElement('div'); list.className = 'bsim-history-list'; history.append(list); root.append(history);
  for (const entry of state.history.slice(-100).reverse()) text(list, `${entry.enemy}: ${entry.outcome}`);
}

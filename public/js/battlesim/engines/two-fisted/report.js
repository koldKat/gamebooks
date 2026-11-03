// Display Two-Fisted combat statistics, dice, local instructions and outcome history.
export function renderTwoFistedReport(document, root, state) {
  root.replaceChildren();
  const text = (parent, value) => {const node = document.createElement('p'); node.textContent = value; parent.append(node);};
  const report = document.createElement('div'); report.className = 'bsim-report'; report.setAttribute('role', 'status'); root.append(report);
  const fight = state.fight, player = fight?.fireFight?.player ?? (fight && ['fighting', 'firefighting'].includes(fight.status) ? fight.player : state.player);
  if (!fight) text(report, 'Enter your current combat values and choose an opponent.');
  else text(report, `${fight.encounter.label || 'Custom encounter'} · ${fight.mode} · Round ${fight.round} · ${fight.status}`);
  if (player) {
    text(report, `EXPERTISE ${player.expertise} · ENERGY ${player.energy} · FISTS ${player.fists} · Injuries ${player.injuries}${player.dead ? ' · Dead' : ''}`);
    if (player.copilot) {const crew = player.copilot; text(report, `${crew.name || 'Co-pilot'}: Combat ${crew.combat} · Weapons ${crew.weapons ?? 0} · Manoeuvre ${crew.manoeuvre ?? 0} · Shields ${crew.shields ?? 0} · Injuries ${crew.injuries ?? 0}${crew.dead ? ' · Dead' : ''}`);}
    if (player.ship) text(report, `HULL ${player.ship.hull} · POWER ${player.ship.power} · Shields ${player.ship.shieldsDestroyed ? 'destroyed' : player.ship.shieldsDown ? 'recharging' : 'ready'}`);
    if (player.trobble) text(report, `Trobble: ${player.trobble.discarded ? 'discarded' : player.trobble.inactive ? 'out of this fight' : 'ready'}`);
    if (player.goldenEnergyJitters) text(report, 'Golden Energy: remember that the next jump restores no ENERGY.');
    if (player.temporaryExpertiseLoss) text(report, `Mangefizz: ${player.temporaryExpertiseLoss} temporary EXPERTISE loss. Restore it manually on the next Stellar Day.`);
  }
  if (fight) {
    for (const enemy of fight.opponents) text(report, `${enemy.name || 'Opponent'}: ${fight.mode === 'space' ? 'HULL ' + enemy.hull : 'Health ' + enemy.health}`);
    if (fight.fireFight) for (const fire of fight.fireFight.opponents) text(report, `Cockpit fire: ${fire.health} health`);
    if (fight.status === 'ended' && fight.encounter.roundLimitTarget) text(report, `Read section ${fight.encounter.roundLimitTarget} for the printed interruption.`);
    const exit = fight.log.findLast(event => ['surrender', 'escape'].includes(event.type));
    if (exit) text(report, `Continue reading at ${exit.section}.`);
  }
  const log = document.createElement('div'); log.className = 'bsim-log'; root.append(log);
  const labels = {injury: 'injury', 'injury-blocked': 'injury blocked', 'trauma-kit': 'Trauma Kit activated', 'lethal-hit': 'lethal hit'};
  for (const event of [...(fight?.log ?? []), ...(fight?.fireFight?.log ?? [])].reverse()) {
    let message;
    if (event.type === 'exchange') message = `${event.who}: ${event.allyTotal} (${event.alliedDice.dice.join(', ') || 'no dice'}) vs ${event.enemyTotal} (${event.enemyDice.dice.join(', ') || 'no dice'}).${event.outgoing ? ' Opponent hit.' : ''}${event.incoming ? ' Incoming hit.' : ''}${event.automatic ? ' Automatic win.' : ''}`;
    else if (event.type === 'round-start') message = event.powerSpent != null ? `${event.powerSpent} POWER spent.` : `${event.spend} ENERGY spent.`;
    else if (event.type === 'station-rolls') message = `Weapons dice ${event.player.weapons.dice.join(', ') || 'none'}; manoeuvre dice ${event.player.manoeuvre.dice.join(', ') || 'none'}.`;
    else if (event.type === 'item') message = `Used ${event.id.replaceAll('-', ' ')}.`;
    else if (event.type === 'trobble-injury') message = `Trobble injured: die ${event.die}, ${event.discarded ? 'discarded' : 'retained'}.`;
    else if (labels[event.type]) message = `${event.who}: ${labels[event.type]}.`;
    else message = event.type.replaceAll('-', ' ') + (event.die != null ? ': die ' + event.die : '') + (event.damage != null ? ', damage ' + event.damage : '');
    text(log, `Round ${event.round}: ${message}`);
  }
  const history = document.createElement('div'); history.className = 'bsim-history-list'; root.append(history);
  for (const entry of [...state.history].reverse()) text(history, `${entry.enemy}: ${entry.outcome} (${entry.rounds} rounds)`);
}

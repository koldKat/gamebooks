// Render Real Life combat results and saved history without adding combat controls.
export function renderRealLifeReport(document, root, state) {
  root.replaceChildren();
  const text = (parent, value) => {const node = document.createElement('p'); node.textContent = value; parent.append(node);};
  const report = document.createElement('div'); report.className = 'bsim-report'; report.setAttribute('role', 'status'); root.append(report);
  const fight = state.fight;
  if (!fight) text(report, 'Enter your current combat values and choose an opponent.');
  else {
    text(report, `${fight.encounter.name || 'Custom encounter'} · Round ${fight.round + 1} · ${fight.status}`);
    text(report, `Your Wounds: ${fight.hero.wounds}${fight.encounter.mountedCombat ? (fight.hero.mounted ? ' · Mounted' : ' · On foot') : ''}`);
    for (const actor of [...fight.opponents, ...fight.allies]) text(report,
      `${actor.name}: ${actor.noWoundsPrinted ? 'Strength ' + actor.skill : 'Wounds ' + actor.wounds}${actor.outOfFight
        ? actor.exitReason === 'fled' ? ' · Fled' : ' · Out of this fight' : ''}${fight.encounter.mountedCombat ? (actor.mounted ? ' · Mounted' : ' · On foot') : ''}`);
    if (fight.reason === 'unconscious') text(report, 'You have been knocked unconscious.');
    if (fight.reason === 'knife-possession') text(report, `${fight.status === 'win' ? 'You have' : 'Your opponent has'} the knife.`);
    if (fight.reason === 'first-blood') text(report, 'The duel ends at first blood.');
    if (fight.reason === 'grapple') text(report, `The wrestling bout stops at ${fight.encounter.stopAtWounds} Wounds.`);
    if (fight.destination) text(report, `Continue reading at section ${fight.destination}.`);
  }
  const log = document.createElement('div'); log.className = 'bsim-log'; root.append(log);
  for (const event of [...(fight?.log ?? [])].reverse()) {
    if (event.type === 'attack' || event.type === 'opening') text(log,
      `${event.actor} → ${event.target}: ${event.dice.join(' + ')}${event.penalty ? ' + ' + event.penalty : ''} against ${event.skill}. `
      + (event.removed ? 'Target out of this fight.' : event.critical ? 'Double one: fatal hit.' : event.success ? `${event.lost} Wound${event.lost === 1 ? '' : 's'}.` : 'Miss.')
      + (event.fled ? ' Opponent flees.' : '')
      + (event.defensive ? ' Defensive attack.' : '') + (event.attackBoth ? ' Both foes attacked.' : ''));
    else if (event.type === 'opening-agility') text(log, `Agility: ${event.dice.join(' + ')}. ${event.success ? 'You may fire once before melee.' : 'No opening shot; draw your sword.'}`);
    else if (event.type === 'avoid-pistol') text(log, `Agility: ${event.dice.join(' + ')}. ${event.success ? 'Pistol shot avoided.' : 'The pistol shot defeats you.'}`);
    else if (event.type === 'knife-possession') text(log, `${event.actor}: ${event.dice.join(' + ')} against Strength ${event.skill}, strictly under. ${event.success ? 'Takes the knife.' : 'The struggle continues.'}`);
    else if (event.type === 'initiative') text(log, `Agility: ${event.dice.join(' + ')}. ${event.success ? 'You attack first.' : 'Your opponent attacks first.'}`);
    else if (event.type === 'charge') text(log, `Mounted charge: ${event.dice.join(' + ')}. ${event.success ? 'Chosen opponent knocked out of this fight.' : 'Fight both opponents.'}`);
    else if (event.type === 'round-horsemanship') text(log, `Horsemanship: ${event.dice.join(' + ')}. `
      + (fight.encounter.horseRule === 'hero-after-round-bonus' ? (event.success ? 'Mounted skill bonus applies.' : 'Use normal skill this round.')
        : event.success ? 'Remain mounted this round.' : 'Lose this attack and continue on foot; mounted enemies gain one skill.'));
    else if (event.type === 'agility') text(log, `Avoid charge: ${event.dice.join(' + ')}. ${event.success ? 'Charge avoided.' : event.lost + ' Wounds lost.'}`);
    else if (event.type === 'luck') text(log, `Luck: ${event.dice.join(' + ')}. ${event.success ? 'The fight is interrupted.' : 'Combat continues.'}`);
    else if (event.type === 'horsemanship') text(log, `${event.actor}: Horsemanship roll ${event.dice.join(' + ')}. ${event.success ? 'Remains mounted.' : 'Falls and continues on foot.'}`);
    else if (event.type === 'opening-skipped') text(log, 'Opening shot skipped.');
    else if (event.type === 'end') text(log, `Encounter ${event.status}.`);
  }
  const history = document.createElement('details'); history.className = 'bsim-history';
  const heading = document.createElement('summary'); heading.textContent = 'Combat history'; history.append(heading);
  const list = document.createElement('div'); list.className = 'bsim-history-list'; history.append(list); root.append(history);
  for (const entry of [...state.history].reverse()) text(list, `${entry.enemy}: ${entry.outcome}`);
}

// Display firearm casualties, dice results and history without adding combat controls.
export function renderFirearmReport(document, root, state) {
  root.replaceChildren();
  const text = (parent, value) => {const p = document.createElement('p'); p.textContent = value; parent.append(p);};
  const report = document.createElement('div'); report.className = 'bsim-report'; report.setAttribute('role', 'status'); root.append(report);
  const fight = state.fight;
  if (!fight) text(report, 'Enter your current skill and choose an opponent.');
  else {
    const actors = [fight.hero, ...fight.allies, ...fight.opponents];
    const name = id => id == null ? 'Spray' : actors.find(row => row.id === id)?.name ?? id;
    text(report, `${fight.encounter.name || 'Custom encounter'} · Round ${fight.round} · ${fight.status}`);
    for (const actor of actors) text(report, `${actor.name}: Skill ${actor.skill} · ${actor.alive
      ? (actor.hits ?? 0) > 0 ? `Wounded (${actor.hits}/${actor.hitsToKill})` : 'Alive'
      : actor.id !== 'hero' ? fight.encounter.defeatLabel ?? 'Killed' : 'Killed'}`);
    if (fight.encounter.firstWoundSkillPenalty && (fight.hero.hits ?? 0) > 0) {
      text(report, `This fight applies the printed ${fight.encounter.firstWoundSkillPenalty}-point combat skill reduction. Record the same reduction to all skills on your character sheet for the rest of the adventure.`);
    }
    if (fight.destination) text(report, `Continue reading at section ${fight.destination}.`);
    const log = document.createElement('div'); log.className = 'bsim-log'; root.append(log);
    for (const event of fight.log.slice(-200).reverse()) text(log,
      `${name(event.attacker)} → ${name(event.target)}: ${event.dice.join(' + ')}${event.adjusted !== event.total ? ' + ' + (event.adjusted - event.total) : ''} = ${event.adjusted}, against ${event.skill}. `
      + (event.hit ? event.target === null ? 'Spray hit awaiting allocation.'
        : event.killed.length ? `${fight.encounter.heroSkill === 'Combat' ? 'Defeated' : 'Killed'}: ${event.killed.map(name).join(', ')}.` : 'Hit; wounded.' : 'Miss.'));
  }
  const history = document.createElement('details'); history.className = 'bsim-history';
  const heading = document.createElement('summary'); heading.textContent = 'Combat history'; history.append(heading);
  const list = document.createElement('div'); list.className = 'bsim-history-list'; history.append(list); root.append(history);
  for (const entry of state.history.slice(-100).reverse()) text(list, `${entry.enemy}: ${entry.outcome}`);
}

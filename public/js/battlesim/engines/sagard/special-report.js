// Describe Sagard ship, opposing-force and monster results without combat controls.
export function renderSagardSpecialSummary(fight, report, text) {
  if (fight.kind === 'naval') {
    text(report, `${fight.ship.name}: ${fight.ship.hp}/${fight.ship.maxHp} strength`);
    for (const row of fight.opponents) text(report, `${row.name}: ${row.hp == null
      ? row.alive ? 'Active' : 'Defeated' : `${row.hp}/${row.maxHp} strength`}`);
    if (fight.ending) text(report, fight.ending);
  } else if (fight.kind === 'forces') {
    text(report, `Sagard: ${fight.hero.hp}/${fight.hero.maxHp} HP · Level ${fight.hero.level}`);
    text(report, `Allied force: ${fight.alliesRemaining} · Enemy force: ${fight.enemiesRemaining}`);
    if (fight.monkeys?.arrived) text(report, `Monkey reinforcements: ${fight.monkeys.remaining}`);
    else if (fight.monkeys?.calledRound != null) text(report, `Monkey reinforcements arrive in round ${fight.monkeys.calledRound + fight.rules.monkeyWhistle.delayRounds}.`);
    if (fight.duel) for (const row of fight.duel.opponents) text(report, `${row.name}: ${row.hp}/${row.maxHp} HP · Level ${row.level}`);
  } else if (fight.kind === 'beast') {
    text(report, `Sagard: ${fight.hero.hp}/${fight.hero.maxHp} HP · Level ${fight.hero.level}`);
    text(report, `${fight.monster.name}: ${fight.monster.hp}/${fight.monster.maxHp} HP`);
    text(report, `Surviving crewmen: ${fight.crewRemaining}${fight.swallowed ? ' · Sagard is swallowed' : ''}`);
  } else return false;
  if (fight.hero) text(report, `Protection: ${fight.hero.shield} points remaining`);
  return true;
}

export function sagardSpecialEventText(event) {
  const rolled = event.die == null ? '' : `Roll ${event.die}: `;
  if (event.kind === 'duelTurn') return sagardSpecialEventText(event.entry)
    ?? `Individual duel: roll ${event.entry?.die ?? ''}, ${event.entry?.damage ?? 0} damage.`;
  return {chooseShip: 'Selected a ship to attack.', navalAction: `Chose ${event.decision}.`,
    ram: `${rolled}${event.result}.`, ramConfirm: `${rolled}${event.result}.`,
    missile: `${rolled}${event.damage} missile damage.`, enemyAttack: `${rolled}${event.damage} damage to your ship.`,
    boardHero: `${rolled}${event.casualty} enemy boarding casualties.`, boardEnemy: `${rolled}${event.casualty} allied boarding casualties.`,
    escape: `${rolled}${event.success ? 'escaped' : 'escape failed'}.`,
    precheck: `${rolled}${event.ending ?? 'galleon check resolved'}.`, escapeCheck: `${rolled}${event.ending ?? 'galleon did not escape'}.`,
    kills: `${rolled}${event.targets?.length ?? 0} sea opponents defeated.`, damagePool: `${rolled}${event.damage} damage to allocate.`,
    allocate: `Applied ${event.damage} damage to the selected tentacle.`, withdraw: 'Broke off the attack.',
    beginDuel: 'Began an individual duel.', beginVolley: 'Began the group volley.',
    enemyVolley: `${rolled}${event.casualty} allied casualties.`, allyVolley: `${rolled}${event.casualty} enemy casualties.`,
    monkeyVolley: `${rolled}${event.casualty} enemy casualties from monkey reinforcements.`,
    monkeyWhistle: `Blew the whistle. Reinforcements arrive in round ${event.arrivalRound}.`,
    monkeysArrive: `${event.count} monkey reinforcements arrived.`,
    salt: `Used ${event.count} salt bag${event.count === 1 ? '' : 's'} to destroy ${event.count} zombie${event.count === 1 ? '' : 's'} before combat.`,
    dagger: `Magic dagger: ${event.mode === 'destroy' ? 'expended its remaining power to destroy the foe' : `${event.damage} damage; power reduced by one`}.`,
    jab: `${rolled}${event.success ? 'roll again to confirm capture' : 'jab missed'}.`,
    jabConfirm: `${rolled}${event.success ? 'captured' : 'escaped capture'}.`,
    interferenceActivate: `${rolled}${event.active ? 'the demon intervenes' : 'the demon does not intervene'}.`,
    interferenceTarget: `${rolled}demon target: ${event.target}.`,
    interferenceDamage: `${rolled}${event.rawDamage} demon damage before protection.`,
    enemyEscape: `${rolled}${event.escaped ? 'opponent escaped' : 'opponent remains'}.`,
    swallow: `${rolled}${event.confirm ? 'confirm swallowing' : 'not swallowed'}.`,
    swallowConfirm: `${rolled}${event.swallowed ? 'swallowed' : 'not swallowed'}.`,
    digestion: `${event.damage} swallowed damage${event.shieldUsed ? `, protection absorbed ${event.shieldUsed}` : ''}.`,
    heroAttack: `${rolled}${event.damage} damage to the monster.`, stoneAttack: `${rolled}${event.damage} free-attack damage.`,
    crewCasualties: `${rolled}${event.casualties} crewmen lost.`, crewAttack: `${rolled}${event.damage} crew damage.`,
    grapple: `${rolled}${event.success ? 'took the sword; enemy still attacks' : 'grapple failed; enemy attacks'}.`,
    stunStone: `${rolled}used the stun stone.`, stoneConfirm: `${rolled}${event.broken ? 'stun stone shattered' : 'stun stone intact'}.`,
    lamp: `${rolled}${event.success ? 'took the lamp' : event.die == null ? 'kept fighting' : 'did not take the lamp'}.`,
    noOpponents: 'No mutineers remain to fight. Continue in the reader.'}[event.kind];
}

// Display Craven Manor combat rolls, scores and saved encounter history.
export function renderReport(right, state, ui) {
  right.replaceChildren();
  const fight = state.fight;
  ui.text(right, ui.tr(fight ? 'status.' + (fight.result || fight.status) : 'ready'), 'h4').className = 'bsim-side-title';
  if (fight) {
    ui.text(right, fight.opponent.name);
    ui.text(right, ui.tr('ttp') + ': ' + fight.player.ttp + ' / ' + fight.player.maxTtp);
    if (fight.opponent.rules.gunfight) {
      ui.text(right, ui.tr('wounds') + ': ' + fight.gun.playerWounds + ' / 2');
      for (const [i, wounds] of fight.gun.wounds.entries()) ui.text(right, ui.tr('opponent') + ' ' + (i + 1) + ': ' + wounds + ' / 2');
      ui.text(right, ui.tr(fight.gun.phase === 'player' ? 'yourShot' : 'enemyShot') + ' ' + (fight.gun.index + 1));
    } else {
      ui.text(right, ui.tr('round') + ': ' + fight.round + ' / ' + fight.opponent.rounds);
      ui.text(right, ui.tr('hits') + ': ' + fight.playerHits + ' / ' + fight.enemyHits);
      ui.text(right, ui.tr('rowScore') + ': ' + fight.rowPlayer + ' / ' + fight.rowEnemy);
      if (fight.opponent.rules.phantom) ui.text(right, ui.tr('phase.' + fight.phantom.phase));
    }
    if (fight.pending) for (const [key, dice] of Object.entries(fight.pending)) {
      if (dice) ui.text(right, ui.tr('dice.' + key) + ': [' + dice.join(', ') + '] = ' + dice.reduce((a, b) => a + b, 0)).className = 'bsim-log-accent';
    }
    ui.text(right, ui.tr('manualStory'));
    const log = document.createElement('div'); log.className = 'bsim-log'; right.append(log);
    for (const item of fight.events.slice().reverse()) {
      let message = (item.round + 1) + '. ', color = 'muted';
      if (item.kind === 'dice') {
        message += Object.entries(item).filter(([, value]) => Array.isArray(value))
          .map(([key, values]) => ui.tr('dice.' + key) + ': [' + values.join(', ') + ']').join(' · '); color = 'accent';
      }
      else if (item.kind === 'comparison') message += ui.tr('totals') + ': ' + [item.player, item.player2].filter(n => n !== null).join(', ') + ' / ' + item.enemies.join(', ');
      else if (item.kind === 'round') {message += ui.tr('hits') + ': +' + item.playerHits + ' / +' + item.enemyHits; color = item.playerHits ? 'success' : item.enemyHits ? 'danger' : 'muted';}
      else if (item.kind === 'row') {message += ui.tr('rowScore') + ': ' + item.playerHits + ' / ' + item.enemyHits; color = item.winner > 0 ? 'success' : item.winner < 0 ? 'danger' : 'muted';}
      else if (item.kind === 'shot') {message += ui.tr(item.who === 'player' ? 'yourShot' : 'enemyShot') + ' ' + (item.target + 1) + ': ' + (item.dodged ? ui.tr('dodged') : item.wounds); color = item.wounds ? item.who === 'player' ? 'success' : 'danger' : 'muted';}
      else if (item.kind === 'rewind') {message += ui.tr('rewind.' + item.scope) + ' (' + item.cost + ')'; color = 'accent';}
      else if (item.kind === 'disarm') {message += ui.tr('disarm') + ': [' + item.dice.join(', ') + ']'; color = item.success ? 'success' : 'danger';}
      else {message += ui.tr('event.' + item.kind); color = item.kind === 'feeding' ? 'danger' : 'accent';}
      ui.text(log, message).className = 'bsim-log-' + color;
    }
  }
  if (state.history.length) {
    ui.text(right, ui.tr('history'), 'h4').className = 'bsim-side-title';
    for (const row of state.history.slice(-30).reverse()) ui.text(right, row.enemy + ' · ' + ui.tr('status.' + row.outcome));
  }
  for (const child of right.children) child.classList.add('bsim-report');
}

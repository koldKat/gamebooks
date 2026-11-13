// Display Shadow Chaser combat results without navigating the story.
export function renderReport(right, state, ui) {
  right.replaceChildren();
  const fight = state.fight;
  ui.text(right, ui.tr(fight ? 'status.' + fight.status : 'ready'), 'h4').className = 'bsim-side-title';
  if (fight) {
    ui.text(right, fight.opponent.name);
    ui.text(right, ui.tr('hp') + ': ' + fight.player.hp + ' / 12');
    ui.text(right, ui.tr('round') + ': ' + fight.round);
    if (fight.mode === 'combat') {
      for (const [index, enemy] of fight.core.enemies.entries()) {
        ui.text(right, (index + 1) + '. ' + enemy.name + ': ' + enemy.hp + ' ' + ui.tr('cp')
          + ' · ' + enemy.rounds + ' ' + ui.tr('roundsLeft')).className = 'bsim-log-' + (enemy.hp ? 'accent' : 'muted');
      }
      if (fight.core.resolution) ui.text(right, ui.tr('resolution.' + fight.core.resolution)).className =
        'bsim-log-' + (fight.status === 'win' ? 'success' : 'danger');
    } else if (fight.mode === 'archery') {
      ui.text(right, ui.tr('arrows') + ': ' + fight.arrows);
      for (const enemy of fight.targets) ui.text(right, enemy.name + ': ' + enemy.hp + ' / 2 ' + ui.tr('halves'))
        .className = 'bsim-log-' + (enemy.hp ? 'accent' : 'muted');
      ui.text(right, ui.tr('survivors') + ': ' + fight.targets.filter(enemy => enemy.hp).length);
    } else ui.text(right, ui.tr('remaining') + ': ' + fight.remaining + ' · ' + ui.tr('bites') + ': ' + fight.bites + ' / 3');
    const log = document.createElement('div'); log.className = 'bsim-log'; right.append(log);
    for (const event of fight.events.slice().reverse()) {
      if (event.kind === 'attack') {
        ui.text(log, event.name + ': ' + event.dice.join(' + ') + ' → ' + event.total + ' / ' + event.attack + '+')
          .className = 'bsim-log-accent';
        ui.text(log, ui.tr('enemyDamage') + ': ' + event.enemyLoss + ' · ' + ui.tr('playerDamage') + ': ' + event.playerLoss)
          .className = 'bsim-log-' + (event.playerLoss ? 'danger' : event.enemyLoss ? 'success' : 'muted');
        if (event.confirmation != null) ui.text(log, ui.tr('confirmation') + ': ' + event.confirmation
          + ' · ' + ui.tr(event.connected ? 'connected' : 'passedThrough')).className = 'bsim-log-muted';
        if (event.damageDie != null) ui.text(log, ui.tr('damageDie') + ': ' + event.damageDie + ' · ×' + event.multiplier).className = 'bsim-log-muted';
        if (event.staffLoss) ui.text(log, ui.tr('staffDamage')).className = 'bsim-log-danger';
      } else if (event.kind === 'shot') ui.text(log, event.name + ': ' + event.die + ' → ' + event.total
        + ' · ' + ui.tr('enemyDamage') + ': ' + event.loss).className = 'bsim-log-' + (event.loss ? 'success' : 'muted');
      else ui.text(log, ui.tr('die') + ': ' + event.die + ' · ' + ui.tr(event.killed ? 'beastDefeated' : 'bitten'))
        .className = 'bsim-log-' + (event.killed ? 'success' : 'danger');
    }
    if (fight.destination) ui.text(right, ui.tr('continue') + ' ' + fight.destination).className = 'bsim-log-accent';
    else if (fight.status === 'win' && fight.encounter.section === '372') ui.text(right, ui.tr('previousEntry')).className = 'bsim-log-accent';
    ui.text(right, ui.tr('manualStory'));
  }
  if (state.history.length) {
    ui.text(right, ui.tr('history'), 'h4').className = 'bsim-side-title';
    for (const item of state.history.slice(-30).reverse()) ui.text(right, item.enemy + ' · ' + ui.tr('status.' + item.outcome));
  }
  for (const child of right.children) child.classList.add('bsim-report');
}

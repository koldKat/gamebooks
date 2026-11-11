// Display combat results and bounded history without applying story consequences.
export function renderAltimerReport(parent, ui, state) {
  parent.replaceChildren();
  const fight = state.fight;
  ui.text(parent, ui.tr(fight ? 'status.' + fight.status : 'ready'), 'h4').className = 'bsim-side-title';
  if (fight) {
    ui.text(parent, ui.tr('body') + ': ' + fight.player.body + ' · ' + ui.tr('spirit') + ': ' + fight.player.hp);
    for (const [index, enemy] of fight.enemies.entries()) {
      ui.text(parent, (index === fight.target ? '› ' : '') + enemy.name + ' · '
        + ui.tr('body') + ' ' + enemy.body + ' · ' + ui.tr('spirit') + ' ' + enemy.hp);
    }
    if (fight.status === 'fighting') ui.text(parent, ui.tr('turn.' + fight.phase) + ' · ' + ui.tr('round') + ' ' + fight.round);
    for (const note of fight.opponent.sourceNotes ?? []) ui.text(parent, note);
    ui.text(parent, ui.tr('manualStory'));
    ui.text(parent, ui.tr('log'), 'h4').className = 'bsim-side-title';
    const log = ui.document.createElement('div'); log.className = 'bsim-log'; parent.append(log);
    for (const event of fight.events.slice().reverse()) {
      if (event.kind === 'cancel') {ui.text(log, ui.tr('status.cancelled')); continue;}
      const roll = event.dice.length ? '[' + event.dice.join(', ') + ']' : ui.tr('suckerTurn');
      ui.text(log, ui.tr('turn.' + event.actor) + ' · ' + roll
        + ' · ' + ui.tr(event.weakSpot ? 'bodyDamage' : 'damage') + ' ' + (event.weakSpot ? event.damage : event.spiritDamage)
        + (event.weakSpot ? ' · ' + ui.tr('damage') + ' ' + event.spiritDamage : '')
        + (event.vestDie === undefined ? '' : ' · ' + ui.tr('vestDie') + ' ' + event.vestDie)
        + ' · ' + ui.tr('body') + ' ' + event.playerBody + ' · ' + ui.tr('spirit') + ' ' + event.playerHp);
    }
  }
  if (state.history.length) {
    ui.text(parent, ui.tr('history'), 'h4').className = 'bsim-side-title';
    for (const row of state.history.slice(-30).reverse()) ui.text(parent, row.enemy + ' · ' + ui.tr('status.' + row.outcome));
  }
}

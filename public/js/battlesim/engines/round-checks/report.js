// Display finite-round combat results and their printed consequences without story automation.
export function renderReport(right, state, ui, statKeys) {
  right.replaceChildren();
  const fight = state.fight;
  ui.text(right, ui.tr(fight ? 'status.' + fight.status : 'ready'), 'h4').className = 'bsim-side-title';
  if (fight) {
    ui.text(right, fight.opponent.name);
    ui.text(right, statKeys.map(key => ui.tr(key) + ': ' + fight.player[key]).join(' · '));
    ui.text(right, ui.tr('round') + ': ' + fight.round + ' / ' + fight.encounter.rounds.length);
    ui.text(right, ui.tr('roundsWon') + ': ' + fight.rounds.filter(round => round.won).length);
    if (fight.result) ui.text(right, ui.tr('result.' + fight.result)).className =
      'bsim-log-' + (fight.result === 'win' ? 'success' : fight.result === 'loss' ? 'danger' : 'accent');
    if (fight.pending) {
      ui.text(right, ui.tr('yourDice') + ': ' + fight.pending.player.join(' + ')).className = 'bsim-log-accent';
      if (fight.pending.enemy.length) ui.text(right, ui.tr('enemyDice') + ': ' + fight.pending.enemy.join(' + '));
    }
    const log = document.createElement('div'); log.className = 'bsim-log'; right.append(log);
    for (const event of fight.events.slice().reverse()) {
      if (event.kind === 'round') ui.text(log, ui.tr('round') + ' ' + (event.index + 1) + ': '
        + (event.forced ? ui.tr(event.forcedBy ? 'item.' + event.forcedBy : 'forcedWin') : event.playerDice.join(' + ') + ' → ' + event.total
          + (fight.encounter.rounds[event.index].opposed ? ' > ' : ' ≥ ') + event.target)
        + ' · ' + ui.tr(event.won ? 'won' : 'lost')).className = 'bsim-log-' + (event.won ? 'success' : 'danger');
      else if (event.kind === 'note') ui.text(log, event.text).className = 'bsim-log-accent';
      else if (event.kind === 'choice') ui.text(log, ui.tr(event.stat) + ': ' + event.amount).className = 'bsim-log-danger';
    }
    if (fight.destination) ui.text(right, ui.tr('continue') + ' ' + fight.destination).className = 'bsim-log-accent';
    ui.text(right, ui.tr('manualStory'));
  }
  if (state.history.length) {
    ui.text(right, ui.tr('history'), 'h4').className = 'bsim-side-title';
    for (const item of state.history.slice(-30).reverse()) ui.text(right,
      item.enemy + ' · ' + ui.tr('status.' + item.outcome));
  }
  for (const child of right.children) child.classList.add('bsim-report');
}

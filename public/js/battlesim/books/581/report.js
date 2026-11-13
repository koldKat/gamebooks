// Display current combat stats, dice, bounded logs and confirmed encounter history.
import {roundTotals} from './combat.js';

export function renderReport(right, state, ui) {
  right.replaceChildren();
  const fight = state.fight;
  ui.text(right, ui.tr(fight ? 'status.' + (fight.result || fight.status) : 'ready'), 'h4').className = 'bsim-side-title';
  if (fight) {
    ui.text(right, fight.opponent.name);
    ui.text(right, ui.tr('player') + ': ' + fight.player.hp + ' / ' + fight.player.maxHp);
    if (fight.companion) ui.text(right, fight.companion.name + ': ' + fight.companion.hp + ' / ' + fight.companion.maxHp);
    for (const [index, enemy] of fight.enemies.entries()) {
      ui.text(right, (index + 1) + '. ' + enemy.name + ': ' + enemy.hp + ' / ' + enemy.maxHp)
        .className = 'bsim-log-' + (enemy.hp <= enemy.stopHp ? 'muted' : index === fight.active ? 'accent' : 'muted');
    }
    ui.text(right, ui.tr('round') + ': ' + fight.round);
    if (fight.playerWounded) ui.text(right, ui.tr('wounded')).className = 'bsim-log-danger';
    if (fight.pending) {
      const totals = roundTotals(fight);
      for (const [who, die] of Object.entries(fight.pending)) {
        ui.text(right, ui.tr(who) + ': ' + die + ' → ' + totals[who]).className = 'bsim-log-accent';
      }
    }
    const log = document.createElement('div'); log.className = 'bsim-log'; right.append(log);
    for (const event of fight.events.slice().reverse()) {
      if (event.kind === 'resolve') {
        if (!event.hits.length) ui.text(log, ui.tr('noHit')).className = 'bsim-log-muted';
        for (const hit of event.hits) ui.text(log, ui.tr(hit.who) + ' → ' + ui.tr(hit.target) + ': ' + hit.amount)
          .className = 'bsim-log-' + (hit.target === 'enemy' ? 'success' : 'danger');
      } else if (event.kind === 'power') ui.text(log, ui.tr('power.' + event.power)).className = 'bsim-log-accent';
      else if (event.kind === 'resurrect') ui.text(log, ui.tr('resurrect') + ': ' + event.hp).className = 'bsim-log-success';
      else if (event.kind === 'roll') ui.text(log, Object.entries(event.dice).map(([who, die]) => ui.tr(who) + ': ' + die).join(' · ')).className = 'bsim-log-muted';
    }
    ui.text(right, ui.tr('manualStory'));
  }
  if (state.history.length) {
    ui.text(right, ui.tr('history'), 'h4').className = 'bsim-side-title';
    for (const item of state.history.slice(-30).reverse()) ui.text(right, item.enemy + ' · ' + ui.tr('status.' + item.outcome));
  }
  for (const child of right.children) child.classList.add('bsim-report');
}

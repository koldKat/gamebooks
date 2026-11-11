// Display Golden Dragon encounter results and bounded history without changing the run.
export function renderDragonReport(parent, ui, state) {
  parent.replaceChildren();
  const fight = state.fight;
  ui.text(parent, ui.tr(fight ? 'status.' + fight.status : 'ready'), 'h4').className = 'bsim-side-title';
  if (fight) {
    ui.text(parent, fight.opponent.name);
    ui.text(parent, ui.tr('vigour') + ' ' + fight.player.hp + ' · ' + ui.tr('psi') + ' ' + fight.player.psi);
    for (const [index, enemy] of fight.enemies.entries()) {
      const unit = fight.opponent.profiles[index].unit === 'branches' ? ui.tr('branches') : ui.tr('vigour');
      ui.text(parent, enemy.name + ' · ' + unit + ' ' + Math.max(0, enemy.hp));
    }
    ui.text(parent, ui.tr('rounds') + ' ' + fight.round);
    if (fight.opponent.trackWounds) ui.text(parent, ui.tr('hitsTaken') + ' ' + fight.hitsTaken);
    if (fight.venomBites) ui.text(parent, ui.tr('venomBites') + ' ' + fight.venomBites);
    if (fight.paralysisHits) ui.text(parent, ui.tr('paralysisHits') + ' ' + fight.paralysisHits);
    for (const note of fight.opponent.sourceNotes ?? []) ui.text(parent, note);
    if (fight.unresolved) ui.text(parent, ui.tr('unresolved') + ' ' + fight.unresolved.total);
    if (fight.pendingPsiSave) ui.text(parent, ui.tr('psiSavePrompt') + ' ' + fight.player.psi);
    ui.text(parent, ui.tr('manualStory'));
    ui.text(parent, ui.tr('log'), 'h4').className = 'bsim-side-title';
    const log = ui.document.createElement('div'); log.className = 'bsim-log'; parent.append(log);
    for (const event of fight.events.slice().reverse()) {
      let message = ui.tr('event.' + event.kind);
      if (event.dice) message += ' · [' + event.dice.join(', ') + '] · ' + ui.tr(event.kind === 'psiSave' ? 'rollTotal' : 'chartTotal') + ' ' + event.total;
      if (event.kind === 'round') {
        message += ' · ' + ui.tr('vigour') + ' -' + event.playerDamage + ' · '
          + fight.enemies[event.target].name + ' -' + event.enemyDamage;
        if (event.psiDamage) message += ' · ' + ui.tr('psi') + ' -' + event.psiDamage;
        if (event.manualRuling) message += ' · ' + ui.tr('manualRuling');
      }
      if (event.kind === 'flee') message += ' · ' + ui.tr('vigour') + ' -' + event.playerDamage;
      if (event.kind === 'psiSave') message += ' · ' + ui.tr('psi') + ' -' + event.psiDamage;
      ui.text(log, message);
    }
  }
  if (state.history.length) {
    ui.text(parent, ui.tr('history'), 'h4').className = 'bsim-side-title';
    for (const row of state.history.slice(-30).reverse()) ui.text(parent, row.enemy + ' · ' + ui.tr('status.' + row.outcome));
  }
}

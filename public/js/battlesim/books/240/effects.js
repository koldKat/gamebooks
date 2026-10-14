// Book-specific spells, items and recovery; UI and persistence callbacks are injected.
export function createEffects(getContext) {
// BEGIN EXTRACTED RULES
function _useSpearAutoWin() {
  const { SVG_TROPHY, _appendLog, _data, _enemyNameSafe, _notReady, _recordOutcome, _renderAll, saveState, t } = getContext();

  const d = _data();
  if (!d || _notReady(d) || !d.player.hasSpear || d.player.spearLifeForce <= 0) return;
  if (d.player.stamina <= 0 || d.enemy.stamina <= 0) return;
  d.player.spearLifeForce--;
  d.enemy.stamina = 0;
  _appendLog(d, t('battlesim240.log.spear_autowin', { enemy: _enemyNameSafe(d), n: d.player.spearLifeForce }));
  _appendLog(d, `${SVG_TROPHY} ${t('battlesim240.log.defeated', { enemy: _enemyNameSafe(d) })}`);
  _recordOutcome(d, 'win');
  saveState();
  _renderAll();
}

function _eatProvisions() {
  const { PROVISIONS_HEAL, _appendLog, _data, _notReady, _renderAll, saveState, showAlert, t } = getContext();

  const d = _data();
  if (!d || _notReady(d)) return;
  if (d.roundsThisBattle > 0 && d.player.stamina > 0 && d.enemy.stamina > 0) {
    showAlert(t('battlesim240.alert.provisions_midfight'));
    return;
  }
  if (d.player.provisionsLeft <= 0) return;
  if (d.player.stamina >= d.player.staminaInitial) {
    showAlert(t('battlesim240.alert.stamina_full'));
    return;
  }
  d.player.provisionsLeft--;
  const before = d.player.stamina;
  d.player.stamina = Math.min(d.player.staminaInitial, d.player.stamina + PROVISIONS_HEAL);
  _appendLog(d, t('battlesim240.log.provisions', { before, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
  saveState();
  _renderAll();
}
// END EXTRACTED RULES
  return { _useSpearAutoWin, _eatProvisions };
}

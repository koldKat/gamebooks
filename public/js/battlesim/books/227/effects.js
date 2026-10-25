// Book-specific spells, items and recovery; UI and persistence callbacks are injected.
export function createEffects(getContext) {
// BEGIN EXTRACTED RULES
function _eatMeal() {
  const { MEAL_HEAL, _appendLog, _data, _enemyFloor, _notReady, _renderAll, saveState, showAlert, t } = getContext();

  const d = _data();
  if (!d || _notReady(d) || d.player.provisions <= 0) return;
  if (d.roundsThisBattle > 0 && d.player.stamina > 0 && d.enemy.stamina > _enemyFloor(d)) {
    showAlert(t('battlesim227.alert.meal_midfight'));
    return;
  }
  d.player.provisions--;
  const before = d.player.stamina;
  d.player.stamina = Math.min(d.player.staminaInitial, d.player.stamina + MEAL_HEAL);
  _appendLog(d, t('battlesim227.log.meal', { before, stamina: d.player.stamina, staminaMax: d.player.staminaInitial, provisions: d.player.provisions }));
  saveState();
  _renderAll();
}
// END EXTRACTED RULES
  return { _eatMeal };
}

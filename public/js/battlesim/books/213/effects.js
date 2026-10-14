// Book-specific spells, items and recovery; UI and persistence callbacks are injected.
export function createEffects(getContext) {
// BEGIN EXTRACTED RULES
function _usePsiPower() {
  const { SUPER_POWER_STAMINA_COST, _appendLog, _data, _notReady, _renderAll, saveState, showAlert, t } = getContext();

  const d = _data();
  if (!d || _notReady(d)) return;
  if (d.roundsThisBattle > 0 && d.player.stamina > 0 && d.enemy.stamina > 0) {
    showAlert(t('battlesim213.alert.psi_midfight'));
    return;
  }
  d.player.stamina = Math.max(0, d.player.stamina - SUPER_POWER_STAMINA_COST);
  _appendLog(d, t('battlesim213.log.psi_use', { n: SUPER_POWER_STAMINA_COST, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
  saveState();
  _renderAll();
}
// END EXTRACTED RULES
  return { _usePsiPower };
}

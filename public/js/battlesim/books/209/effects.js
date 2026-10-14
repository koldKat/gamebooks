// Book-specific spells, items and recovery; UI and persistence callbacks are injected.
export function createEffects(getContext) {
// BEGIN EXTRACTED RULES
function _useMedKit() {
  const { MEDKIT_HEAL, _activeSide, _appendLog, _data, _notReady, _renderAll, saveState, showAlert, t } = getContext();

  const d = _data();
  if (!d || _notReady(d)) return;
  const side = _activeSide(d);
  const midFight = d[side.roundsKey] > 0 && side.self[side.selfHp] > 0 && side.foe[side.foeHp] > 0;
  if (midFight) {
    showAlert(t('battlesim209.alert.medkit_midfight'));
    return;
  }
  if (d.player.medKitLeft <= 0 || d.player.stamina >= d.player.staminaInitial) return;
  d.player.medKitLeft--;
  const before = d.player.stamina;
  d.player.stamina = Math.min(d.player.staminaInitial, d.player.stamina + MEDKIT_HEAL);
  _appendLog(d, t('battlesim209.log.medkit', { before, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
  saveState();
  _renderAll();
}
// END EXTRACTED RULES
  return { _useMedKit };
}

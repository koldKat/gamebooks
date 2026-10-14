// Book-specific spells, items and recovery; UI and persistence callbacks are injected.
export function createEffects(getContext) {
// BEGIN EXTRACTED RULES
function _useMedkit() {
  const { _appendLog, _data, _renderAll, saveState, t } = getContext();

  const d = _data();
  if (!d) return;
  const before = d.playerStamina;
  d.playerStamina = Math.min(d.playerStaminaMax, d.playerStamina + d.medkitAmount);
  _appendLog(d, t('battlesim161.log.medkit', { n: d.medkitAmount, before, stamina: d.playerStamina, staminaMax: d.playerStaminaMax }));
  saveState();
  _renderAll();
}
// END EXTRACTED RULES
  return { _useMedkit };
}

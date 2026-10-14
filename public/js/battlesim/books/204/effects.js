// Book-specific spells, items and recovery; UI and persistence callbacks are injected.
export function createEffects(getContext) {
// BEGIN EXTRACTED RULES
function _useHealingPowder() {
  const { HEALING_POWDER_HEAL, _appendLog, _data, _notReady, _renderAll, saveState, showAlert, t } = getContext();

  const d = _data();
  if (!d || _notReady(d) || !d.player.hasHealingPowder || d.player.healingPowderUsed) return;
  if (d.roundsThisBattle > 0 && d.player.stamina > 0 && d.enemy.stamina > 0) {
    showAlert(t('battlesim204.alert.powder_midfight'));
    return;
  }
  d.player.healingPowderUsed = true;
  const before = d.player.stamina;
  d.player.stamina = Math.min(d.player.staminaInitial, d.player.stamina + HEALING_POWDER_HEAL);
  _appendLog(d, t('battlesim204.log.powder', { before, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
  saveState();
  _renderAll();
}

function _useMistressPotion() {
  const { SCORE_LABELS, _appendLog, _data, _notReady, _renderAll, saveState, showAlert, t } = getContext();

  const d = _data();
  if (!d || _notReady(d) || !d.player.hasMistressPotion || d.player.mistressPotionUsed) return;
  if (d.roundsThisBattle > 0 && d.player.stamina > 0 && d.enemy.stamina > 0) {
    showAlert(t('battlesim204.alert.potion_midfight'));
    return;
  }
  d.player.mistressPotionUsed = true;
  const key   = d.player.mistressPotionScore;
  const label = t(SCORE_LABELS[key]);
  const initialKey = `${key}Initial`;
  d.player[key] = d.player[initialKey];
  _appendLog(d, t('battlesim204.log.mistress', { label, n: d.player[initialKey] }));
  saveState();
  _renderAll();
}
// END EXTRACTED RULES
  return { _useHealingPowder, _useMistressPotion };
}

// Book-specific spells, items and recovery; UI and persistence callbacks are injected.
export function createEffects(getContext) {
// BEGIN EXTRACTED RULES
function _usePotion() {
  const { HEALING_POTION_HEAL, _appendLog, _battleOver, _data, _renderAll, saveState, showAlert, t } = getContext();

  const d = _data();
  if (!d || !d.rolled || !d.hasHealingPotion || d.healingPotionUsed) return;
  if (d.printedRules && d.endurance <= 0) return;
  if (d.roundsThisBattle > 0 && !_battleOver(d)) {
    showAlert(t('battlesim435.alert.potion_midfight'));
    return;
  }
  d.healingPotionUsed = true;
  const before = d.endurance;
  d.endurance = Math.min(d.enduranceInitial, d.endurance + HEALING_POTION_HEAL);
  _appendLog(d, t('battlesim435.log.potion', { before, endurance: d.endurance, enduranceMax: d.enduranceInitial }));
  saveState();
  _renderAll();
}
// END EXTRACTED RULES
  return { _usePotion };
}

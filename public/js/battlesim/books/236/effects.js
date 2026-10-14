// Book-specific spells, items and recovery; UI and persistence callbacks are injected.
export function createEffects(getContext) {
// BEGIN EXTRACTED RULES
function _useHeroism() {
  const { _appendLog, _data, _notReady, _renderAll, saveState, showAlert, t } = getContext();

  const d = _data();
  if (!d || _notReady(d) || d.player.heroismUsedThisFight) return;
  if (d.roundsThisBattle > 0 && d.player.stamina > 0 && d.enemy.stamina > 0) {
    showAlert(t('battlesim236.alert.heroism_midfight'));
    return;
  }
  d.player.heroismUsedThisFight = true;
  d.player.stamina = Math.min(d.player.staminaInitial, d.player.stamina + 2);
  if (d.temporaryHeroism) d.heroismSkillBonus = 2;
  else d.player.skill += 2;
  _appendLog(d, t('battlesim236.log.heroism', { stamina: d.player.stamina, staminaMax: d.player.staminaInitial, skill: d.player.skill + (d.heroismSkillBonus || 0) }));
  saveState();
  _renderAll();
}
// END EXTRACTED RULES
  return { _useHeroism };
}

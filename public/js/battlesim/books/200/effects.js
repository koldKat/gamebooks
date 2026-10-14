// Book-specific spells, items and recovery; UI and persistence callbacks are injected.
export function createEffects(getContext) {
// BEGIN EXTRACTED RULES
function _usePotion() {
  const { _appendLog, _data, _notReady, _renderAll, saveState, t } = getContext();

  const d = _data();
  if (!d || _notReady(d) || d.player.potionUsesLeft <= 0) return;
  d.player.potionUsesLeft--;
  if (d.player.potionKey === 'skill') {
    d.player.skill = d.player.skillInitial;
    _appendLog(d, t('battlesim200.log.potion_skill', { n: d.player.skillInitial }));
  } else if (d.player.potionKey === 'strength') {
    d.player.stamina = d.player.staminaInitial;
    _appendLog(d, t('battlesim200.log.potion_strength', { n: d.player.staminaInitial }));
  } else {
    d.player.luckInitial += 1;
    d.player.luck = d.player.luckInitial;
    _appendLog(d, t('battlesim200.log.potion_fortune', { n: d.player.luckInitial }));
  }
  saveState();
  _renderAll();
}
// END EXTRACTED RULES
  return { _usePotion };
}

// Book-specific spells, items and recovery; UI and persistence callbacks are injected.
export function createEffects(getContext) {
// BEGIN EXTRACTED RULES
function _useLaumspur() {
  const { LAUMSPUR_HEAL, _appendLog, _data, _notReady, _playerLost, _renderAll, saveState, showAlert, t } = getContext();

  const d = _data();
  if (!d || _notReady(d)) return;
  if (d.printedRules && _playerLost(d)) return;
  if (d.player.laumspurUsed) return;
  if (d.roundsThisBattle > 0 && d.player.ep > 0 && d.enemy.ep > 0 && !d.combatEffects?.finished) {
    showAlert(t('battlesim433.alert.laumspur_midfight'));
    return;
  }
  if (d.player.ep >= d.player.epInitial) {
    showAlert(t('battlesim433.alert.ep_full'));
    return;
  }
  d.player.laumspurUsed = true;
  const before = d.player.ep;
  d.player.ep = Math.min(d.player.epInitial, d.player.ep + LAUMSPUR_HEAL);
  _appendLog(d, t('battlesim433.log.laumspur', { before, ep: d.player.ep, epMax: d.player.epInitial }));
  saveState();
  _renderAll();
}
// END EXTRACTED RULES
  return { _useLaumspur };
}

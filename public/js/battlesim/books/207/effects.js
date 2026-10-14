// Book-specific spells, items and recovery; UI and persistence callbacks are injected.
export function createEffects(getContext) {
// BEGIN EXTRACTED RULES
function _eatProvisions() {
  const { PROVISIONS_HEAL, _appendLog, _data, _notReady, _renderAll, saveState, showAlert, t } = getContext();

  const d = _data();
  if (!d || _notReady(d)) return;
  if (d.roundsThisBattle > 0 && d.player.stamina > 0 && d.enemy.stamina > 0) {
    showAlert(t('battlesim207.alert.provisions_midfight'));
    return;
  }
  if (d.player.provisionsLeft <= 0) return;
  if (d.player.stamina >= d.player.staminaInitial) {
    showAlert(t('battlesim207.alert.stamina_full'));
    return;
  }
  d.player.provisionsLeft--;
  const before = d.player.stamina;
  d.player.stamina = Math.min(d.player.staminaInitial, d.player.stamina + PROVISIONS_HEAL);
  _appendLog(d, t('battlesim207.log.provisions', { before, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
  saveState();
  _renderAll();
}

function _usePotion() {
  const { FORTUNE_LUCK_BONUS, _appendLog, _data, _notReady, _renderAll, saveState, showAlert, t } = getContext();

  const d = _data();
  if (!d || _notReady(d) || d.player.potionUsesLeft <= 0) return;
  if (d.roundsThisBattle > 0 && d.player.stamina > 0 && d.enemy.stamina > 0) {
    showAlert(t('battlesim207.alert.potion_midfight'));
    return;
  }
  d.player.potionUsesLeft--;
  if (d.player.potionKey === 'skill') {
    d.player.skill = d.player.skillInitial;
    _appendLog(d, t('battlesim207.log.potion_skill', { n: d.player.skillInitial }));
  } else if (d.player.potionKey === 'strength') {
    d.player.stamina = d.player.staminaInitial;
    _appendLog(d, t('battlesim207.log.potion_strength', { n: d.player.staminaInitial }));
  } else {
    d.player.luckInitial += FORTUNE_LUCK_BONUS;
    d.player.luck = d.player.luckInitial;
    _appendLog(d, t('battlesim207.log.potion_fortune', { n: d.player.luckInitial }));
  }
  saveState();
  _renderAll();
}
// END EXTRACTED RULES
  return { _eatProvisions, _usePotion };
}

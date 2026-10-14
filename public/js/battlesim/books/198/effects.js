// Book-specific spells, items and recovery; UI and persistence callbacks are injected.
export function createEffects(getContext) {
// BEGIN EXTRACTED RULES
function _eatProvisions() {
  const { PROVISIONS_HEAL, _appendLog, _data, _notReady, _renderAll, saveState, showAlert, t } = getContext();

  const d = _data();
  if (!d || _notReady(d)) return;
  if (d.roundsThisBattle > 0 && d.player.stamina > 0 && d.enemy.stamina > 0) {
    showAlert(t('battlesim198.alert.provisions_midfight'));
    return;
  }
  if (d.player.provisionsLeft <= 0) return;
  if (d.player.stamina >= d.player.staminaInitial) {
    showAlert(t('battlesim198.alert.stamina_full'));
    return;
  }
  d.player.provisionsLeft--;
  const before = d.player.stamina;
  d.player.stamina = Math.min(d.player.staminaInitial, d.player.stamina + PROVISIONS_HEAL);
  _appendLog(d, t('battlesim198.log.provisions', { before, stamina: d.player.stamina, staminaMax: d.player.staminaInitial }));
  saveState();
  _renderAll();
}

function _usePotion() {
  const { _appendLog, _data, _notReady, _renderAll, saveState, t } = getContext();

  const d = _data();
  if (!d || _notReady(d) || d.player.potionUsesLeft <= 0) return;
  d.player.potionUsesLeft--;
  if (d.player.potionKey === 'skill') {
    d.player.skill = d.player.skillInitial;
    _appendLog(d, t('battlesim198.log.potion_skill', { n: d.player.skillInitial }));
  } else if (d.player.potionKey === 'strength') {
    d.player.stamina = d.player.staminaInitial;
    _appendLog(d, t('battlesim198.log.potion_strength', { n: d.player.staminaInitial }));
  } else {
    d.player.luckInitial += 1;
    d.player.luck = d.player.luckInitial;
    _appendLog(d, t('battlesim198.log.potion_fortune', { n: d.player.luckInitial }));
  }
  saveState();
  _renderAll();
}

function _useInvisibility() {
  const { _appendLog, _data, _renderAll, saveState, t } = getContext();

  const d = _data();
  if (!d || !d.player.invisibilityHave || d.player.invisibilityUsed) return;
  d.player.invisibilityUsed = true;
  d.player.invisibilityActive = true;
  _appendLog(d, t('battlesim198.log.invisibility_drink'));
  saveState();
  _renderAll();
}

function _useHolyWater() {
  const { HOLYWATER_LUCK_BONUS, HOLYWATER_SKILL_PENALTY, HOLYWATER_STAMINA_PENALTY, _appendLog, _data, _renderAll, saveState, t } = getContext();

  const d = _data();
  if (!d || !d.player.holyWaterHave || d.player.holyWaterUsed) return;
  d.player.holyWaterUsed = true;
  d.player.stamina = Math.max(0, Math.min(d.player.staminaInitial, d.player.staminaInitial - HOLYWATER_STAMINA_PENALTY));
  d.player.skill = Math.max(0, d.player.skillInitial - HOLYWATER_SKILL_PENALTY);
  d.player.luck = Math.min(d.player.luckInitial + HOLYWATER_LUCK_BONUS, d.player.luck + HOLYWATER_LUCK_BONUS);
  _appendLog(d, t('battlesim198.log.holywater_drink'));
  saveState();
  _renderAll();
}

function _useRum() {
  const { RUM_LUCK_BONUS, RUM_STAMINA_BONUS, _appendLog, _data, _renderAll, saveState, t } = getContext();

  const d = _data();
  if (!d || !d.player.rumHave || d.player.rumUsed) return;
  d.player.rumUsed = true;
  d.player.stamina = Math.min(d.player.staminaInitial, d.player.stamina + RUM_STAMINA_BONUS);
  d.player.luck = d.player.luck + RUM_LUCK_BONUS;
  _appendLog(d, t('battlesim198.log.rum_drink', { stamina: RUM_STAMINA_BONUS, luck: RUM_LUCK_BONUS }));
  saveState();
  _renderAll();
}
// END EXTRACTED RULES
  return { _eatProvisions, _usePotion, _useInvisibility, _useHolyWater, _useRum };
}

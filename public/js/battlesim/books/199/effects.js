// Book-specific spells, items and recovery; UI and persistence callbacks are injected.
export function createEffects(getContext) {
// BEGIN EXTRACTED RULES
function _castSpell(key) {
  const { SPELLS, SPELL_LABELS, _appendLog, _data, _notReady, _renderAll, saveState, t } = getContext();

  const d = _data();
  if (!d || _notReady(d)) return;
  const s = d.player.spells[key];
  if (!s || s.have - s.used <= 0 || d.player.magic <= 0) return;
  s.used++;
  d.player.magic = Math.max(0, d.player.magic - 1);
  const spec = SPELLS.find(sp => sp[0] === key);
  if (spec[2] === 'restore') {
    const statKey = key === 'skillSpell' ? 'skill' : key === 'staminaSpell' ? 'stamina' : 'luck';
    const initKey = `${statKey}Initial`;
    const before = d.player[statKey];
    d.player[statKey] = Math.min(d.player[initKey], d.player[statKey] + Math.floor(d.player[initKey] / 2));
    _appendLog(d, t('battlesim199.log.cast_restore', { spell: t(SPELL_LABELS[key]), stat: statKey.toUpperCase(), before, stamina: d.player[statKey], staminaMax: d.player[initKey] }));
  } else {
    _appendLog(d, t('battlesim199.log.cast_manual', { spell: t(SPELL_LABELS[key]) }));
  }
  saveState();
  _renderAll();
}

function _useMagikPotion() {
  const { MAGIK_DOSES, _appendLog, _data, _renderAll, saveState, t } = getContext();

  const d = _data();
  if (!d || !d.player.magikHave || d.player.magikUsed >= MAGIK_DOSES) return;
  d.player.magikUsed++;
  d.player.magicInitial += 1;
  d.player.magic += 1;
  _appendLog(d, t('battlesim199.log.magik_drink', { n: d.player.magicInitial, left: MAGIK_DOSES - d.player.magikUsed, doseWord: (MAGIK_DOSES - d.player.magikUsed === 1) ? t('battlesim199.log.dose') : t('battlesim199.log.doses') }));
  saveState();
  _renderAll();
}
// END EXTRACTED RULES
  return { _castSpell, _useMagikPotion };
}

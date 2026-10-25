// Book-specific spells, items and recovery; UI and persistence callbacks are injected.
export function createEffects(getContext) {
// BEGIN EXTRACTED RULES
function _usePotion() {
  const { POTION_HEAL_BONUS, _appendLog, _data, _renderInputs, _renderLog, saveState, t } = getContext();

  const d = _data();
  if (!d) return;
  const inBattle = d.round > 1 && d.player.life > 0 && d.enemy.life > 0;
  if (inBattle || !d.items?.potion || d.player.life <= 0 || d.player.life >= d.player.lifeMax) return;

  const roll  = 1 + Math.floor(Math.random() * 6);
  const heal  = roll + POTION_HEAL_BONUS;
  const before = d.player.life;
  d.player.life  = Math.min(d.player.lifeMax, d.player.life + heal);
  d.items.potion = false;

  _appendLog(d, t('battlesim8.log.potion', { roll, heal, before, after: d.player.life }));

  saveState();
  _renderInputs();
  _renderLog();
}
// END EXTRACTED RULES
  return { _usePotion };
}

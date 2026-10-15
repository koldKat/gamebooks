// Combat rules and resolution; UI and persistence callbacks are injected.
export function createCombat(getContext) {
// BEGIN EXTRACTED RULES
function _beats(a, b) {

  return (a === 'paper' && b === 'rock') || (a === 'scissors' && b === 'paper') || (a === 'rock' && b === 'scissors');
}

function _enemyName(d) {
  const { t } = getContext();
 return d.enemy.name.trim() || t('battlesim.default_enemy'); }

function _enemyNameSafe(d) {
  const { _enemyName, escapeHtml } = getContext();
 return escapeHtml(_enemyName(d)); }

function _formStat(side, statKey) {

  return statKey === 'sila' ? side.formSila : statKey === 'lovkost' ? side.formLovkost : side.formBarzina;
}

function _generalStat(side, statKey) {

  return side[statKey];
}

function _resolve() {
  const { STAT_BY_TYPE, _beats, _data, _formStat, _generalStat } = getContext();

  const d = _data();
  if (!d) return null;
  const pType = d.player.formType;
  const eType = d.enemy.formType;
  if (pType === eType) {
    const statKey = STAT_BY_TYPE[pType];
    return {
      tie: true, statKey,
      playerGeneral: _generalStat(d.player, statKey), playerForm: _formStat(d.player, statKey), playerSkill: d.player.umenie,
      enemyGeneral: _generalStat(d.enemy, statKey), enemyForm: _formStat(d.enemy, statKey), enemySkill: d.enemy.umenie,
    };
  }
  const winningType = _beats(pType, eType) ? pType : eType;
  const statKey = STAT_BY_TYPE[winningType];
  const playerWinsType = winningType === pType;
  return {
    tie: false, statKey, playerWinsType,
    playerGeneral: _generalStat(d.player, statKey), playerForm: _formStat(d.player, statKey), playerSkill: d.player.umenie,
    enemyGeneral: _generalStat(d.enemy, statKey), enemyForm: _formStat(d.enemy, statKey), enemySkill: d.enemy.umenie,
  };
}

function _recordWin() {
  const { SVG_TROPHY, _appendLog, _data, _enemyNameSafe, _recordOutcome, _renderAll, saveState, t } = getContext();

  const d = _data();
  if (!d) return;
  _appendLog(d, `${SVG_TROPHY} ${t('battlesim661.log.win', { enemy: _enemyNameSafe(d) })}`);
  _recordOutcome(d, 'win');
  saveState();
  _renderAll();
}

function _recordLoss() {
  const { SVG_SKULL, _appendLog, _data, _enemyNameSafe, _recordOutcome, _renderAll, saveState, t } = getContext();

  const d = _data();
  if (!d) return;
  _appendLog(d, `${SVG_SKULL} ${t('battlesim661.log.loss', { enemy: _enemyNameSafe(d) })}`);
  _recordOutcome(d, 'loss');
  saveState();
  _renderAll();
}

// END EXTRACTED RULES
  return { _beats, _enemyName, _enemyNameSafe, _formStat, _generalStat, _resolve, _recordWin, _recordLoss };
}

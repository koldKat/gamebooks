// Combat rules and resolution; UI and persistence callbacks are injected.
export function createCombat(getContext) {
// BEGIN EXTRACTED RULES
function _pick() {
 return 1 + Math.floor(Math.random() * 12); }

function _enemyName(d) {
 return d.enemy.name.trim() || 'врагът'; }

function _enemyNameSafe(d) {
  const { _enemyName, escapeHtml } = getContext();
 return escapeHtml(_enemyName(d)); }

function _runRound() {
  const { COMBAT_TABLE, _appendLog, _checkBattleEnd, _data, _enemyNameSafe, _pick, _renderAll, saveState, t } = getContext();

  const d = _data();
  if (!d || !d.rolled || d.life <= 0 || d.enemy.life <= 0) return;
  d.roundsThisBattle++;

  const pick = _pick();
  const level = Math.max(-12, Math.min(12, d.ratio + pick));
  const row = COMBAT_TABLE[String(level)];
  _appendLog(d, t('battlesim92.log.round', { round: d.roundsThisBattle, pick, ratio: d.ratio, level }));

  if (row.enemy === 'dead') {
    d.enemy.life = 0;
  } else {
    d.enemy.life = Math.max(0, d.enemy.life + row.enemy);
  }
  if (row.player === 'dead') {
    d.life = 0;
  } else {
    d.life = Math.max(0, d.life + row.player);
  }
  _appendLog(d, t('battlesim92.log.result', {
    enemy: _enemyNameSafe(d),
    enemyLoss: row.enemy === 'dead' ? t('battlesim92.log.dead_word') : Math.abs(row.enemy),
    enemyLife: d.enemy.life, enemyLifeMax: d.enemy.lifeMax,
    playerLoss: row.player === 'dead' ? t('battlesim92.log.dead_word') : Math.abs(row.player),
    life: d.life, lifeMax: d.lifeInitial,
  }));

  _checkBattleEnd(d);
  saveState();
  _renderAll();
}

function _checkBattleEnd(d) {
  const { SVG_SKULL, SVG_TROPHY, _appendLog, _enemyNameSafe, _recordOutcome, t } = getContext();

  if (d.enemy.life <= 0) {
    _appendLog(d, t('battlesim92.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
  } else if (d.life <= 0) {
    _appendLog(d, t('battlesim92.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
  }
}

function _resetBattle() {
  const { _appendLog, _data, _enemyNameSafe, _renderAll, saveState, t } = getContext();

  const d = _data();
  if (!d) return;
  d.roundsThisBattle = 0;
  d.enemy.life = d.enemy.lifeMax;
  d.life = d.lifeInitial;
  if (d.log.length) _appendLog(d, t('battlesim92.log.reset_sep'));
  _appendLog(d, t('battlesim92.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}

// END EXTRACTED RULES
  return { _pick, _enemyName, _enemyNameSafe, _runRound, _checkBattleEnd, _resetBattle };
}

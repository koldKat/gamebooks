// Combat rules and resolution; UI and persistence callbacks are injected.
export function createCombat(getContext) {
// BEGIN EXTRACTED RULES
function _roll1d6() {
 return 1 + Math.floor(Math.random() * 6); }

function _enemyName(d) {
  const { t } = getContext();
 return d.enemy.name.trim() || t('battlesim.default_enemy'); }

function _enemyNameSafe(d) {
  const { _enemyName, escapeHtml } = getContext();
 return escapeHtml(_enemyName(d)); }

function _runRound() {
  const { SVG_SKULL, SVG_TROPHY, _appendLog, _data, _enemyNameSafe, _notReady, _recordOutcome, _renderAll, _roll1d6, saveState, t } = getContext();

  const d = _data();
  if (!d || _notReady(d) || d.player.life <= 0 || d.enemy.life <= 0) return;
  d.roundsThisBattle++;

  const myRoll = _roll1d6();
  const theirRoll = _roll1d6();
  const result = (myRoll - theirRoll) + (d.player.skillDelta || 0);
  _appendLog(d, t('battlesim740.log.round', { round: d.roundsThisBattle, myRoll, theirRoll, result }));

  if (result === 0) {
    _appendLog(d, t('battlesim740.log.tie'));
  } else if (result > 0) {
    d.enemy.life = Math.max(0, d.enemy.life - result);
    _appendLog(d, t('battlesim740.log.you_wound', { enemy: _enemyNameSafe(d), n: result, life: d.enemy.life, lifeMax: d.enemy.lifeMax }));
  } else {
    const n = Math.abs(result);
    d.player.life = Math.max(0, d.player.life - n);
    _appendLog(d, t('battlesim740.log.enemy_wounds', { enemy: _enemyNameSafe(d), n, life: d.player.life, lifeMax: d.player.lifeInitial }));
  }

  if (d.enemy.life <= 0) {
    _appendLog(d, t('battlesim740.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
  } else if (d.player.life <= 0) {
    _appendLog(d, t('battlesim740.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
  }

  saveState();
  _renderAll();
}

function _resetBattle() {
  const { _appendLog, _data, _enemyNameSafe, _renderAll, saveState, t } = getContext();

  const d = _data();
  if (!d) return;
  d.enemy.life = d.enemy.lifeMax;
  d.player.life = d.player.lifeInitial;
  d.roundsThisBattle = 0;
  if (d.log.length) _appendLog(d, t('battlesim740.log.reset_sep'));
  _appendLog(d, t('battlesim740.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}


// END EXTRACTED RULES
  return { _roll1d6, _enemyName, _enemyNameSafe, _runRound, _resetBattle };
}

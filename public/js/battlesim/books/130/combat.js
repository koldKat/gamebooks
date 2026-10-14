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
  const { WOUND_DMG, _appendLog, _checkBattleEnd, _data, _enemyNameSafe, _pick, _renderAll, saveState, t } = getContext();

  const d = _data();
  if (!d || !d.rolled || d.life <= 0 || d.enemy.life <= 0) return;
  d.roundsThisBattle++;

  const yourPick = _pick();
  const enemyPick = _pick();
  const yourTotal = yourPick + d.strength;
  const enemyTotal = enemyPick + d.enemy.strength;
  _appendLog(d, t('battlesim130.log.round', { round: d.roundsThisBattle, yourPick, strength: d.strength, yourTotal, enemy: _enemyNameSafe(d), enemyPick, enemyStrength: d.enemy.strength, enemyTotal }));

  if (yourTotal > enemyTotal) {
    d.enemy.life = Math.max(0, d.enemy.life - WOUND_DMG);
    _appendLog(d, t('battlesim130.log.you_hit', { enemy: _enemyNameSafe(d), n: WOUND_DMG, life: d.enemy.life, lifeMax: d.enemy.lifeMax }));
  } else if (enemyTotal > yourTotal) {
    d.life = Math.max(0, d.life - WOUND_DMG);
    _appendLog(d, t('battlesim130.log.enemy_hits', { n: WOUND_DMG, life: d.life, lifeMax: d.lifeInitial }));
  } else {
    _appendLog(d, t('battlesim130.log.tie'));
  }

  _checkBattleEnd(d);
  saveState();
  _renderAll();
}

function _checkBattleEnd(d) {
  const { SVG_SKULL, SVG_TROPHY, _appendLog, _enemyNameSafe, _recordOutcome, t } = getContext();

  if (d.enemy.life <= 0) {
    _appendLog(d, t('battlesim130.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
  } else if (d.life <= 0) {
    _appendLog(d, t('battlesim130.log.fallen', { skull: SVG_SKULL }));
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
  if (d.log.length) _appendLog(d, t('battlesim130.log.reset_sep'));
  _appendLog(d, t('battlesim130.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}


// END EXTRACTED RULES
  return { _pick, _enemyName, _enemyNameSafe, _runRound, _checkBattleEnd, _resetBattle };
}
